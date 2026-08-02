begin;

-- Offboarding must never depend on a personal or organization email still
-- being available. An email is required only when a membership becomes active.
create or replace function private.require_member_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active'
    and not exists (
      select 1
      from public.person_emails as person_email
      where person_email.person_id = new.person_id
    )
  then
    raise exception using
      errcode = '23514',
      message = 'membership_email_required';
  end if;

  return new;
end;
$$;

revoke all on function private.require_member_email() from public, anon, authenticated;

commit;
