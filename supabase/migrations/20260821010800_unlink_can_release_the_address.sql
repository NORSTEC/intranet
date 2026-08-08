begin;

-- Unlinking your own account did almost nothing, and the reason it did almost
-- nothing was load-bearing until now.
--
-- It removed the sign-in account and left the address, so signing in with the
-- same Google account again matched that address and put you straight back on
-- the profile you had just detached from. For the account's own owner the
-- whole operation amounted to a logout with extra steps. The address had to
-- stay, because a membership rested on a matching domain, and an ended member
-- who could take their address with them could sign in again and be handed a
-- fresh active membership by the domain rule.
--
-- The domain rule no longer works that way. Membership comes from
-- `apply_domain_join`, which reads the hosted domain the account proved and
-- refuses anybody whose membership in that organization has ended. An address
-- on its own grants nothing, so it no longer has to be immortal, and unlink
-- can mean what every other identity system means by it: Auth0 returns the
-- detached identity to its own user, Firebase frees the credential to make a
-- new account. Here, signing in afterwards lands on a new profile.
--
-- With one exception, and it is the same exception Okta and Entra make. An
-- address on a registered organization domain is not the person's to release —
-- it is the organization's, the way a SCIM-provisioned attribute is read-only
-- for the user. That one goes through a portal administrator, who can see the
-- membership history the address would take with it.
drop function if exists public.unlink_own_portal_account(uuid);

create or replace function public.unlink_own_portal_account(
  p_auth_user_id uuid,
  p_remove_email boolean default false
)
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
  removed_email boolean := false;
  was_primary boolean := false;
begin
  if caller_auth_user_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;

  if p_auth_user_id is null then
    raise exception using errcode = 'P0001', message = 'portal_account_not_found';
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

  perform private.assert_can_unlink_account(caller_person_id, target_email);

  if p_remove_email then
    -- The organization's, not theirs. A portal administrator releases this
    -- one, because releasing it also releases the membership history the
    -- address is the last trace of.
    if exists (
      select 1
      from private.organization_domains as domain
      where domain.domain = split_part(target_email, '@', 2)
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'organization_email_requires_admin';
    end if;

    if exists (
      select 1
      from public.memberships as membership
      where membership.person_id = caller_person_id
        and membership.status = 'active'
    ) and not exists (
      select 1
      from public.person_emails as remaining
      where remaining.person_id = caller_person_id
        and remaining.email <> target_email
    ) then
      raise exception using errcode = 'P0001', message = 'member_must_keep_email';
    end if;
  end if;

  delete from public.portal_accounts
  where auth_user_id = p_auth_user_id;

  if p_remove_email then
    select address.is_primary
    into was_primary
    from public.person_emails as address
    where address.person_id = caller_person_id
      and address.email = target_email;

    if was_primary is not null then
      delete from public.person_emails
      where person_id = caller_person_id
        and email = target_email;

      if was_primary then
        perform private.set_primary_email(caller_person_id, null);
      end if;

      removed_email := true;

      insert into public.audit_events (
        actor_person_id, action, target_person_id, details
      ) values (
        caller_person_id,
        'person_email.removed',
        caller_person_id,
        jsonb_build_object(
          'email', target_email,
          'was_primary', was_primary,
          'source', 'profile'
        )
      );
    end if;
  end if;

  perform private.release_unlinked_account(p_auth_user_id);

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
    jsonb_build_object(
      'account_email', target_email,
      'provider', 'google',
      'source', 'profile',
      'email_removed', removed_email
    )
  );

  return jsonb_build_object(
    'accountEmail', target_email,
    'emailRemoved', removed_email
  );
end;
$$;

revoke all on function public.unlink_own_portal_account(uuid, boolean)
  from public, anon;
grant execute on function public.unlink_own_portal_account(uuid, boolean)
  to authenticated;

commit;
