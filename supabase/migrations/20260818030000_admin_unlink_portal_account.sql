begin;

-- Two things about unlinking were wrong, and they were the same mistake seen
-- from different ends.
--
-- Unlinking deleted the address along with the sign-in account. That made an
-- address something the portal only knows while a Google account still proves
-- it, so an ended member who unlinked their organization account and signed in
-- with it again was nobody: the address matched no profile, a brand new person
-- was created, and the domain rule handed them a fresh *active* membership in
-- the organization that had just ended theirs. Their ended membership was
-- still on record — on the profile they no longer arrived at. An address is a
-- fact about a person, not a lease on one, so it stays. Deleting one is
-- `remove_person_email`, which a portal administrator runs deliberately.
--
-- And unlinking was reachable only by the account's own owner, while
-- `merge_people` refuses two profiles holding three sign-in accounts between
-- them. A duplicate nobody can sign in to could therefore never be merged and
-- never be repaired. Portal administrators get the same operation, under the
-- same guards.
--
-- The guards move into one function because there are now two callers, and
-- because the next migration widens them: two copies would have been one
-- copy correct.
create or replace function private.assert_can_unlink_account(
  p_person_id bigint,
  p_account_email text
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (
    select count(*)
    from public.portal_accounts as account
    where account.person_id = p_person_id
  ) < 2 then
    raise exception using errcode = 'P0001', message = 'last_portal_account';
  end if;

  -- A domain-provisioned membership rests on the account that proved the
  -- domain. Removing the proof while the membership runs is how an
  -- organization account gets borrowed, cashed in for membership and handed
  -- back with nothing left to show for it.
  if exists (
    select 1
    from public.memberships as membership
    join private.organization_domains as membership_domain
      on membership_domain.organization_id = membership.organization_id
      and membership_domain.domain = split_part(p_account_email, '@', 2)
    where membership.person_id = p_person_id
      and membership.status = 'active'
      and membership.provisioning_method = 'domain'
      and not exists (
        select 1
        from public.person_emails as remaining_email
        join private.organization_domains as remaining_domain
          on remaining_domain.domain = split_part(remaining_email.email, '@', 2)
        where remaining_email.person_id = p_person_id
          and remaining_email.email <> p_account_email
          and remaining_domain.organization_id = membership.organization_id
      )
  ) then
    raise exception using errcode = 'P0001', message = 'membership_requires_account';
  end if;
end;
$$;

revoke all on function private.assert_can_unlink_account(bigint, text)
  from public, anon, authenticated;

-- Unlinking left the Auth user behind, holding a live session and a Google
-- identity that no longer reached any profile. Two things followed from that,
-- and both were dead ends: the session kept working until its access token
-- expired, and signing in with the account again did nothing — the
-- provisioning trigger fires on inserts and on changes to the email, its
-- confirmation, or the app metadata, and an ordinary repeat sign-in changes
-- none of them. The person arrived authenticated, with no portal account, and
-- no way to get one.
--
-- Deleting the Auth user is what makes the account genuinely unlinked: the
-- session and the Google identity go with it, and the next sign-in is a new
-- Auth user, which the trigger does see. The address stays on the profile and
-- still names the same Google account, so that sign-in lands back on the same
-- person rather than a fresh one.
create or replace function private.release_unlinked_account(p_auth_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  delete from auth.users where id = p_auth_user_id;
end;
$$;

revoke all on function private.release_unlinked_account(uuid)
  from public, anon, authenticated;

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

  -- The primary address used to be unlinkable for fear of stranding the
  -- person's contact address. It survives the unlink now, and the person can
  -- move it themselves, so the account it came from is no longer special.
  perform private.assert_can_unlink_account(caller_person_id, target_email);

  delete from public.portal_accounts
  where auth_user_id = p_auth_user_id;

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
      'source', 'profile'
    )
  );

  return jsonb_build_object('accountEmail', target_email);
end;
$$;

revoke all on function public.unlink_own_portal_account(uuid) from public, anon;
grant execute on function public.unlink_own_portal_account(uuid) to authenticated;

create or replace function public.unlink_portal_account(p_auth_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  actor_person_id bigint;
  target_person_id bigint;
  target_email text;
begin
  actor_person_id := (select private.current_person_id());

  if actor_person_id is null or not (select private.is_portal_admin()) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if p_auth_user_id is null then
    raise exception using errcode = 'P0001', message = 'portal_account_not_found';
  end if;

  select account.person_id, account.account_email
  into target_person_id, target_email
  from public.portal_accounts as account
  where account.auth_user_id = p_auth_user_id
  for update;

  if target_person_id is null then
    raise exception using errcode = 'P0001', message = 'portal_account_not_found';
  end if;

  if exists (
    select 1
    from public.people as person
    where person.id = target_person_id
      and person.deleted_at is not null
  ) then
    raise exception using errcode = 'P0001', message = 'person_deleted';
  end if;

  perform private.assert_can_unlink_account(target_person_id, target_email);

  delete from public.portal_accounts
  where auth_user_id = p_auth_user_id;

  perform private.release_unlinked_account(p_auth_user_id);

  insert into public.audit_events (
    actor_person_id,
    action,
    target_person_id,
    organization_id,
    details
  ) values (
    actor_person_id,
    'auth.portal_account_unlinked',
    target_person_id,
    null,
    jsonb_build_object(
      'account_email', target_email,
      'provider', 'google',
      'source', 'portal_management'
    )
  );

  return jsonb_build_object('accountEmail', target_email);
end;
$$;

revoke all on function public.unlink_portal_account(uuid) from public, anon;
grant execute on function public.unlink_portal_account(uuid) to authenticated;

commit;
