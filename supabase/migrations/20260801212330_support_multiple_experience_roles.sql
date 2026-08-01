create or replace function public.create_own_profile_experience_v2(
  p_organization_name text,
  p_organization_id bigint,
  p_starts_on date,
  p_ends_on date,
  p_description text,
  p_roles jsonb
)
returns bigint
language plpgsql
volatile
security invoker
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  item jsonb;
  new_experience_id bigint;
  role_starts_on date;
  role_ends_on date;
  role_sort_order integer := 0;
  role_team_name text;
  role_title text;
begin
  if jsonb_typeof(coalesce(p_roles, '[]'::jsonb)) <> 'array' then
    raise exception using errcode = 'P0001', message = 'invalid_experience_roles';
  end if;

  select public.create_own_profile_experience(
    p_organization_name,
    p_organization_id,
    null,
    null,
    p_starts_on,
    p_ends_on,
    p_description
  ) into new_experience_id;

  for item in
    select value
    from jsonb_array_elements(coalesce(p_roles, '[]'::jsonb))
  loop
    role_team_name := nullif(btrim(item ->> 'teamName'), '');
    role_title := nullif(btrim(item ->> 'roleTitle'), '');
    role_starts_on := nullif(item ->> 'startsOn', '')::date;
    role_ends_on := nullif(item ->> 'endsOn', '')::date;

    if (role_team_name is null and role_title is null)
      or char_length(coalesce(role_team_name, '')) > 160
      or char_length(coalesce(role_title, '')) > 160
      or (role_starts_on is not null and role_ends_on is not null and role_ends_on < role_starts_on)
    then
      raise exception using errcode = 'P0001', message = 'invalid_experience_role';
    end if;

    insert into public.profile_experience_roles (
      experience_id,
      team_name,
      role_title,
      starts_on,
      ends_on,
      sort_order
    ) values (
      new_experience_id,
      role_team_name,
      role_title,
      role_starts_on,
      role_ends_on,
      role_sort_order
    );
    role_sort_order := role_sort_order + 1;
  end loop;

  return new_experience_id;
end;
$$;

revoke all on function public.create_own_profile_experience_v2(
  text, bigint, date, date, text, jsonb
) from public, anon;
grant execute on function public.create_own_profile_experience_v2(
  text, bigint, date, date, text, jsonb
) to authenticated;

create or replace function public.save_own_profile_v3(
  p_expected_people_updated_at timestamptz,
  p_phone_number text,
  p_field_of_study text,
  p_study_year smallint,
  p_linkedin_url text,
  p_avatar_path text,
  p_avatar_alt text,
  p_experiences jsonb,
  p_roles jsonb,
  p_new_roles jsonb
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
  item jsonb;
  parent_experience_id bigint;
  role_starts_on date;
  role_ends_on date;
  role_team_name text;
  role_title text;
  saved_at timestamptz;
begin
  if jsonb_typeof(coalesce(p_new_roles, '[]'::jsonb)) <> 'array' then
    raise exception using errcode = 'P0001', message = 'invalid_experience_roles';
  end if;

  saved_at := public.save_own_profile_v2(
    p_expected_people_updated_at,
    p_phone_number,
    p_field_of_study,
    p_study_year,
    p_linkedin_url,
    p_avatar_path,
    p_avatar_alt,
    p_experiences,
    p_roles
  );

  caller_person_id := (select private.current_person_id());

  for item in
    select value
    from jsonb_array_elements(coalesce(p_new_roles, '[]'::jsonb))
  loop
    parent_experience_id := (item ->> 'experienceId')::bigint;
    role_team_name := nullif(btrim(item ->> 'teamName'), '');
    role_title := nullif(btrim(item ->> 'roleTitle'), '');
    role_starts_on := nullif(item ->> 'startsOn', '')::date;
    role_ends_on := nullif(item ->> 'endsOn', '')::date;

    if not exists (
      select 1
      from public.profile_experiences as experience
      where experience.id = parent_experience_id
        and experience.person_id = caller_person_id
    )
      or (role_team_name is null and role_title is null)
      or char_length(coalesce(role_team_name, '')) > 160
      or char_length(coalesce(role_title, '')) > 160
      or (role_starts_on is not null and role_ends_on is not null and role_ends_on < role_starts_on)
    then
      raise exception using errcode = 'P0001', message = 'invalid_experience_role';
    end if;

    insert into public.profile_experience_roles (
      experience_id,
      team_name,
      role_title,
      starts_on,
      ends_on,
      sort_order
    ) values (
      parent_experience_id,
      role_team_name,
      role_title,
      role_starts_on,
      role_ends_on,
      coalesce((item ->> 'sortOrder')::integer, 0)
    );
  end loop;

  return saved_at;
end;
$$;

revoke all on function public.save_own_profile_v3(
  timestamptz, text, text, smallint, text, text, text, jsonb, jsonb, jsonb
) from public, anon;
grant execute on function public.save_own_profile_v3(
  timestamptz, text, text, smallint, text, text, text, jsonb, jsonb, jsonb
) to authenticated;
