begin;

-- Address matching is how a profile the portal already knew gets claimed: an
-- imported member, or somebody whose account was unlinked, signs in and lands
-- on their own history rather than on an empty profile. It matches on the
-- address alone, which is the only thing available for a person who has never
-- signed in.
--
-- On a registered organization domain there is something else available. The
-- address says which organization it belongs to, and the account either proved
-- it belongs to that Workspace or it did not. Matching without asking is what
-- lets a consumer Google account carrying a work address inherit the profile,
-- the membership history and the name of the person whose Workspace account it
-- is — the same conflicting-account shape that made the hosted domain claim
-- necessary in the first place.
--
-- So on a registered domain, the claim now needs the proof. Everywhere else
-- the behaviour is unchanged, because outside those domains there is no
-- directory that could contradict the address, and refusing the match would
-- only strand imported profiles nobody can ever claim.
--
-- Refusing is audited rather than raised. The person still signs in and still
-- gets a profile; what they do not get is somebody else's.
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
  address_registered_domain text;
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

  select domain.domain
  into address_registered_domain
  from private.organization_domains as domain
  where domain.domain = split_part(normalized_email, '@', 2);

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
    elsif address_holder_person_id is not null
      and address_registered_domain is not null
      and google_hosted_domain is distinct from address_registered_domain
    then
      -- The address belongs to an organization, and this account did not
      -- prove it belongs to that organization. Address matching exists so a
      -- profile the portal knew before anybody signed in can be claimed on
      -- first sign-in; it was never meant to let a consumer account holding a
      -- work address inherit the profile, the history and the name of the
      -- person the Workspace account belongs to. Outside registered domains
      -- nothing changes: an imported personal address still matches anybody
      -- presenting it, because there is no directory that could say otherwise.
      insert into public.audit_events (
        actor_person_id, action, target_person_id, organization_id, details
      ) values (
        null,
        'auth.address_claim_unproven',
        address_holder_person_id,
        matched_organization_id,
        jsonb_build_object(
          'email', normalized_email,
          'expected_hosted_domain', address_registered_domain,
          'proven_hosted_domain', google_hosted_domain,
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

revoke all on function private.provision_portal_user() from public, anon, authenticated;

commit;
