-- Experience is an editable CV view, not a lifecycle record. Permanently remove
-- rows that users previously archived before removing the feature itself.
delete from public.profile_experience_roles where archived_at is not null;
delete from public.profile_experiences where archived_at is not null;

-- Older free-form entries could contain a role without a team. Keep the role,
-- place it in a neutral team, and enforce the hierarchy going forward.
update public.profile_experience_roles
set team_name = 'General'
where team_name is null;
alter table public.profile_experience_roles alter column team_name set not null;

drop policy profile_experiences_portal_read on public.profile_experiences;
drop policy profile_experience_roles_portal_read on public.profile_experience_roles;
drop index public.profile_experiences_person_visible_idx;
drop index public.profile_experience_roles_experience_visible_idx;

drop function public.save_own_profile_v3(
  timestamptz, text, text, smallint, text, text, text, jsonb, jsonb, jsonb
);
drop function public.save_own_profile_v2(
  timestamptz, text, text, smallint, text, text, text, jsonb, jsonb
);

alter table public.profile_experiences drop column archived_at;
alter table public.profile_experience_roles drop column archived_at;

create index profile_experiences_person_starts_idx
  on public.profile_experiences (person_id, starts_on desc);
create index profile_experience_roles_experience_sort_idx
  on public.profile_experience_roles (experience_id, sort_order, starts_on desc);

create policy profile_experiences_portal_read
on public.profile_experiences
for select
to authenticated
using (
  person_id = (select private.current_person_id())
  or (select private.is_portal_member())
);

create policy profile_experience_roles_portal_read
on public.profile_experience_roles
for select
to authenticated
using (
  exists (
    select 1
    from public.profile_experiences as experience
    where experience.id = experience_id
      and (
        experience.person_id = (select private.current_person_id())
        or (select private.is_portal_member())
      )
  )
);

create policy profile_experiences_self_delete
on public.profile_experiences
for delete
to authenticated
using (person_id = (select private.current_person_id()));

create policy profile_experience_roles_self_delete
on public.profile_experience_roles
for delete
to authenticated
using (
  exists (
    select 1
    from public.profile_experiences as experience
    where experience.id = experience_id
      and experience.person_id = (select private.current_person_id())
  )
);

grant delete on public.profile_experiences to authenticated;
grant delete on public.profile_experience_roles to authenticated;

create or replace function public.save_own_profile_v4(
  p_expected_people_updated_at timestamptz,
  p_phone_number text,
  p_field_of_study text,
  p_study_year smallint,
  p_linkedin_url text,
  p_avatar_path text,
  p_avatar_alt text,
  p_experiences jsonb,
  p_roles jsonb,
  p_new_roles jsonb,
  p_deleted_experiences jsonb,
  p_deleted_roles jsonb
)
returns timestamptz
language plpgsql
volatile
security invoker
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  caller_person_id bigint;
  current_people_updated_at timestamptz;
  current_avatar_path text;
  current_field_of_study text;
  current_row_updated_at timestamptz;
  item jsonb;
  target_id bigint;
  parent_experience_id bigint;
  expected_updated_at timestamptz;
  matched_organization_id bigint;
  role_starts_on date;
  role_ends_on date;
  role_team_name text;
  role_title text;
  saved_at timestamptz;
begin
  if jsonb_typeof(coalesce(p_experiences, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_roles, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_new_roles, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_deleted_experiences, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_deleted_roles, '[]'::jsonb)) <> 'array'
  then
    raise exception using errcode = 'P0001', message = 'invalid_profile';
  end if;

  caller_person_id := (select private.current_person_id());
  if caller_person_id is null then
    raise exception using errcode = 'P0001', message = 'profile_not_found';
  end if;
  if p_study_year is not null and p_study_year not between 1 and 6 then
    raise exception using errcode = 'P0001', message = 'invalid_profile';
  end if;
  if p_linkedin_url is not null and p_linkedin_url !~* '^https://([a-z0-9-]+\.)*linkedin\.com(/|$)' then
    raise exception using errcode = 'P0001', message = 'invalid_profile';
  end if;

  select person.updated_at, person.avatar_path, person.field_of_study
  into current_people_updated_at, current_avatar_path, current_field_of_study
  from public.people as person
  where person.id = caller_person_id
  for update;

  if current_people_updated_at is distinct from p_expected_people_updated_at then
    raise exception using errcode = 'P0001', message = 'profile_conflict';
  end if;
  if p_field_of_study is not null
    and p_field_of_study is distinct from current_field_of_study
    and p_field_of_study not in (
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
    ) then
    raise exception using errcode = 'P0001', message = 'invalid_profile';
  end if;
  if p_avatar_path is distinct from current_avatar_path and (
    p_avatar_path is null
    or p_avatar_path not like 'profiles/' || caller_person_id::text || '/%'
  ) then
    raise exception using errcode = 'P0001', message = 'invalid_avatar_path';
  end if;

  perform 1
  from public.profile_experiences as experience
  where experience.person_id = caller_person_id
    and experience.id in (
      select (entry.value ->> 'id')::bigint
      from jsonb_array_elements(coalesce(p_experiences, '[]'::jsonb)) as entry(value)
    )
  order by experience.id
  for update;

  perform 1
  from public.profile_experience_roles as experience_role
  join public.profile_experiences as experience on experience.id = experience_role.experience_id
  where experience.person_id = caller_person_id
    and experience_role.id in (
      select (entry.value ->> 'id')::bigint
      from jsonb_array_elements(coalesce(p_roles, '[]'::jsonb)) as entry(value)
    )
  order by experience_role.id
  for update of experience_role;

  for item in select value from jsonb_array_elements(coalesce(p_experiences, '[]'::jsonb))
  loop
    target_id := (item ->> 'id')::bigint;
    expected_updated_at := (item ->> 'expectedUpdatedAt')::timestamptz;
    select experience.updated_at into current_row_updated_at
    from public.profile_experiences as experience
    where experience.id = target_id and experience.person_id = caller_person_id;
    if not found then
      raise exception using errcode = 'P0001', message = 'invalid_experience';
    end if;
    if current_row_updated_at is distinct from expected_updated_at then
      raise exception using errcode = 'P0001', message = 'profile_conflict';
    end if;
    if char_length(btrim(coalesce(item ->> 'organizationName', ''))) not between 1 and 160
      or char_length(coalesce(item ->> 'description', '')) > 2000
      or (
        nullif(item ->> 'endsOn', '') is not null
        and nullif(item ->> 'startsOn', '') is not null
        and (item ->> 'endsOn')::date < (item ->> 'startsOn')::date
      )
    then
      raise exception using errcode = 'P0001', message = 'invalid_experience';
    end if;

    matched_organization_id := null;
    if nullif(item ->> 'organizationId', '') is not null then
      select organization.id into matched_organization_id
      from public.organizations as organization
      where organization.id = (item ->> 'organizationId')::bigint
        and organization.name = btrim(item ->> 'organizationName')
        and organization.status = 'active';
    end if;

    update public.profile_experiences
    set organization_id = matched_organization_id,
        organization_name = btrim(item ->> 'organizationName'),
        description = nullif(btrim(item ->> 'description'), ''),
        starts_on = nullif(item ->> 'startsOn', '')::date,
        ends_on = nullif(item ->> 'endsOn', '')::date
    where id = target_id and person_id = caller_person_id;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_roles, '[]'::jsonb))
  loop
    target_id := (item ->> 'id')::bigint;
    expected_updated_at := (item ->> 'expectedUpdatedAt')::timestamptz;
    select experience_role.updated_at into current_row_updated_at
    from public.profile_experience_roles as experience_role
    join public.profile_experiences as experience on experience.id = experience_role.experience_id
    where experience_role.id = target_id and experience.person_id = caller_person_id;
    if not found then
      raise exception using errcode = 'P0001', message = 'invalid_experience_role';
    end if;
    if current_row_updated_at is distinct from expected_updated_at then
      raise exception using errcode = 'P0001', message = 'profile_conflict';
    end if;
    if char_length(coalesce(item ->> 'teamName', '')) > 160
      or char_length(coalesce(item ->> 'roleTitle', '')) > 160
      or nullif(btrim(item ->> 'teamName'), '') is null
      or (
        nullif(item ->> 'endsOn', '') is not null
        and nullif(item ->> 'startsOn', '') is not null
        and (item ->> 'endsOn')::date < (item ->> 'startsOn')::date
      )
    then
      raise exception using errcode = 'P0001', message = 'invalid_experience_role';
    end if;

    update public.profile_experience_roles as experience_role
    set team_id = null,
        team_name = btrim(item ->> 'teamName'),
        role_title = nullif(btrim(item ->> 'roleTitle'), ''),
        starts_on = nullif(item ->> 'startsOn', '')::date,
        ends_on = nullif(item ->> 'endsOn', '')::date
    from public.profile_experiences as experience
    where experience_role.id = target_id
      and experience.id = experience_role.experience_id
      and experience.person_id = caller_person_id;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_deleted_roles, '[]'::jsonb))
  loop
    target_id := (item ->> 'id')::bigint;
    expected_updated_at := (item ->> 'expectedUpdatedAt')::timestamptz;
    delete from public.profile_experience_roles as experience_role
    using public.profile_experiences as experience
    where experience_role.id = target_id
      and experience.id = experience_role.experience_id
      and experience.person_id = caller_person_id
      and experience_role.updated_at = expected_updated_at;
    if not found then
      raise exception using errcode = 'P0001', message = 'profile_conflict';
    end if;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_deleted_experiences, '[]'::jsonb))
  loop
    target_id := (item ->> 'id')::bigint;
    expected_updated_at := (item ->> 'expectedUpdatedAt')::timestamptz;
    delete from public.profile_experiences
    where id = target_id
      and person_id = caller_person_id
      and updated_at = expected_updated_at;
    if not found then
      raise exception using errcode = 'P0001', message = 'profile_conflict';
    end if;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_new_roles, '[]'::jsonb))
  loop
    parent_experience_id := (item ->> 'experienceId')::bigint;
    role_team_name := nullif(btrim(item ->> 'teamName'), '');
    role_title := nullif(btrim(item ->> 'roleTitle'), '');
    role_starts_on := nullif(item ->> 'startsOn', '')::date;
    role_ends_on := nullif(item ->> 'endsOn', '')::date;
    if not exists (
      select 1 from public.profile_experiences as experience
      where experience.id = parent_experience_id and experience.person_id = caller_person_id
    )
      or role_team_name is null
      or char_length(role_team_name) > 160
      or char_length(coalesce(role_title, '')) > 160
      or (role_starts_on is not null and role_ends_on is not null and role_ends_on < role_starts_on)
    then
      raise exception using errcode = 'P0001', message = 'invalid_experience_role';
    end if;
    insert into public.profile_experience_roles (
      experience_id, team_name, role_title, starts_on, ends_on, sort_order
    ) values (
      parent_experience_id, role_team_name, role_title, role_starts_on, role_ends_on,
      coalesce((item ->> 'sortOrder')::integer, 0)
    );
  end loop;

  update public.people
  set phone_number = nullif(btrim(p_phone_number), ''),
      field_of_study = nullif(btrim(p_field_of_study), ''),
      study_year = p_study_year,
      linkedin_url = nullif(btrim(p_linkedin_url), ''),
      avatar_path = p_avatar_path,
      avatar_alt = p_avatar_alt
  where id = caller_person_id
  returning updated_at into saved_at;
  return saved_at;
end;
$$;

revoke all on function public.save_own_profile_v4(
  timestamptz, text, text, smallint, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb
) from public, anon;
grant execute on function public.save_own_profile_v4(
  timestamptz, text, text, smallint, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb
) to authenticated;
