begin;

-- Deleting a person cascades into person_emails. The guard could not tell
-- that cascade apart from someone stripping the last email off a live member,
-- so it rejected every delete of a person who had an active membership. The
-- person row is already gone by the time the cascade fires, which makes its
-- absence a reliable signal that no member is left to protect.
create or replace function private.prevent_last_member_email_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.person_id = old.person_id then
    return new;
  end if;

  if tg_op = 'DELETE'
    and not exists (
      select 1 from public.people as person where person.id = old.person_id
    )
  then
    return old;
  end if;

  if exists (
    select 1
    from public.memberships as membership
    where membership.person_id = old.person_id
      and membership.status = 'active'
  )
    and not exists (
      select 1
      from public.person_emails as person_email
      where person_email.person_id = old.person_id
        and person_email.id <> old.id
    )
  then
    raise exception using
      errcode = '23514',
      message = 'member_must_keep_email';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

-- public.sync_linked_google_identities was granted to every authenticated
-- role but never called by the application. With GoTrue manual identity
-- linking enabled, a signed-in user could call auth.linkIdentity from the
-- browser and then this RPC directly, attaching an organization Google email
-- and minting an active membership without a link intent, without the
-- empty-source-profile check, and outside the two-account limit (the limit
-- counts portal accounts, not identities). Linking goes through
-- start_portal_account_link / complete_portal_account_link only.
drop function if exists public.sync_linked_google_identities();

-- Unlinking removed the organization email that a domain-provisioned
-- membership rested on while leaving the membership active, so an
-- organization account could be borrowed, linked, cashed in for membership
-- and unlinked again with no trace left. The membership has to be ended by an
-- organization administrator first; unlinking never silently outlives its own
-- proof.
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

  if exists (
    select 1
    from public.memberships as membership
    join private.organization_domains as membership_domain
      on membership_domain.organization_id = membership.organization_id
      and membership_domain.domain = split_part(target_email, '@', 2)
    where membership.person_id = caller_person_id
      and membership.status = 'active'
      and membership.provisioning_method = 'domain'
      and not exists (
        select 1
        from public.person_emails as remaining_email
        join private.organization_domains as remaining_domain
          on remaining_domain.domain = split_part(remaining_email.email, '@', 2)
        where remaining_email.person_id = caller_person_id
          and remaining_email.email <> target_email
          and remaining_domain.organization_id = membership.organization_id
      )
  ) then
    raise exception using errcode = 'P0001', message = 'membership_requires_account';
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

-- Merging only checked that the destination profile still had portal access.
-- A suspended or deactivated source profile with no rows attached passed the
-- empty-profile test, so its email could be folded into an active profile and
-- the status it carried disappeared with it. Alumni access is profile data as
-- much as a membership is, so it now blocks the merge too.
create or replace function public.complete_portal_account_link(p_token_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '10s'
as $$
declare
  selected_auth_user_id uuid := (select auth.uid());
  link_intent record;
  source_auth_user_id uuid;
  source_person_id bigint;
  destination_person_id bigint;
  source_account_email text;
  matched_organization_id bigint;
  inserted_memberships integer := 0;
begin
  if selected_auth_user_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;

  select intent.*
  into link_intent
  from private.portal_account_link_intents as intent
  where intent.token_hash = p_token_hash
    and intent.expires_at > now()
  for update;

  if link_intent.token_hash is null then
    raise exception using errcode = 'P0001', message = 'link_intent_expired';
  end if;

  if selected_auth_user_id = link_intent.initiator_auth_user_id then
    raise exception using errcode = 'P0001', message = 'same_portal_account';
  end if;

  if link_intent.mode = 'add_account' then
    source_auth_user_id := selected_auth_user_id;
    destination_person_id := link_intent.initiator_person_id;
  else
    source_auth_user_id := link_intent.initiator_auth_user_id;

    select account.person_id
    into destination_person_id
    from public.portal_accounts as account
    where account.auth_user_id = selected_auth_user_id
      and account.onboarding_status = 'complete';
  end if;

  select account.person_id, account.account_email
  into source_person_id, source_account_email
  from public.portal_accounts as account
  where account.auth_user_id = source_auth_user_id;

  if source_person_id is null or destination_person_id is null then
    raise exception using errcode = 'P0001', message = 'portal_account_not_found';
  end if;

  if source_person_id = destination_person_id then
    raise exception using errcode = 'P0001', message = 'portal_account_already_linked';
  end if;

  perform 1
  from public.people as person
  where person.id = destination_person_id
    and person.portal_access_status = 'active'
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'target_portal_access_required';
  end if;

  perform 1
  from public.people as person
  where person.id = source_person_id
    and person.portal_access_status = 'active'
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'source_portal_access_required';
  end if;

  if (
    select count(*)
    from public.portal_accounts as account
    where account.person_id = destination_person_id
  ) >= 2 then
    raise exception using errcode = 'P0001', message = 'too_many_portal_accounts';
  end if;

  if (
    select count(*)
    from public.portal_accounts as account
    where account.person_id = source_person_id
  ) <> 1
    or (
      select count(*)
      from public.person_emails as email
      where email.person_id = source_person_id
    ) <> 1
    or exists (
      select 1
      from public.people as source_person
      where source_person.id = source_person_id
        and source_person.alumni_access_granted_at is not null
    )
    or exists (select 1 from public.memberships where person_id = source_person_id)
    or exists (select 1 from public.access_requests where person_id = source_person_id)
    or exists (select 1 from public.historical_membership_requests where person_id = source_person_id)
    or exists (select 1 from public.profile_experiences where person_id = source_person_id)
    or exists (select 1 from public.team_memberships where person_id = source_person_id)
    or exists (select 1 from public.external_accounts where person_id = source_person_id)
    or exists (select 1 from public.portal_administrators where person_id = source_person_id)
  then
    raise exception using errcode = 'P0001', message = 'source_profile_has_data';
  end if;

  select domain.organization_id
  into matched_organization_id
  from private.organization_domains as domain
  join public.organizations as organization on organization.id = domain.organization_id
  where domain.domain = split_part(source_account_email, '@', 2)
    and organization.status = 'active';

  update public.person_emails
  set person_id = destination_person_id,
      is_primary = not exists (
        select 1
        from public.person_emails as target_email
        where target_email.person_id = destination_person_id
          and target_email.is_primary
      ),
      updated_at = now()
  where person_id = source_person_id;

  update public.portal_accounts
  set person_id = destination_person_id,
      onboarding_status = 'complete',
      linked_at = now(),
      last_seen_at = now()
  where auth_user_id = source_auth_user_id;

  if matched_organization_id is not null then
    insert into public.memberships (
      person_id,
      organization_id,
      role,
      status,
      provisioning_method
    ) values (
      destination_person_id,
      matched_organization_id,
      'member',
      'active',
      'domain'
    )
    on conflict (person_id, organization_id) do nothing;

    get diagnostics inserted_memberships = row_count;
  end if;

  update public.audit_events
  set actor_person_id = destination_person_id
  where actor_person_id = source_person_id;

  update public.audit_events
  set target_person_id = destination_person_id
  where target_person_id = source_person_id;

  delete from public.people where id = source_person_id;
  delete from private.portal_account_link_intents where token_hash = p_token_hash;

  insert into public.audit_events (
    actor_person_id,
    action,
    target_person_id,
    organization_id,
    details
  ) values (
    destination_person_id,
    'auth.portal_account_linked',
    destination_person_id,
    matched_organization_id,
    jsonb_build_object(
      'account_email', source_account_email,
      'mode', link_intent.mode,
      'membership_created', inserted_memberships = 1
    )
  );

  return jsonb_build_object(
    'accountEmail', source_account_email,
    'membershipCreated', inserted_memberships = 1
  );
end;
$$;

revoke all on function public.complete_portal_account_link(text) from public, anon;
grant execute on function public.complete_portal_account_link(text) to authenticated;

-- The provisioning trigger fires on every update of auth.users, which GoTrue
-- performs on each sign-in. Domain membership was inserted on every one of
-- those runs, so a membership row deleted during offboarding came back the
-- next time the person signed in. Ending a membership sets status = 'ended'
-- and is protected by the conflict clause, but deletion was not. First
-- sign-in is the only moment domain provisioning is meant to happen.
create or replace function private.provision_portal_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text;
  matched_person_id bigint;
  matched_organization_id bigint;
  existing_onboarding_status text;
  display_name text;
  created_new_person boolean := false;
  created_new_account boolean := false;
  new_onboarding_status text := 'complete';
begin
  normalized_email := lower(new.email);

  if normalized_email is null
    or new.email_confirmed_at is null
    or not (
      coalesce(new.raw_app_meta_data ->> 'provider', '') = 'google'
      or coalesce(new.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'google'
    )
  then
    return new;
  end if;

  display_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), '')
  );

  select account.person_id, account.onboarding_status
  into matched_person_id, existing_onboarding_status
  from public.portal_accounts as account
  where account.auth_user_id = new.id;

  if matched_person_id is null then
    select person_email.person_id
    into matched_person_id
    from public.person_emails as person_email
    where person_email.email = normalized_email;
  end if;

  if matched_person_id is null then
    insert into public.people (
      full_name,
      portal_access_status,
      source
    ) values (display_name, 'active', 'google')
    returning id into matched_person_id;
    created_new_person := true;
  else
    update public.people
    set full_name = coalesce(full_name, display_name),
        portal_access_status = case
          when portal_access_status = 'unclaimed' then 'active'
          else portal_access_status
        end
    where id = matched_person_id;
  end if;

  select domain.organization_id
  into matched_organization_id
  from private.organization_domains as domain
  join public.organizations as organization
    on organization.id = domain.organization_id
  where domain.domain = split_part(normalized_email, '@', 2)
    and organization.status = 'active';

  if existing_onboarding_status = 'pending'
    or (created_new_person and matched_organization_id is not null)
  then
    new_onboarding_status := 'pending';
  end if;

  insert into public.person_emails (
    person_id,
    email,
    email_type,
    is_primary,
    source
  ) values (
    matched_person_id,
    normalized_email,
    case when matched_organization_id is not null then 'organization' else 'personal' end,
    not exists (
      select 1
      from public.person_emails as existing_email
      where existing_email.person_id = matched_person_id
        and existing_email.is_primary
    ),
    'google'
  )
  on conflict (email) do nothing;

  insert into public.portal_accounts (
    auth_user_id,
    person_id,
    account_email,
    onboarding_status
  ) values (
    new.id,
    matched_person_id,
    normalized_email,
    new_onboarding_status
  )
  on conflict (auth_user_id) do update
  set account_email = excluded.account_email,
      last_seen_at = now()
  returning (xmax = 0) into created_new_account;

  if created_new_account
    and matched_organization_id is not null
    and new_onboarding_status = 'complete'
  then
    insert into public.memberships (
      person_id,
      organization_id,
      role,
      status,
      provisioning_method
    ) values (
      matched_person_id,
      matched_organization_id,
      'member',
      'active',
      'domain'
    )
    on conflict (person_id, organization_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function private.provision_portal_user() from public, anon, authenticated;

commit;
