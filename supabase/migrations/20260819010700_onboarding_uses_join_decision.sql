begin;

-- The third door, and the one that was easiest to miss because it is a button
-- rather than a sign-in. "Create profile" on the onboarding screen ran its own
-- copy of the domain rule — split the address on `@`, find the organization,
-- insert an active membership — so a policy that made people ask, and a guard
-- that refused a returning member, were both one click wide.
--
-- This is exactly the failure the shared decision was written to end, arriving
-- from a direction the first pass did not look in. `apply_domain_join` is now
-- the only code that inserts a domain membership; this completes the
-- onboarding and asks it, like everything else.
--
-- The hard failure when no organization matched is gone with it. Onboarding is
-- reached by a new profile on an address that looked like an organization's,
-- and after the hosted domain became the proof, "looked like" and "proved" are
-- no longer the same set. Somebody whose account proved nothing must still be
-- able to finish onboarding and go ask for access; refusing to complete it
-- left them on a screen with two buttons and no way past.
create or replace function public.complete_own_organization_onboarding()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  caller_auth_user_id uuid := (select auth.uid());
  caller_account record;
  join_result jsonb;
begin
  if caller_auth_user_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;

  select
    account.person_id,
    account.account_email,
    account.hosted_domain,
    account.onboarding_status
  into caller_account
  from public.portal_accounts as account
  where account.auth_user_id = caller_auth_user_id
  for update;

  if caller_account.person_id is null
    or caller_account.onboarding_status <> 'pending'
  then
    raise exception using errcode = 'P0001', message = 'onboarding_not_pending';
  end if;

  -- Completed before the decision, not after: `apply_domain_join` refuses an
  -- account still in onboarding, because a membership attached to a profile
  -- that is about to be folded into another belongs to nobody.
  update public.portal_accounts
  set onboarding_status = 'complete',
      last_seen_at = now()
  where auth_user_id = caller_auth_user_id;

  join_result := private.apply_domain_join(
    caller_account.person_id,
    caller_account.hosted_domain
  );

  return jsonb_build_object(
    'organizationSlug', join_result ->> 'organizationSlug',
    'outcome', join_result ->> 'outcome',
    'returning', coalesce((join_result ->> 'returning')::boolean, false)
  );
end;
$$;

revoke all on function public.complete_own_organization_onboarding()
  from public, anon;
grant execute on function public.complete_own_organization_onboarding()
  to authenticated;

commit;
