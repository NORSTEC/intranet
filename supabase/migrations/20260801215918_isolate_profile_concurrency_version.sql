begin;

alter table public.people
  add column profile_updated_at timestamptz;

update public.people
set profile_updated_at = updated_at;

alter table public.people
  alter column profile_updated_at set default now(),
  alter column profile_updated_at set not null;

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
    new.avatar_alt
  ) is distinct from row(
    old.phone_number,
    old.field_of_study,
    old.study_year,
    old.linkedin_url,
    old.avatar_path,
    old.avatar_alt
  ) then
    new.profile_updated_at = now();
  end if;
  return new;
end;
$$;

revoke all on function private.set_profile_updated_at() from public, anon, authenticated;

create trigger people_set_profile_updated_at
before update of phone_number, field_of_study, study_year, linkedin_url, avatar_path, avatar_alt
on public.people
for each row execute function private.set_profile_updated_at();

create or replace function public.save_own_profile_v5(
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
  current_profile_updated_at timestamptz;
  current_people_updated_at timestamptz;
begin
  caller_person_id := (select private.current_person_id());
  if caller_person_id is null then
    raise exception using errcode = 'P0001', message = 'profile_not_found';
  end if;

  select person.profile_updated_at, person.updated_at
  into current_profile_updated_at, current_people_updated_at
  from public.people as person
  where person.id = caller_person_id
  for update;

  if current_profile_updated_at is distinct from p_expected_profile_updated_at then
    raise exception using errcode = 'P0001', message = 'profile_conflict';
  end if;

  perform public.save_own_profile_v4(
    current_people_updated_at,
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

  select person.profile_updated_at
  into current_profile_updated_at
  from public.people as person
  where person.id = caller_person_id;

  return current_profile_updated_at;
end;
$$;

revoke all on function public.save_own_profile_v5(
  timestamptz, text, text, smallint, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb
) from public, anon;
grant execute on function public.save_own_profile_v5(
  timestamptz, text, text, smallint, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb
) to authenticated;

commit;
