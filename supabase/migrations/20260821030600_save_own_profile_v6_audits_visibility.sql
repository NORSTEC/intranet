begin;

-- save_own_profile_v6's explicit-visibility overload previously wrote
-- people.directory_visible directly, bypassing the audit trail that
-- set_own_directory_visibility records. Route the change through the
-- audited path instead so every visibility change is logged regardless
-- of which RPC triggered it.
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

  perform public.set_own_directory_visibility(p_directory_visible);

  select person.profile_updated_at
  into saved_at
  from public.people as person
  where person.id = caller_person_id;

  return saved_at;
end;
$$;

commit;
