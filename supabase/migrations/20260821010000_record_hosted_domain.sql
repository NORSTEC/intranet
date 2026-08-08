begin;

-- The portal decides that an address belongs to an organization by looking at
-- the text after the `@`. Google says not to. A consumer Google account can be
-- created with a work address — Google's own "conflicting accounts" case — and
-- it keeps that address after the Workspace account behind it is deleted, so
-- `email_verified` being true says nothing about whether anybody is in that
-- Workspace. The claim that does say it is `hd`, which Google puts in the ID
-- token only for accounts that belong to the hosted domain.
--
-- GoTrue carries it through: `googleProvider.GetUserData` takes the ID token
-- path whenever Google returns one, `parseGoogleIDToken` writes
-- `custom_claims.hd`, and that lands in `raw_user_meta_data`. Confirmed on a
-- production account.
--
-- Nothing decides anything differently yet. This migration only records what
-- the account proved, so the migration that moves the membership decision has
-- a column to read. The domain match below is untouched and still keys off the
-- address.
--
-- One shape worth naming: an absent `hd` means *not proven*, never *proven
-- personal*. GoTrue has a legacy path — Google returns no ID token, the
-- userinfo endpoint answers instead, and that response is parsed into a claims
-- struct that drops the hosted domain. A reader of this column must treat null
-- as "no organization" and send the person through approval, not as evidence
-- that they are an outsider.
alter table public.portal_accounts
  add column if not exists hosted_domain text;

alter table public.portal_accounts
  drop constraint if exists portal_accounts_hosted_domain_check;

alter table public.portal_accounts
  add constraint portal_accounts_hosted_domain_check
  check (
    hosted_domain is null
    or (
      hosted_domain = lower(hosted_domain)
      and char_length(btrim(hosted_domain)) between 1 and 253
    )
  );

update public.portal_accounts as account
set hosted_domain = lower(
  btrim(auth_user.raw_user_meta_data -> 'custom_claims' ->> 'hd')
)
from auth.users as auth_user
where auth_user.id = account.auth_user_id
  and account.hosted_domain is null
  and nullif(
    btrim(coalesce(auth_user.raw_user_meta_data -> 'custom_claims' ->> 'hd', '')),
    ''
  ) is not null;

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
