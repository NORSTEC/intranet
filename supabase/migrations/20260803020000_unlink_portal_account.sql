begin;

-- A member who linked an alternative Google account must be able to undo that
-- link from their own profile. Unlinking removes the portal account row and
-- the email it contributed; the Google user itself is left alone, so signing
-- in with it again provisions a fresh, empty profile.
create or replace function public.unlink_own_portal_account(p_auth_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  caller_auth_user_id uuid := (select auth.uid());
  caller_person_id bigint;
  target_email text;
begin
  if caller_auth_user_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;

  if p_auth_user_id is null or p_auth_user_id = caller_auth_user_id then
    raise exception using errcode = 'P0001', message = 'cannot_unlink_current_account';
  end if;

  select account.person_id
  into caller_person_id
  from public.portal_accounts as account
  join public.people as person on person.id = account.person_id
  where account.auth_user_id = caller_auth_user_id
    and person.portal_access_status = 'active';

  if caller_person_id is null then
    raise exception using errcode = '42501', message = 'portal_access_required';
  end if;

  select account.account_email
  into target_email
  from public.portal_accounts as account
  where account.auth_user_id = p_auth_user_id
    and account.person_id = caller_person_id
  for update;

  if target_email is null then
    raise exception using errcode = 'P0001', message = 'portal_account_not_found';
  end if;

  if (
    select count(*)
    from public.portal_accounts as account
    where account.person_id = caller_person_id
  ) < 2 then
    raise exception using errcode = 'P0001', message = 'last_portal_account';
  end if;

  if exists (
    select 1
    from public.person_emails as person_email
    where person_email.person_id = caller_person_id
      and person_email.email = target_email
      and person_email.is_primary
  ) then
    raise exception using errcode = 'P0001', message = 'cannot_unlink_primary_account';
  end if;

  delete from public.portal_accounts
  where auth_user_id = p_auth_user_id;

  delete from public.person_emails
  where person_id = caller_person_id
    and email = target_email;

  insert into public.audit_events (
    actor_person_id,
    action,
    target_person_id,
    organization_id,
    details
  ) values (
    caller_person_id,
    'auth.portal_account_unlinked',
    caller_person_id,
    null,
    jsonb_build_object('account_email', target_email, 'provider', 'google')
  );

  return jsonb_build_object('accountEmail', target_email);
end;
$$;

revoke all on function public.unlink_own_portal_account(uuid) from public, anon;
grant execute on function public.unlink_own_portal_account(uuid) to authenticated;

commit;
