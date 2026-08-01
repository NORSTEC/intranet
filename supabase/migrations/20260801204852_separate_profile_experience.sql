begin;

create table public.profile_experiences (
  id bigint generated always as identity primary key,
  person_id bigint not null references public.people (id) on delete cascade,
  organization_id bigint references public.organizations (id) on delete set null,
  membership_id bigint unique references public.memberships (id) on delete set null,
  organization_name text not null,
  description text,
  starts_on date,
  ends_on date,
  source text not null default 'user',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_experiences_organization_name_check
    check (char_length(btrim(organization_name)) between 1 and 160),
  constraint profile_experiences_description_check
    check (description is null or char_length(description) <= 2000),
  constraint profile_experiences_dates_check
    check (ends_on is null or starts_on is null or ends_on >= starts_on),
  constraint profile_experiences_source_check
    check (source in ('membership_default', 'migrated', 'user'))
);

create index profile_experiences_person_visible_idx
  on public.profile_experiences (person_id, starts_on desc)
  where archived_at is null;
create index profile_experiences_organization_id_idx
  on public.profile_experiences (organization_id)
  where organization_id is not null;

create table public.profile_experience_roles (
  id bigint generated always as identity primary key,
  experience_id bigint not null
    references public.profile_experiences (id) on delete cascade,
  team_id bigint references public.teams (id) on delete set null,
  team_membership_id bigint unique
    references public.team_memberships (id) on delete set null,
  team_name text,
  role_title text,
  starts_on date,
  ends_on date,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_experience_roles_team_name_check
    check (team_name is null or char_length(btrim(team_name)) between 1 and 160),
  constraint profile_experience_roles_role_title_check
    check (role_title is null or char_length(btrim(role_title)) between 1 and 160),
  constraint profile_experience_roles_content_check
    check (team_name is not null or role_title is not null),
  constraint profile_experience_roles_dates_check
    check (ends_on is null or starts_on is null or ends_on >= starts_on),
  constraint profile_experience_roles_sort_order_check check (sort_order >= 0)
);

create index profile_experience_roles_experience_visible_idx
  on public.profile_experience_roles (experience_id, sort_order, starts_on desc)
  where archived_at is null;
create index profile_experience_roles_team_id_idx
  on public.profile_experience_roles (team_id)
  where team_id is not null;

create trigger profile_experiences_set_updated_at
before update on public.profile_experiences
for each row execute function private.set_updated_at();

create trigger profile_experience_roles_set_updated_at
before update on public.profile_experience_roles
for each row execute function private.set_updated_at();

-- Preserve everything currently visible on profiles before disconnecting it
-- from authoritative memberships and team assignments.
insert into public.profile_experiences (
  person_id,
  organization_id,
  membership_id,
  organization_name,
  starts_on,
  ends_on,
  source
)
select
  membership.person_id,
  membership.organization_id,
  membership.id,
  organization.name,
  membership.starts_on,
  membership.ends_on,
  'membership_default'
from public.memberships as membership
join public.organizations as organization on organization.id = membership.organization_id
where membership.status in ('active', 'ended')
on conflict (membership_id) do nothing;

insert into public.profile_experience_roles (
  experience_id,
  team_id,
  team_membership_id,
  team_name,
  role_title,
  starts_on,
  ends_on,
  sort_order,
  archived_at
)
select
  experience.id,
  team.id,
  team_membership.id,
  team.name,
  team_membership.role_title,
  team_membership.starts_on,
  team_membership.ends_on,
  team_membership.sort_order,
  team_membership.archived_at
from public.team_memberships as team_membership
join public.teams as team on team.id = team_membership.team_id
join public.profile_experiences as experience
  on experience.person_id = team_membership.person_id
 and experience.organization_id = team.organization_id
on conflict (team_membership_id) do nothing;

-- Retain any rows created by the short-lived approval workflow for recovery
-- and audit purposes, but disable all further use of that workflow.
revoke execute on function public.submit_historical_membership_request(
  bigint, bigint, text, date, date, text
) from authenticated;
revoke execute on function public.review_historical_membership_request(
  bigint, text, text
) from authenticated;

alter table public.profile_experiences enable row level security;
alter table public.profile_experience_roles enable row level security;

create policy profile_experiences_portal_read
on public.profile_experiences
for select
to authenticated
using (
  person_id = (select private.current_person_id())
  or (
    archived_at is null
    and (select private.is_portal_member())
  )
);

create policy profile_experiences_self_insert
on public.profile_experiences
for insert
to authenticated
with check (
  person_id = (select private.current_person_id())
  and membership_id is null
  and source = 'user'
);

create policy profile_experiences_self_update
on public.profile_experiences
for update
to authenticated
using (person_id = (select private.current_person_id()))
with check (person_id = (select private.current_person_id()));

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
        or (
          experience.archived_at is null
          and public.profile_experience_roles.archived_at is null
          and (select private.is_portal_member())
        )
      )
  )
);

create policy profile_experience_roles_self_insert
on public.profile_experience_roles
for insert
to authenticated
with check (
  team_membership_id is null
  and exists (
    select 1 from public.profile_experiences as experience
    where experience.id = experience_id
      and experience.person_id = (select private.current_person_id())
  )
);

create policy profile_experience_roles_self_update
on public.profile_experience_roles
for update
to authenticated
using (
  exists (
    select 1 from public.profile_experiences as experience
    where experience.id = experience_id
      and experience.person_id = (select private.current_person_id())
  )
)
with check (
  exists (
    select 1 from public.profile_experiences as experience
    where experience.id = experience_id
      and experience.person_id = (select private.current_person_id())
  )
);

revoke all on public.profile_experiences from anon, authenticated;
revoke all on public.profile_experience_roles from anon, authenticated;
grant select, insert on public.profile_experiences to authenticated;
grant update (
  organization_id,
  organization_name,
  description,
  starts_on,
  ends_on,
  archived_at
) on public.profile_experiences to authenticated;
grant select, insert on public.profile_experience_roles to authenticated;
grant update (
  team_id,
  team_name,
  role_title,
  starts_on,
  ends_on,
  sort_order,
  archived_at
) on public.profile_experience_roles to authenticated;
grant usage, select on sequence public.profile_experiences_id_seq to authenticated;
grant usage, select on sequence public.profile_experience_roles_id_seq to authenticated;
grant all on public.profile_experiences to service_role;
grant all on public.profile_experience_roles to service_role;
grant usage, select on sequence public.profile_experiences_id_seq to service_role;
grant usage, select on sequence public.profile_experience_roles_id_seq to service_role;

create or replace function public.create_own_profile_experience(
  p_organization_name text,
  p_organization_id bigint,
  p_team_name text,
  p_role_title text,
  p_starts_on date,
  p_ends_on date,
  p_description text
)
returns bigint
language plpgsql
volatile
security invoker
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  caller_person_id bigint;
  matched_organization_id bigint;
  new_experience_id bigint;
begin
  caller_person_id := (select private.current_person_id());
  if caller_person_id is null or not (select private.is_portal_member()) then
    raise exception using errcode = '42501', message = 'portal_access_required';
  end if;
  if char_length(btrim(coalesce(p_organization_name, ''))) not between 1 and 160
    or (p_description is not null and char_length(p_description) > 2000)
    or (p_ends_on is not null and p_starts_on is not null and p_ends_on < p_starts_on)
    or (p_team_name is not null and char_length(btrim(p_team_name)) not between 1 and 160)
    or (p_role_title is not null and char_length(btrim(p_role_title)) not between 1 and 160)
  then
    raise exception using errcode = 'P0001', message = 'invalid_experience';
  end if;

  select organization.id into matched_organization_id
  from public.organizations as organization
  where organization.id = p_organization_id
    and organization.name = btrim(p_organization_name)
    and organization.status = 'active';

  insert into public.profile_experiences (
    person_id, organization_id, organization_name, description,
    starts_on, ends_on, source
  ) values (
    caller_person_id, matched_organization_id, btrim(p_organization_name),
    nullif(btrim(p_description), ''), p_starts_on, p_ends_on, 'user'
  ) returning id into new_experience_id;

  if nullif(btrim(p_team_name), '') is not null
    or nullif(btrim(p_role_title), '') is not null
  then
    insert into public.profile_experience_roles (
      experience_id, team_name, role_title, starts_on, ends_on
    ) values (
      new_experience_id,
      nullif(btrim(p_team_name), ''),
      nullif(btrim(p_role_title), ''),
      p_starts_on,
      p_ends_on
    );
  end if;

  return new_experience_id;
end;
$$;

revoke all on function public.create_own_profile_experience(
  text, bigint, text, text, date, date, text
) from public, anon;
grant execute on function public.create_own_profile_experience(
  text, bigint, text, text, date, date, text
) to authenticated;

create or replace function public.save_own_profile_v2(
  p_expected_people_updated_at timestamptz,
  p_phone_number text,
  p_field_of_study text,
  p_study_year smallint,
  p_linkedin_url text,
  p_avatar_path text,
  p_avatar_alt text,
  p_experiences jsonb,
  p_roles jsonb
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
  expected_updated_at timestamptz;
  matched_organization_id bigint;
  saved_at timestamptz;
begin
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
  join public.profile_experiences as experience
    on experience.id = experience_role.experience_id
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
        ends_on = nullif(item ->> 'endsOn', '')::date,
        archived_at = case
          when coalesce((item ->> 'archived')::boolean, false)
            then coalesce(archived_at, now())
          else null
        end
    where id = target_id and person_id = caller_person_id;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_roles, '[]'::jsonb))
  loop
    target_id := (item ->> 'id')::bigint;
    expected_updated_at := (item ->> 'expectedUpdatedAt')::timestamptz;

    select experience_role.updated_at into current_row_updated_at
    from public.profile_experience_roles as experience_role
    join public.profile_experiences as experience
      on experience.id = experience_role.experience_id
    where experience_role.id = target_id and experience.person_id = caller_person_id;
    if not found then
      raise exception using errcode = 'P0001', message = 'invalid_experience_role';
    end if;
    if current_row_updated_at is distinct from expected_updated_at then
      raise exception using errcode = 'P0001', message = 'profile_conflict';
    end if;
    if char_length(coalesce(item ->> 'teamName', '')) > 160
      or char_length(coalesce(item ->> 'roleTitle', '')) > 160
      or (
        nullif(btrim(item ->> 'teamName'), '') is null
        and nullif(btrim(item ->> 'roleTitle'), '') is null
      )
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
        team_name = nullif(btrim(item ->> 'teamName'), ''),
        role_title = nullif(btrim(item ->> 'roleTitle'), ''),
        starts_on = nullif(item ->> 'startsOn', '')::date,
        ends_on = nullif(item ->> 'endsOn', '')::date,
        archived_at = case
          when coalesce((item ->> 'archived')::boolean, false)
            then coalesce(experience_role.archived_at, now())
          else null
        end
    from public.profile_experiences as experience
    where experience_role.id = target_id
      and experience.id = experience_role.experience_id
      and experience.person_id = caller_person_id;
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

revoke all on function public.save_own_profile_v2(
  timestamptz, text, text, smallint, text, text, text, jsonb, jsonb
) from public, anon;
grant execute on function public.save_own_profile_v2(
  timestamptz, text, text, smallint, text, text, text, jsonb, jsonb
) to authenticated;

create or replace function private.create_default_profile_experience()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status not in ('active', 'ended') then
    return new;
  end if;

  insert into public.profile_experiences (
    person_id,
    organization_id,
    membership_id,
    organization_name,
    starts_on,
    ends_on,
    source
  )
  select
    new.person_id,
    new.organization_id,
    new.id,
    organization.name,
    new.starts_on,
    new.ends_on,
    'membership_default'
  from public.organizations as organization
  where organization.id = new.organization_id
  on conflict (membership_id) do nothing;

  return new;
end;
$$;

drop trigger if exists memberships_create_default_profile_experience
on public.memberships;
create trigger memberships_create_default_profile_experience
after insert or update of status on public.memberships
for each row execute function private.create_default_profile_experience();

revoke all on function private.create_default_profile_experience()
from public, anon, authenticated;

commit;
