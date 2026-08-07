begin;

-- The domain rule becomes a decision with one implementation.
--
-- It used to be two: `provision_portal_user` inserted a membership when the
-- text after the `@` matched a registered domain, and
-- `complete_portal_account_link` did the same thing again for accounts that
-- arrived by linking. Two copies of a rule are two places to add a guard and
-- one place to forget it — an ended member refused at the sign-in door could
-- simply link the same account instead.
--
-- `private.apply_domain_join` is that one implementation. It answers a
-- narrower question than the code it replaces: not "does this address look
-- like the organization" but "did this account prove it belongs to a
-- Workspace whose organization lets it in". Three things follow.
--
--   * It keys on the hosted domain, never on the address. An account that
--     proved nothing gets nothing — see `20260819010000_record_hosted_domain`
--     for why a consumer account can carry a work address for years.
--   * It reads `organizations.domain_join_policy`, so an organization the
--     portal cannot check against a Workspace directory can require a human
--     instead of trusting a claim.
--   * It refuses to hand a membership to somebody whose membership in that
--     same organization has ended. That is the rule a SCIM directory would
--     enforce by not listing them, and it is what lets the portal stop
--     keeping an address forever purely to recognise a returning member.
--
-- Returning "request" rather than raising: a person who needs approval is not
-- an error, and a trigger on `auth.users` that raises is a trigger that stops
-- people signing in at all.
create or replace function private.apply_domain_join(
  p_person_id bigint,
  p_hosted_domain text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  proven_domain text;
  target_organization_id bigint;
  target_organization_slug text;
  join_policy text;
  membership_status text;
begin
  proven_domain := nullif(lower(btrim(coalesce(p_hosted_domain, ''))), '');

  -- No claim means not proven, never proven personal. GoTrue has a legacy
  -- path that drops the claim, and reading its absence as evidence would turn
  -- a Google outage into a portal-wide demotion.
  if proven_domain is null or p_person_id is null then
    return jsonb_build_object('outcome', 'unproven');
  end if;

  select organization.id, organization.slug, organization.domain_join_policy
  into target_organization_id, target_organization_slug, join_policy
  from private.organization_domains as domain
  join public.organizations as organization
    on organization.id = domain.organization_id
  where domain.domain = proven_domain
    and organization.status = 'active';

  if target_organization_id is null then
    return jsonb_build_object('outcome', 'no_organization');
  end if;

  if not exists (
    select 1
    from public.people as person
    where person.id = p_person_id
      and person.portal_access_status = 'active'
      and person.deleted_at is null
  ) then
    return jsonb_build_object(
      'outcome', 'blocked',
      'organizationId', target_organization_id,
      'organizationSlug', target_organization_slug
    );
  end if;

  select membership.status
  into membership_status
  from public.memberships as membership
  where membership.person_id = p_person_id
    and membership.organization_id = target_organization_id;

  if membership_status = 'active' then
    return jsonb_build_object(
      'outcome', 'member',
      'organizationId', target_organization_id,
      'organizationSlug', target_organization_slug
    );
  end if;

  -- Any membership row that already exists outranks the policy. `ended` is the
  -- one that matters most — somebody the organization has already let go does
  -- not walk back in because their Workspace account outlived the decision —
  -- but `planned`, `suspended` and `alumni` are equally not an invitation to
  -- insert. They also cannot be reported as a join: the insert below would do
  -- nothing on conflict while the caller was told a membership had been
  -- created, and would route somebody into a portal they cannot enter.
  if membership_status is not null or join_policy <> 'auto' then
    return jsonb_build_object(
      'outcome', case
        when join_policy = 'off' then 'identity_only'
        else 'request'
      end,
      'organizationId', target_organization_id,
      'organizationSlug', target_organization_slug,
      'membershipStatus', membership_status,
      'returning', membership_status = 'ended'
    );
  end if;

  insert into public.memberships (
    person_id,
    organization_id,
    role,
    status,
    provisioning_method
  ) values (
    p_person_id,
    target_organization_id,
    'member',
    'active',
    'domain'
  )
  on conflict (person_id, organization_id) do nothing;

  return jsonb_build_object(
    'outcome', 'joined',
    'organizationId', target_organization_id,
    'organizationSlug', target_organization_slug
  );
end;
$$;

revoke all on function private.apply_domain_join(bigint, text)
  from public, anon, authenticated;

-- The trigger on `auth.users` fires on insert and on changes to the email,
-- its confirmation or the app metadata. An ordinary repeat sign-in changes
-- none of those, which was fine while the domain rule was a fact about the
-- account and is wrong now that it is a policy somebody can change. A join
-- policy moved from `request` to `auto`, a domain registered after its people
-- already had profiles, or an organization reactivated would otherwise reach
-- nobody until each person happened to be renamed in the Admin console.
--
-- So the sign-in callback asks as well, on every sign-in, through this. It is
-- the same decision, and it is idempotent.
create or replace function public.apply_own_domain_join()
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
  caller_hosted_domain text;
  caller_onboarding_status text;
begin
  if caller_auth_user_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;

  select account.person_id, account.hosted_domain, account.onboarding_status
  into caller_person_id, caller_hosted_domain, caller_onboarding_status
  from public.portal_accounts as account
  where account.auth_user_id = caller_auth_user_id;

  if caller_person_id is null then
    return jsonb_build_object('outcome', 'no_account');
  end if;

  -- An account still in onboarding has not said yet whether it is a new
  -- person or an existing one signing in with a second Google account.
  -- Joining an organization before that answer would attach the membership to
  -- a profile that is about to be folded into another.
  if caller_onboarding_status <> 'complete' then
    return jsonb_build_object('outcome', 'onboarding');
  end if;

  return private.apply_domain_join(caller_person_id, caller_hosted_domain);
end;
$$;

revoke all on function public.apply_own_domain_join() from public, anon;
grant execute on function public.apply_own_domain_join() to authenticated;

create or replace function private.provision_portal_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text;
  google_provider_id text;
  google_hosted_domain text;
  existing_person_id bigint;
  existing_account_email text;
  existing_onboarding_status text;
  address_holder_person_id bigint;
  address_is_another_accounts_sign_in boolean := false;
  matched_person_id bigint;
  matched_organization_id bigint;
  matched_email_type text;
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

  -- Present in user metadata from the first OAuth exchange. The identity row
  -- is read as a fallback because this trigger also fires on later updates,
  -- where metadata written by an older GoTrue may not carry it.
  google_provider_id := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'provider_id'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'sub'), ''),
    (
      select nullif(btrim(identity.provider_id), '')
      from auth.identities as identity
      where identity.user_id = new.id
        and identity.provider = 'google'
      order by identity.created_at
      limit 1
    )
  );

  -- Only ever what the account proved. Coalesced with the stored value so a
  -- later update that arrives without the claim does not erase a domain an
  -- earlier sign-in established.
  google_hosted_domain := nullif(
    lower(btrim(coalesce(new.raw_user_meta_data -> 'custom_claims' ->> 'hd', ''))),
    ''
  );

  select domain.organization_id
  into matched_organization_id
  from private.organization_domains as domain
  join public.organizations as organization
    on organization.id = domain.organization_id
  where domain.domain = split_part(normalized_email, '@', 2)
    and organization.status = 'active';

  matched_email_type := case
    when matched_organization_id is not null then 'organization'
    else 'personal'
  end;

  select account.person_id, account.account_email, account.onboarding_status
  into existing_person_id, existing_account_email, existing_onboarding_status
  from public.portal_accounts as account
  where account.auth_user_id = new.id;

  select address.person_id
  into address_holder_person_id
  from public.person_emails as address
  where address.email = normalized_email;

  address_is_another_accounts_sign_in := exists (
    select 1
    from public.portal_accounts as account
    where account.account_email = normalized_email
      and account.auth_user_id <> new.id
  ) or exists (
    select 1
    from public.person_emails as address
    where address.email = normalized_email
      and address.provider_id is not null
      and address.provider_id is distinct from google_provider_id
  );

  matched_person_id := existing_person_id;

  if existing_person_id is not null
    and existing_account_email is distinct from normalized_email
  then
    -- Same Google account, different address: a rename in the Admin console.
    if address_holder_person_id is null then
      update public.person_emails
      set email = normalized_email,
          email_type = matched_email_type,
          provider_id = coalesce(google_provider_id, provider_id),
          updated_at = now()
      where person_id = existing_person_id
        and email = existing_account_email;

      insert into public.audit_events (
        actor_person_id, action, target_person_id, organization_id, details
      ) values (
        existing_person_id,
        'auth.account_email_changed',
        existing_person_id,
        matched_organization_id,
        jsonb_build_object(
          'previous_email', existing_account_email,
          'email', normalized_email,
          'provider', 'google'
        )
      );
    elsif address_holder_person_id <> existing_person_id then
      -- The address this account now answers to is held as an address by
      -- somebody else. `account_email` still records what the Google account
      -- actually is — that column describes the account, and the norstec.no
      -- check for portal administrators reads it, so a stale value there
      -- would be worse than an inconsistent one. What is *not* done is
      -- moving the address row: it belongs to a person, and no trigger gets
      -- to reassign a person's address. The old address stays on this
      -- profile as a stale contact address until an administrator resolves
      -- it, and the audit event names both sides so they can. Raising here
      -- instead would put a trigger on `auth.users` in the way of signing in
      -- at all.
      insert into public.audit_events (
        actor_person_id, action, target_person_id, organization_id, details
      ) values (
        existing_person_id,
        'auth.account_email_conflict',
        existing_person_id,
        matched_organization_id,
        jsonb_build_object(
          'account_email', existing_account_email,
          'conflicting_email', normalized_email,
          'held_by_person_id', address_holder_person_id,
          'provider', 'google'
        )
      );
    end if;
  end if;

  if matched_person_id is null then
    if address_is_another_accounts_sign_in then
      -- A different Google account already signs in with this address. Two
      -- Google accounts never share one, so this is the same address issued
      -- to somebody new — not the previous holder coming back. They get their
      -- own profile, and the address stays where it is until an administrator
      -- says otherwise.
      insert into public.audit_events (
        actor_person_id, action, target_person_id, organization_id, details
      ) values (
        null,
        'auth.account_email_reused',
        address_holder_person_id,
        matched_organization_id,
        jsonb_build_object(
          'email', normalized_email,
          'provider', 'google'
        )
      );
    else
      matched_person_id := address_holder_person_id;
    end if;
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

  if existing_onboarding_status = 'pending'
    or (created_new_person and matched_organization_id is not null)
  then
    new_onboarding_status := 'pending';
  end if;

  -- Skipped when the address is already known, which after a rename is the
  -- row that was just moved, and in the reused-address case is somebody
  -- else's row that must not be touched.
  insert into public.person_emails (
    person_id,
    email,
    email_type,
    is_primary,
    source,
    provider_id
  ) values (
    matched_person_id,
    normalized_email,
    matched_email_type,
    not exists (
      select 1
      from public.person_emails as existing_email
      where existing_email.person_id = matched_person_id
        and existing_email.is_primary
    ),
    'google',
    google_provider_id
  )
  on conflict (email) do update
  -- An address the portal already knew — an imported profile being claimed,
  -- or the row a rename just moved — records which Google account proved it,
  -- so nothing else can present it later. The `where` keeps that from
  -- reaching an address belonging to somebody else.
  set provider_id = coalesce(
        public.person_emails.provider_id,
        excluded.provider_id
      ),
      updated_at = now()
  where public.person_emails.person_id = matched_person_id;

  insert into public.portal_accounts (
    auth_user_id,
    person_id,
    provider_id,
    hosted_domain,
    account_email,
    onboarding_status
  ) values (
    new.id,
    matched_person_id,
    google_provider_id,
    google_hosted_domain,
    normalized_email,
    new_onboarding_status
  )
  on conflict (auth_user_id) do update
  set account_email = excluded.account_email,
      provider_id = coalesce(excluded.provider_id, public.portal_accounts.provider_id),
      hosted_domain = coalesce(
        excluded.hosted_domain,
        public.portal_accounts.hosted_domain
      ),
      last_seen_at = now()
  returning (xmax = 0) into created_new_account;

  -- The decision moved. It used to be four lines of insert keyed on the text
  -- after the `@`; it is now one call keyed on what the account proved, and
  -- the same call runs when an account is linked and on every later sign-in.
  -- The `created_new_account` condition stays: re-provisioning must not undo
  -- an offboarding, and repeat sign-ins are covered by the callback instead.
  if created_new_account and new_onboarding_status = 'complete' then
    perform private.apply_domain_join(matched_person_id, google_hosted_domain);
  end if;

  return new;
end;
$$;

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
  source_hosted_domain text;
  join_result jsonb;
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

  select account.hosted_domain
  into source_hosted_domain
  from public.portal_accounts as account
  where account.auth_user_id = source_auth_user_id;

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

  -- Linking used to run its own copy of the domain rule, which meant every
  -- guard added to the sign-in path was a door left open here. One function
  -- decides now, and this is simply its second caller.
  join_result := private.apply_domain_join(
    destination_person_id,
    source_hosted_domain
  );

  matched_organization_id := nullif(join_result ->> 'organizationId', '')::bigint;
  inserted_memberships := case
    when join_result ->> 'outcome' = 'joined' then 1
    else 0
  end;

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
    'membershipCreated', inserted_memberships = 1,
    'join', join_result
  );
end;
$$;

revoke all on function private.provision_portal_user() from public, anon, authenticated;

revoke all on function public.complete_portal_account_link(text) from public, anon;
grant execute on function public.complete_portal_account_link(text) to authenticated;

commit;
