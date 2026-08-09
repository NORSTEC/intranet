begin;

alter table public.people
  add column directory_visible boolean not null default true;

comment on column public.people.directory_visible is
  'False hides the person and their directory relationships from ordinary members. The person and authorized administrators retain access.';

create or replace function private.person_is_directory_visible(
  target_person_id bigint
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select person.directory_visible
    from public.people as person
    where person.id = target_person_id
      and person.deleted_at is null
      and person.portal_access_status = 'active'
  ), false);
$$;

revoke all on function private.person_is_directory_visible(bigint)
  from public, anon, authenticated;

create or replace function private.is_portal_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.people as person
    where person.id = (select private.current_person_id())
      and person.portal_access_status = 'active'
      and person.deleted_at is null
      and (
        person.alumni_access_granted_at is not null
        or exists (
          select 1
          from public.memberships as membership
          where membership.person_id = person.id
            and membership.status in ('active', 'ended')
        )
      )
  );
$$;

revoke all on function private.is_portal_member() from public, anon;
grant execute on function private.is_portal_member() to authenticated;

create or replace function private.can_manage_person(target_person_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_person_id = (select private.current_person_id())
    or (select private.is_portal_admin())
    or exists (
      select 1
      from public.memberships as target_membership
      where target_membership.person_id = target_person_id
        and (select private.is_organization_admin(
          target_membership.organization_id
        ))
    )
    or exists (
      select 1
      from public.access_requests as request
      where request.person_id = target_person_id
        and request.status = 'pending'
        and request.organization_id is not null
        and (select private.is_organization_admin(request.organization_id))
    );
$$;

revoke all on function private.can_manage_person(bigint) from public, anon;
grant execute on function private.can_manage_person(bigint) to authenticated;

create or replace function private.can_view_person(target_person_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select private.can_manage_person(target_person_id))
    or (
      (select private.is_portal_member())
      and (select private.person_is_directory_visible(target_person_id))
      and (
        exists (
          select 1
          from public.memberships as target_membership
          where target_membership.person_id = target_person_id
            and target_membership.status in ('active', 'ended')
        )
        or exists (
          select 1
          from public.people as target_person
          where target_person.id = target_person_id
            and target_person.alumni_access_granted_at is not null
            and target_person.portal_access_status = 'active'
            and target_person.deleted_at is null
        )
      )
    );
$$;

revoke all on function private.can_view_person(bigint) from public, anon;
grant execute on function private.can_view_person(bigint) to authenticated;

drop policy if exists memberships_authorized_read on public.memberships;
create policy memberships_authorized_read
on public.memberships
for select
to authenticated
using (
  person_id = (select private.current_person_id())
  or (select private.is_portal_admin())
  or (select private.is_organization_admin(organization_id))
  or (
    (select private.is_portal_member())
    and status in ('active', 'ended')
    and (select private.can_view_person(person_id))
  )
);

drop policy if exists team_memberships_portal_member_read
  on public.team_memberships;
create policy team_memberships_portal_member_read
on public.team_memberships
for select
to authenticated
using (
  person_id = (select private.current_person_id())
  or (select private.can_manage_person(person_id))
  or (
    (select private.is_portal_member())
    and (select private.can_view_person(person_id))
  )
);

drop policy if exists membership_periods_authorized_read
  on public.membership_periods;
create policy membership_periods_authorized_read
on public.membership_periods
for select
to authenticated
using (
  exists (
    select 1
    from public.memberships as membership
    where membership.id = membership_id
      and (
        membership.person_id = (select private.current_person_id())
        or (select private.is_portal_admin())
        or (select private.is_organization_admin(
          membership.organization_id
        ))
        or (
          (select private.is_portal_member())
          and membership.status in ('active', 'ended')
          and (select private.can_view_person(membership.person_id))
        )
      )
  )
);

drop policy if exists profile_experiences_portal_read
  on public.profile_experiences;
create policy profile_experiences_portal_read
on public.profile_experiences
for select
to authenticated
using ((select private.can_view_person(person_id)));

drop policy if exists profile_experience_roles_portal_read
  on public.profile_experience_roles;
create policy profile_experience_roles_portal_read
on public.profile_experience_roles
for select
to authenticated
using (
  exists (
    select 1
    from public.profile_experiences as experience
    where experience.id = experience_id
      and (select private.can_view_person(experience.person_id))
  )
);

-- Directory visibility participates in the same optimistic concurrency token
-- as the rest of the profile.
create or replace function private.set_profile_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if row(
    new.phone_number,
    new.field_of_study,
    new.study_year,
    new.linkedin_url,
    new.avatar_path,
    new.avatar_alt,
    new.directory_visible
  ) is distinct from row(
    old.phone_number,
    old.field_of_study,
    old.study_year,
    old.linkedin_url,
    old.avatar_path,
    old.avatar_alt,
    old.directory_visible
  ) then
    new.profile_updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists people_set_profile_updated_at on public.people;
create trigger people_set_profile_updated_at
before update of phone_number, field_of_study, study_year, linkedin_url,
  avatar_path, avatar_alt, directory_visible
on public.people
for each row execute function private.set_profile_updated_at();

create or replace function public.save_own_profile_v6(
  p_expected_profile_updated_at timestamptz,
  p_phone_number text,
  p_field_of_study text,
  p_study_year smallint,
  p_linkedin_url text,
  p_avatar_path text,
  p_avatar_alt text,
  p_experiences jsonb,
  p_roles jsonb,
  p_new_roles jsonb,
  p_new_experiences jsonb,
  p_deleted_experiences jsonb,
  p_deleted_roles jsonb,
  p_directory_visible boolean
)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  caller_person_id bigint;
  item jsonb;
  saved_at timestamptz;
begin
  caller_person_id := (select private.current_person_id());

  perform 1
  from public.people as person
  where person.id = caller_person_id
    and person.portal_access_status = 'active'
    and person.deleted_at is null
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'profile_not_active';
  end if;

  if p_directory_visible is null
    or jsonb_typeof(coalesce(p_new_experiences, '[]'::jsonb)) <> 'array'
  then
    raise exception using errcode = 'P0001', message = 'invalid_profile';
  end if;

  saved_at := public.save_own_profile_v5(
    p_expected_profile_updated_at,
    p_phone_number,
    p_field_of_study,
    p_study_year,
    p_linkedin_url,
    p_avatar_path,
    p_avatar_alt,
    p_experiences,
    p_roles,
    p_new_roles,
    p_deleted_experiences,
    p_deleted_roles
  );

  for item in
    select value
    from jsonb_array_elements(coalesce(p_new_experiences, '[]'::jsonb))
  loop
    perform public.create_own_profile_experience_v2(
      item ->> 'organizationName',
      nullif(item ->> 'organizationId', '')::bigint,
      nullif(item ->> 'startsOn', '')::date,
      nullif(item ->> 'endsOn', '')::date,
      nullif(item ->> 'description', ''),
      coalesce(item -> 'roles', '[]'::jsonb)
    );
  end loop;

  update public.people
  set directory_visible = p_directory_visible
  where id = caller_person_id
  returning profile_updated_at into saved_at;

  return saved_at;
end;
$$;

-- Keep the previous signature during the rolling application/database deploy.
-- It preserves the existing privacy choice and uses the same hardened path.
create or replace function public.save_own_profile_v6(
  p_expected_profile_updated_at timestamptz,
  p_phone_number text,
  p_field_of_study text,
  p_study_year smallint,
  p_linkedin_url text,
  p_avatar_path text,
  p_avatar_alt text,
  p_experiences jsonb,
  p_roles jsonb,
  p_new_roles jsonb,
  p_new_experiences jsonb,
  p_deleted_experiences jsonb,
  p_deleted_roles jsonb
)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  current_visibility boolean;
begin
  select person.directory_visible
  into current_visibility
  from public.people as person
  where person.id = (select private.current_person_id());

  return public.save_own_profile_v6(
    p_expected_profile_updated_at,
    p_phone_number,
    p_field_of_study,
    p_study_year,
    p_linkedin_url,
    p_avatar_path,
    p_avatar_alt,
    p_experiences,
    p_roles,
    p_new_roles,
    p_new_experiences,
    p_deleted_experiences,
    p_deleted_roles,
    current_visibility
  );
end;
$$;

revoke all on function public.save_own_profile_v6(
  timestamptz, text, text, smallint, text, text, text, jsonb, jsonb, jsonb,
  jsonb, jsonb, jsonb, boolean
) from public, anon;
grant execute on function public.save_own_profile_v6(
  timestamptz, text, text, smallint, text, text, text, jsonb, jsonb, jsonb,
  jsonb, jsonb, jsonb, boolean
) to authenticated;

revoke all on function public.save_own_profile_v6(
  timestamptz, text, text, smallint, text, text, text, jsonb, jsonb, jsonb,
  jsonb, jsonb, jsonb
) from public, anon;
grant execute on function public.save_own_profile_v6(
  timestamptz, text, text, smallint, text, text, text, jsonb, jsonb, jsonb,
  jsonb, jsonb, jsonb
) to authenticated;

revoke execute on function public.save_own_profile_v4(
  timestamptz, text, text, smallint, text, text, text, jsonb, jsonb, jsonb,
  jsonb, jsonb
) from authenticated;
revoke execute on function public.save_own_profile_v5(
  timestamptz, text, text, smallint, text, text, text, jsonb, jsonb, jsonb,
  jsonb, jsonb
) from authenticated;
revoke execute on function public.create_own_profile_experience_v2(
  text, bigint, date, date, text, jsonb
) from authenticated;
revoke execute on function public.create_own_profile_experience(
  text, bigint, text, text, date, date, text
) from authenticated;

revoke update (
  full_name, first_name, last_name, field_of_study, study_year, phone_number,
  avatar_path, avatar_alt, linkedin_url
) on public.people from authenticated;
revoke insert, delete on public.profile_experiences from authenticated;
revoke update (
  organization_id, organization_name, description, starts_on, ends_on
) on public.profile_experiences from authenticated;
revoke insert, delete on public.profile_experience_roles from authenticated;
revoke update (
  team_id, team_name, role_title, starts_on, ends_on, sort_order
) on public.profile_experience_roles from authenticated;

create or replace function public.submit_access_request(
  target_organization_id bigint,
  requested_first_name text,
  requested_last_name text,
  requested_field_of_study text,
  requested_study_year smallint,
  requested_message text,
  requested_request_type text
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  caller_person_id bigint;
  requested_first_name_value text := nullif(btrim(requested_first_name), '');
  requested_last_name_value text := nullif(btrim(requested_last_name), '');
  requested_field_value text := nullif(btrim(requested_field_of_study), '');
  request_message text := nullif(btrim(requested_message), '');
  new_request_id bigint;
begin
  caller_person_id := (select private.current_person_id());

  if caller_person_id is null or not exists (
    select 1
    from public.people as person
    where person.id = caller_person_id
      and person.portal_access_status = 'active'
      and person.deleted_at is null
  ) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if requested_request_type not in ('organization', 'alumni')
    or requested_first_name_value is null
    or char_length(requested_first_name_value) > 80
    or requested_last_name_value is null
    or char_length(requested_last_name_value) > 80
    or char_length(coalesce(request_message, '')) > 2000
    or (
      requested_study_year is not null
      and requested_study_year not between 1 and 6
    )
    or (
      requested_field_value is not null
      and requested_field_value not in (
        'Technology, Engineering and Architecture',
        'Mathematics and Natural Sciences',
        'Social Sciences and Psychology',
        'Information Technology and Informatics',
        'Economics, Management and Administration',
        'Media Studies and Communication',
        'Teacher Education and Pedagogy',
        'Humanities, Languages and Arts',
        'Health and Life Sciences',
        'Law',
        'Other'
      )
    )
  then
    raise exception using errcode = 'P0001', message = 'invalid_request';
  end if;

  if requested_request_type = 'alumni' then
    if target_organization_id is not null then
      raise exception using errcode = 'P0001', message = 'invalid_request';
    end if;

    if exists (
      select 1
      from public.people as person
      where person.id = caller_person_id
        and person.alumni_access_granted_at is not null
    ) then
      raise exception using errcode = 'P0001', message = 'access_already_granted';
    end if;
  else
    if target_organization_id is null or requested_study_year is null then
      raise exception using errcode = 'P0001', message = 'invalid_request';
    end if;

    if not exists (
      select 1
      from public.organizations as organization
      where organization.id = target_organization_id
        and organization.status = 'active'
        and organization.slug <> 'norstec'
    ) then
      raise exception using errcode = 'P0001', message = 'organization_not_found';
    end if;

    if exists (
      select 1
      from public.memberships as membership
      where membership.person_id = caller_person_id
        and membership.organization_id = target_organization_id
        and membership.status = 'active'
    ) then
      raise exception using errcode = 'P0001', message = 'membership_exists';
    end if;
  end if;

  update public.people
  set first_name = requested_first_name_value,
      last_name = requested_last_name_value,
      full_name = concat_ws(
        ' ',
        requested_first_name_value,
        requested_last_name_value
      ),
      field_of_study = requested_field_value,
      study_year = requested_study_year
  where id = caller_person_id;

  insert into public.access_requests (
    person_id,
    organization_id,
    request_type,
    field_of_study,
    study_year,
    message
  ) values (
    caller_person_id,
    target_organization_id,
    requested_request_type,
    requested_field_value,
    requested_study_year,
    request_message
  )
  returning id into new_request_id;

  return new_request_id;
end;
$$;

revoke all on function public.submit_access_request(
  bigint, text, text, text, smallint, text, text
) from public, anon;
grant execute on function public.submit_access_request(
  bigint, text, text, text, smallint, text, text
) to authenticated;

revoke insert (
  person_id, organization_id, request_type, field_of_study, study_year, message
) on public.access_requests from authenticated;

commit;
