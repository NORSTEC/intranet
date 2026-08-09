begin;

-- Keep the complete, well-tested merge implementation, but put a final guard
-- around the edge cases that can otherwise promote a user or lose sync data.
alter function public.merge_people(bigint, bigint, text)
  rename to merge_people_legacy_hardened;

revoke all on function public.merge_people_legacy_hardened(
  bigint, bigint, text
) from public, anon, authenticated;

create or replace function public.merge_people(
  p_target_person_id bigint,
  p_source_person_id bigint,
  p_primary_email text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '30s'
as $$
declare
  actor_person_id bigint := (select private.current_person_id());
  source_account public.external_accounts%rowtype;
  target_account public.external_accounts%rowtype;
  prefer_source boolean;
begin
  if actor_person_id is null or not (select private.is_portal_admin()) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if p_target_person_id = p_source_person_id then
    raise exception using errcode = 'P0001', message = 'same_person';
  end if;

  -- Always lock in primary-key order. Other person mutations use the same
  -- order, which prevents two simultaneous repairs from deadlocking.
  perform 1
  from public.people as person
  where person.id in (p_target_person_id, p_source_person_id)
  order by person.id
  for update;

  if (select count(*) from public.people as person
      where person.id in (p_target_person_id, p_source_person_id)) <> 2
  then
    raise exception using errcode = 'P0001', message = 'person_not_found';
  end if;

  -- A duplicate repair must not grant an organization-admin role to the
  -- surviving profile. The role must be handed over explicitly first.
  if exists (
    select 1
    from public.memberships as source_membership
    where source_membership.person_id = p_source_person_id
      and source_membership.status = 'active'
      and source_membership.role = 'organization_admin'
      and not exists (
        select 1
        from public.memberships as target_membership
        where target_membership.person_id = p_target_person_id
          and target_membership.organization_id =
            source_membership.organization_id
          and target_membership.status = 'active'
          and target_membership.role = 'organization_admin'
      )
  ) then
    raise exception using errcode = 'P0001',
      message = 'source_is_organization_administrator';
  end if;

  -- Privacy is sticky: joining two profiles never makes a hidden person
  -- visible merely because the other duplicate used the default setting.
  update public.people as target
  set directory_visible = target.directory_visible and source.directory_visible
  from public.people as source
  where target.id = p_target_person_id
    and source.id = p_source_person_id;

  -- Moving two pending requests for the same organization would violate the
  -- partial unique index. Preserve the target request and close the duplicate.
  update public.historical_membership_requests as source_request
  set status = 'cancelled',
      reviewed_by_person_id = actor_person_id,
      reviewed_at = now(),
      decision_note = coalesce(
        source_request.decision_note,
        'Cancelled while merging a duplicate profile.'
      )
  where source_request.person_id = p_source_person_id
    and source_request.status = 'pending'
    and exists (
      select 1
      from public.historical_membership_requests as target_request
      where target_request.person_id = p_target_person_id
        and target_request.status = 'pending'
        and target_request.organization_id = source_request.organization_id
    );

  -- For duplicate provider rows, keep the freshest directory snapshot. Clear
  -- the source identifier before copying it so the provider-wide unique index
  -- cannot reject a legitimate merge halfway through.
  for source_account in
    select *
    from public.external_accounts
    where person_id = p_source_person_id
    order by id
    for update
  loop
    select * into target_account
    from public.external_accounts
    where person_id = p_target_person_id
      and organization_id = source_account.organization_id
      and provider = source_account.provider
    for update;

    if not found then
      continue;
    end if;

    prefer_source := (
      target_account.status = 'unknown'
      and source_account.status <> 'unknown'
    ) or coalesce(source_account.last_synced_at, '-infinity'::timestamptz)
      > coalesce(target_account.last_synced_at, '-infinity'::timestamptz);

    if prefer_source then
      update public.external_accounts
      set external_id = null
      where id = source_account.id;

      update public.external_accounts
      set status = source_account.status,
          external_id = source_account.external_id,
          account_email = source_account.account_email,
          provisioned_at = source_account.provisioned_at,
          deprovisioned_at = source_account.deprovisioned_at,
          last_error = source_account.last_error,
          display_name = source_account.display_name,
          last_synced_at = source_account.last_synced_at,
          provider_details = source_account.provider_details,
          updated_at = now()
      where id = target_account.id;
    end if;
  end loop;

  perform public.merge_people_legacy_hardened(
    p_target_person_id,
    p_source_person_id,
    p_primary_email
  );
end;
$$;

revoke all on function public.merge_people(bigint, bigint, text)
  from public, anon;
grant execute on function public.merge_people(bigint, bigint, text)
  to authenticated;

-- The original invariant still enforced the obsolete global limit of two
-- accounts. Capacity is now one account per organization domain plus one
-- personal account, so assert the same bucket rule used during linking.
create or replace function private.assert_person_invariants(p_person_id bigint)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  address_count integer;
  primary_count integer;
begin
  select count(*), count(*) filter (where address.is_primary)
  into address_count, primary_count
  from public.person_emails as address
  where address.person_id = p_person_id;

  if address_count > 0 and primary_count <> 1 then
    raise exception using errcode = 'P0001',
      message = 'person_primary_email_invariant';
  end if;

  if exists (
    select 1
    from public.portal_accounts as account
    where account.person_id = p_person_id
    group by private.account_domain_bucket(
      account.hosted_domain,
      account.account_email
    )
    having count(*) > 1
  ) then
    raise exception using errcode = 'P0001',
      message = 'too_many_portal_accounts';
  end if;
end;
$$;

revoke all on function private.assert_person_invariants(bigint)
  from public, anon, authenticated;

-- Starting a link cannot know the second account's domain yet. The definitive
-- per-domain capacity check remains in complete_portal_account_link.
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

  select account.person_id, account.onboarding_status,
    person.portal_access_status
  into caller_account
  from public.portal_accounts as account
  join public.people as person on person.id = account.person_id
  where account.auth_user_id = caller_auth_user_id;

  if caller_account.person_id is null
    or caller_account.portal_access_status <> 'active'
  then
    raise exception using errcode = '42501', message = 'portal_access_required';
  end if;

  if p_mode = 'add_account'
    and caller_account.onboarding_status <> 'complete'
  then
    raise exception using errcode = 'P0001', message = 'onboarding_required';
  elsif p_mode = 'use_existing'
    and caller_account.onboarding_status <> 'pending'
  then
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

revoke all on function public.start_portal_account_link(text, text)
  from public, anon;
grant execute on function public.start_portal_account_link(text, text)
  to authenticated;

-- Foreign-key indexes used by merge, deletion and notification cleanup.
create index if not exists historical_membership_requests_team_id_idx
  on public.historical_membership_requests (team_id)
  where team_id is not null;
create index if not exists historical_membership_requests_reviewer_idx
  on public.historical_membership_requests (reviewed_by_person_id)
  where reviewed_by_person_id is not null;
create index if not exists organization_domains_added_by_person_idx
  on private.organization_domains (added_by_person_id)
  where added_by_person_id is not null;
create index if not exists pending_notifications_person_id_idx
  on private.pending_notifications (person_id)
  where person_id is not null;
create index if not exists pending_notifications_enqueued_by_idx
  on private.pending_notifications (enqueued_by_person_id)
  where enqueued_by_person_id is not null;
create index if not exists people_deleted_by_person_idx
  on public.people (deleted_by_person_id)
  where deleted_by_person_id is not null;
create index if not exists portal_link_intents_auth_user_idx
  on private.portal_account_link_intents (initiator_auth_user_id);
create index if not exists portal_link_intents_person_idx
  on private.portal_account_link_intents (initiator_person_id);
create index if not exists portal_administrators_granted_by_idx
  on public.portal_administrators (granted_by_person_id)
  where granted_by_person_id is not null;
create index if not exists team_memberships_archived_by_idx
  on public.team_memberships (archived_by_person_id)
  where archived_by_person_id is not null;

commit;
