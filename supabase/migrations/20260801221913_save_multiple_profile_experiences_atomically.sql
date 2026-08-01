begin;

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
security invoker
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  item jsonb;
  saved_at timestamptz;
begin
  if jsonb_typeof(coalesce(p_new_experiences, '[]'::jsonb)) <> 'array' then
    raise exception using errcode = 'P0001', message = 'invalid_experience';
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

  return saved_at;
end;
$$;

revoke all on function public.save_own_profile_v6(
  timestamptz, text, text, smallint, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) from public, anon;
grant execute on function public.save_own_profile_v6(
  timestamptz, text, text, smallint, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) to authenticated;

commit;
