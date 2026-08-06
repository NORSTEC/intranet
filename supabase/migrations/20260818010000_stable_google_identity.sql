begin;

-- The portal identified a Google account by its address, and an address is not
-- stable. Renaming somebody in the Google Admin console produced two wrong
-- outcomes at once, both of them silent:
--
--   * GoTrue writes the new address onto `auth.users`, this trigger fired, and
--     the new address was *added* as a second `person_emails` row. The old one
--     stayed behind — still flagged primary, so still the address the member
--     directory showed and a decline notice would have gone to. Nothing ever
--     released it.
--   * Because nothing released it, the old address stayed claimed by that
--     profile forever. An address the Admin console later reassigned to a new
--     employee matched the previous holder's profile on their very first
--     sign-in, and handed it to them. Address matching cannot tell a person
--     returning from a person inheriting an address.
--
-- Google's subject identifier is the stable half of the identity, so it is
-- what the portal keys off from here. `provider_id` holds it, the Directory
-- API reports the same value as a user's `id`, and the two facts together let
-- a rename be recognised as a rename: same account, new address, so the
-- existing row moves rather than a second one appearing.
--
-- Matching by address stays, because it is the only thing that can recognise
-- somebody the portal knew before they ever signed in — an imported profile,
-- or a profile whose account was unlinked. It gains one condition: an address
-- that is already the sign-in address of a *different* Google account is not
-- evidence of the same person. That is exactly the recycled-address case, and
-- it is the one shape address matching was never able to refuse.
--
-- Note which half of that condition does the work. Two Auth users can never
-- share an address — GoTrue keeps a unique index on it — so the successor only
-- exists once the previous holder's Auth user is gone, which is what deleting
-- the Workspace account or unlinking it here leaves behind. What survives is
-- the address row, still naming the Google account that proved it, and that
-- subject identifier is the whole of what the portal has to recognise the
-- difference by. The `portal_accounts` half is belt and braces for identities
-- the index does not cover.
alter table public.portal_accounts
  add column if not exists provider_id text;

-- The same identifier on the address, recording which Google account proved
-- it. Unlinking now leaves the address behind (see
-- `20260818030000_admin_unlink_portal_account.sql`), and without this an
-- abandoned address would match the *next* Google account presenting it —
-- handing a borrowed account's real owner the borrower's profile. An address
-- the portal knew before anyone signed in carries no identifier and keeps
-- matching anybody, which is how an imported profile is claimed.
alter table public.person_emails
  add column if not exists provider_id text;

alter table public.person_emails
  drop constraint if exists person_emails_provider_id_length_check;

alter table public.person_emails
  add constraint person_emails_provider_id_length_check
  check (provider_id is null or char_length(btrim(provider_id)) between 1 and 255);

alter table public.portal_accounts
  drop constraint if exists portal_accounts_provider_id_length_check;

alter table public.portal_accounts
  add constraint portal_accounts_provider_id_length_check
  check (provider_id is null or char_length(btrim(provider_id)) between 1 and 255);

-- Nullable rather than required: rows predating this migration are backfilled
-- below, but a backfill can only reach accounts whose Auth identity still
-- exists, and an account with no subject identifier must keep working on
-- address matching alone rather than failing to sign in.
create unique index if not exists portal_accounts_provider_identity_idx
  on public.portal_accounts (provider, provider_id)
  where provider_id is not null;

update public.portal_accounts as account
set provider_id = identity.provider_id
from auth.identities as identity
where identity.user_id = account.auth_user_id
  and identity.provider = 'google'
  and account.provider_id is null;

update public.person_emails as address
set provider_id = account.provider_id
from public.portal_accounts as account
where account.person_id = address.person_id
  and account.account_email = address.email
  and account.provider_id is not null
  and address.provider_id is null;

create or replace function private.provision_portal_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text;
  google_provider_id text;
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
    account_email,
    onboarding_status
  ) values (
    new.id,
    matched_person_id,
    google_provider_id,
    normalized_email,
    new_onboarding_status
  )
  on conflict (auth_user_id) do update
  set account_email = excluded.account_email,
      provider_id = coalesce(excluded.provider_id, public.portal_accounts.provider_id),
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

-- The directory snapshot now matches on the subject identifier first. Address
-- matching stays as the fallback, because it is what reaches a Workspace
-- account belonging to somebody who has never signed in to the portal — there
-- is no `portal_accounts` row to match against until they do.
create or replace function public.sync_workspace_directory(p_accounts jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '30s'
as $$
declare
  actor_person_id bigint;
  norstec_id bigint;
  synced_at timestamptz := now();
  matched_count integer;
  unmatched_count integer;
  removed_count integer;
begin
  actor_person_id := (select private.current_person_id());

  if actor_person_id is null or not (select private.is_portal_admin()) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  norstec_id := (select private.norstec_organization_id());

  if norstec_id is null then
    raise exception using errcode = 'P0001', message = 'norstec_organization_missing';
  end if;

  if jsonb_typeof(p_accounts) <> 'array' then
    raise exception using errcode = 'P0001', message = 'invalid_snapshot';
  end if;

  insert into public.external_accounts as account (
    person_id,
    organization_id,
    provider,
    external_id,
    account_email,
    display_name,
    status,
    deprovisioned_at,
    last_synced_at
  )
  with snapshot as (
    select
      btrim(entry ->> 'externalId') as external_id,
      lower(btrim(entry ->> 'accountEmail')) as account_email,
      nullif(btrim(coalesce(entry ->> 'displayName', '')), '') as display_name,
      coalesce((entry ->> 'suspended')::boolean, false) as suspended
    from jsonb_array_elements(p_accounts) as entry
    where nullif(btrim(coalesce(entry ->> 'externalId', '')), '') is not null
      and nullif(btrim(coalesce(entry ->> 'accountEmail', '')), '') is not null
  ),
  matched as (
    select
      snapshot.*,
      coalesce(
        (
          select portal_account.person_id
          from public.portal_accounts as portal_account
          where portal_account.provider = 'google'
            and portal_account.provider_id = snapshot.external_id
        ),
        (
          select person_email.person_id
          from public.person_emails as person_email
          where person_email.email = snapshot.account_email
        )
      ) as person_id
    from snapshot
  ),
  -- One person can hold two addresses the portal knows about, and the table
  -- still allows only one linked row per person per provider. Rather than
  -- letting that abort the whole sync, the second account is imported
  -- unlinked — which puts it in the unmatched report, where somebody can see
  -- it and decide what it is.
  ranked as (
    select
      matched.*,
      case
        when matched.person_id is null then null
        else row_number() over (
          partition by matched.person_id
          order by matched.account_email
        )
      end as person_rank
    from matched
  )
  select
    case when ranked.person_rank = 1 then ranked.person_id else null end,
    norstec_id,
    'google_workspace',
    ranked.external_id,
    ranked.account_email,
    ranked.display_name,
    case when ranked.suspended then 'suspended' else 'active' end,
    case when ranked.suspended then synced_at else null end,
    synced_at
  from ranked
  on conflict (provider, external_id) do update
  set person_id = excluded.person_id,
      account_email = excluded.account_email,
      display_name = excluded.display_name,
      status = excluded.status,
      -- Kept rather than overwritten, so the first suspension is the one on
      -- record instead of the most recent sync.
      deprovisioned_at = case
        when excluded.status = 'suspended'
          then coalesce(account.deprovisioned_at, excluded.deprovisioned_at)
        else null
      end,
      last_synced_at = excluded.last_synced_at;

  delete from public.external_accounts as account
  where account.organization_id = norstec_id
    and account.provider = 'google_workspace'
    and (account.last_synced_at is null or account.last_synced_at < synced_at);

  get diagnostics removed_count = row_count;

  select
    count(*) filter (where account.person_id is not null),
    count(*) filter (where account.person_id is null)
  into matched_count, unmatched_count
  from public.external_accounts as account
  where account.organization_id = norstec_id
    and account.provider = 'google_workspace';

  insert into public.audit_events (
    actor_person_id, action, organization_id, details
  ) values (
    actor_person_id,
    'workspace_directory.synced',
    norstec_id,
    jsonb_build_object(
      'matched', matched_count,
      'unmatched', unmatched_count,
      'removed', removed_count
    )
  );

  return jsonb_build_object(
    'matched', matched_count,
    'removed', removed_count,
    'unmatched', unmatched_count
  );
end;
$$;

revoke all on function public.sync_workspace_directory(jsonb) from public, anon;
grant execute on function public.sync_workspace_directory(jsonb) to authenticated;

commit;
