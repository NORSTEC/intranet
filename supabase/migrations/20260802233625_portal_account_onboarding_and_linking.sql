begin;

alter table public.portal_accounts
add column onboarding_status text not null default 'complete';

alter table public.portal_accounts
add constraint portal_accounts_onboarding_status_check
check (onboarding_status in ('pending', 'complete'));

create table private.portal_account_link_intents (
  token_hash text primary key,
  initiator_auth_user_id uuid not null references auth.users (id) on delete cascade,
  initiator_person_id bigint not null references public.people (id) on delete cascade,
  mode text not null check (mode in ('add_account', 'use_existing')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  constraint portal_account_link_intents_token_hash_check
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint portal_account_link_intents_expiry_check
    check (expires_at > created_at)
);

create index portal_account_link_intents_expiry_idx
on private.portal_account_link_intents (expires_at);

revoke all on private.portal_account_link_intents from public, anon, authenticated;

drop policy if exists portal_accounts_self_read on public.portal_accounts;
create policy portal_accounts_same_person_read
on public.portal_accounts
for select
to authenticated
using (person_id = (select private.current_person_id()));

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
  display_name text;
  created_new_person boolean := false;
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

  select account.person_id
  into matched_person_id
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

  if created_new_person and matched_organization_id is not null then
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
      last_seen_at = now();

  if matched_organization_id is not null and new_onboarding_status = 'complete' then
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

create or replace function public.start_portal_account_link(
  p_token_hash text,
  p_mode text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  caller_auth_user_id uuid := (select auth.uid());
  caller_account record;
begin
  if caller_auth_user_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;

  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'invalid_link_token';
  end if;

  if p_mode not in ('add_account', 'use_existing') then
    raise exception using errcode = 'P0001', message = 'invalid_link_mode';
  end if;

  select account.person_id, account.onboarding_status, person.portal_access_status
  into caller_account
  from public.portal_accounts as account
  join public.people as person on person.id = account.person_id
  where account.auth_user_id = caller_auth_user_id;

  if caller_account.person_id is null or caller_account.portal_access_status <> 'active' then
    raise exception using errcode = '42501', message = 'portal_access_required';
  end if;

  if p_mode = 'add_account' then
    if caller_account.onboarding_status <> 'complete' then
      raise exception using errcode = 'P0001', message = 'onboarding_required';
    end if;

    if (
      select count(*)
      from public.portal_accounts as account
      where account.person_id = caller_account.person_id
    ) >= 2 then
      raise exception using errcode = 'P0001', message = 'too_many_portal_accounts';
    end if;
  elsif caller_account.onboarding_status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'onboarding_not_pending';
  end if;

  delete from private.portal_account_link_intents
  where expires_at <= now()
    or initiator_auth_user_id = caller_auth_user_id;

  insert into private.portal_account_link_intents (
    token_hash,
    initiator_auth_user_id,
    initiator_person_id,
    mode
  ) values (
    p_token_hash,
    caller_auth_user_id,
    caller_account.person_id,
    p_mode
  );
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
  matched_organization record;
begin
  if caller_auth_user_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;

  select account.person_id, account.account_email, account.onboarding_status
  into caller_account
  from public.portal_accounts as account
  where account.auth_user_id = caller_auth_user_id
  for update;

  if caller_account.person_id is null or caller_account.onboarding_status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'onboarding_not_pending';
  end if;

  select organization.id, organization.slug
  into matched_organization
  from private.organization_domains as domain
  join public.organizations as organization on organization.id = domain.organization_id
  where domain.domain = split_part(caller_account.account_email, '@', 2)
    and organization.status = 'active';

  if matched_organization.id is null then
    raise exception using errcode = 'P0001', message = 'organization_domain_required';
  end if;

  insert into public.memberships (
    person_id,
    organization_id,
    role,
    status,
    provisioning_method
  ) values (
    caller_account.person_id,
    matched_organization.id,
    'member',
    'active',
    'domain'
  )
  on conflict (person_id, organization_id) do nothing;

  update public.portal_accounts
  set onboarding_status = 'complete',
      last_seen_at = now()
  where auth_user_id = caller_auth_user_id;

  return jsonb_build_object('organizationSlug', matched_organization.slug);
end;
$$;

revoke all on function public.start_portal_account_link(text, text) from public, anon;
revoke all on function public.complete_portal_account_link(text) from public, anon;
revoke all on function public.complete_own_organization_onboarding() from public, anon;
grant execute on function public.start_portal_account_link(text, text) to authenticated;
grant execute on function public.complete_portal_account_link(text) to authenticated;
grant execute on function public.complete_own_organization_onboarding() to authenticated;

commit;
