begin;

drop policy if exists member_avatars_self_insert on storage.objects;
create policy member_avatars_self_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'member-avatars'
  and (select storage.foldername(name)) = array[
    'profiles',
    (select private.current_person_id())::text
  ]
);

drop policy if exists member_avatars_self_update on storage.objects;
create policy member_avatars_self_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'member-avatars'
  and (select storage.foldername(name)) = array[
    'profiles',
    (select private.current_person_id())::text
  ]
)
with check (
  bucket_id = 'member-avatars'
  and (select storage.foldername(name)) = array[
    'profiles',
    (select private.current_person_id())::text
  ]
);

drop policy if exists member_avatars_self_delete on storage.objects;
create policy member_avatars_self_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'member-avatars'
  and (select storage.foldername(name)) = array[
    'profiles',
    (select private.current_person_id())::text
  ]
);

grant usage, select on sequence public.team_memberships_id_seq to authenticated;

create or replace function public.save_own_profile(
  p_expected_people_updated_at timestamptz,
  p_full_name text,
  p_phone_number text,
  p_field_of_study text,
  p_study_year smallint,
  p_linkedin_url text,
  p_avatar_path text,
  p_avatar_alt text,
  p_memberships jsonb,
  p_team_memberships jsonb,
  p_new_team_memberships jsonb
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
  saved_at timestamptz;
begin
  caller_person_id := (select private.current_person_id());
  if caller_person_id is null then
    raise exception using errcode = 'P0001', message = 'profile_not_found';
  end if;

  if p_full_name is null or char_length(btrim(p_full_name)) not between 1 and 160 then
    raise exception using errcode = 'P0001', message = 'invalid_profile';
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
  from public.memberships as membership
  where membership.person_id = caller_person_id
    and membership.id in (
      select (membership_item.value ->> 'id')::bigint
      from jsonb_array_elements(coalesce(p_memberships, '[]'::jsonb))
        as membership_item(value)
    )
  order by membership.id
  for update;

  perform 1
  from public.team_memberships as team_membership
  where team_membership.person_id = caller_person_id
    and team_membership.id in (
      select (team_item.value ->> 'id')::bigint
      from jsonb_array_elements(coalesce(p_team_memberships, '[]'::jsonb))
        as team_item(value)
    )
  order by team_membership.id
  for update;

  for item in
    select value
    from jsonb_array_elements(coalesce(p_memberships, '[]'::jsonb))
  loop
    target_id := (item ->> 'id')::bigint;
    expected_updated_at := (item ->> 'expectedUpdatedAt')::timestamptz;

    select membership.updated_at
    into current_row_updated_at
    from public.memberships as membership
    where membership.id = target_id
      and membership.person_id = caller_person_id;

    if not found then
      raise exception using errcode = 'P0001', message = 'invalid_membership';
    end if;
    if current_row_updated_at is distinct from expected_updated_at then
      raise exception using errcode = 'P0001', message = 'profile_conflict';
    end if;

    update public.memberships
    set starts_on = nullif(item ->> 'startsOn', '')::date,
        ends_on = nullif(item ->> 'endsOn', '')::date
    where id = target_id
      and person_id = caller_person_id;
  end loop;

  for item in
    select value
    from jsonb_array_elements(coalesce(p_team_memberships, '[]'::jsonb))
  loop
    target_id := (item ->> 'id')::bigint;
    expected_updated_at := (item ->> 'expectedUpdatedAt')::timestamptz;

    select team_membership.updated_at
    into current_row_updated_at
    from public.team_memberships as team_membership
    where team_membership.id = target_id
      and team_membership.person_id = caller_person_id;

    if not found then
      raise exception using errcode = 'P0001', message = 'invalid_team_membership';
    end if;
    if current_row_updated_at is distinct from expected_updated_at then
      raise exception using errcode = 'P0001', message = 'profile_conflict';
    end if;

    if not coalesce((item ->> 'remove')::boolean, false)
      and char_length(btrim(coalesce(item ->> 'roleTitle', ''))) not between 1 and 160
    then
      raise exception using errcode = 'P0001', message = 'invalid_team_membership';
    end if;

    if coalesce((item ->> 'remove')::boolean, false) then
      delete from public.team_memberships
      where id = target_id
        and person_id = caller_person_id;
    else
      update public.team_memberships
      set role_title = nullif(btrim(item ->> 'roleTitle'), ''),
          starts_on = nullif(item ->> 'startsOn', '')::date,
          ends_on = nullif(item ->> 'endsOn', '')::date
      where id = target_id
        and person_id = caller_person_id;
    end if;
  end loop;

  for item in
    select value
    from jsonb_array_elements(coalesce(p_new_team_memberships, '[]'::jsonb))
  loop
    if char_length(btrim(coalesce(item ->> 'roleTitle', ''))) not between 1 and 160 then
      raise exception using errcode = 'P0001', message = 'invalid_team_membership';
    end if;

    insert into public.team_memberships (
      team_id,
      person_id,
      role_title,
      starts_on,
      ends_on
    )
    values (
      (item ->> 'teamId')::bigint,
      caller_person_id,
      nullif(btrim(item ->> 'roleTitle'), ''),
      nullif(item ->> 'startsOn', '')::date,
      nullif(item ->> 'endsOn', '')::date
    );
  end loop;

  update public.people
  set full_name = btrim(p_full_name),
      phone_number = nullif(btrim(p_phone_number), ''),
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

revoke all on function public.save_own_profile(
  timestamptz,
  text,
  text,
  text,
  smallint,
  text,
  text,
  text,
  jsonb,
  jsonb,
  jsonb
) from public, anon;
grant execute on function public.save_own_profile(
  timestamptz,
  text,
  text,
  text,
  smallint,
  text,
  text,
  text,
  jsonb,
  jsonb,
  jsonb
) to authenticated;

commit;
