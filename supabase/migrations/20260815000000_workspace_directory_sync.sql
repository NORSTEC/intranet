begin;

-- The portal does not create Google Workspace accounts. They are created in the
-- Admin console, the person signs in, and the domain rule already turns that
-- sign-in into a profile and a Norstec membership. Building a second place to
-- do the same thing would have added an API risk for no product gain.
--
-- What the portal does instead is *read* the directory and reconcile it: which
-- Workspace accounts belong to somebody in the portal, which belong to nobody
-- — the accounts nobody has cleaned up — and whether a suspension on one side
-- matches the other. `external_accounts` becomes that inventory.
--
-- Hence the one structural change here: an account nobody in the portal owns
-- has no person to point at, so `person_id` has to be nullable. Every existing
-- reader survives that untouched, which is why this is a nullable column
-- rather than a second table:
--
--   * The row level security policy reads `person_id = current_person_id()`.
--     `null = anything` is null, never true, so an unmatched account is
--     visible to portal administrators alone. That is exactly right.
--   * `merge_people` loops on `where person_id = p_source_person_id`, and the
--     empty-profile guard inside `public.complete_portal_account_link` asks
--     `exists (... where person_id = source_person_id)`. Null matches neither.
--   * `unique (person_id, organization_id, provider)` still constrains linked
--     rows, while treating nulls as distinct — many unmatched accounts are
--     allowed, which is the point. `unique (provider, external_id)` is what
--     guarantees one row per Google user, matched or not.
alter table public.external_accounts
  alter column person_id drop not null;

-- `status` was a provisioning lifecycle: not_started, pending, failed. None of
-- those states can happen now. What the column holds from here is what the
-- directory says, plus `unknown` for a row that has never been synced.
-- The old constraint has to go before the rewrite, not after: `unknown` is not
-- one of the values it permits, so updating first would be rejected by the
-- very constraint being replaced.
alter table public.external_accounts
  drop constraint if exists external_accounts_status_check;

update public.external_accounts
set status = 'unknown'
where status not in ('active', 'suspended');

alter table public.external_accounts
  add constraint external_accounts_status_check
  check (status in ('unknown', 'active', 'suspended'));

alter table public.external_accounts
  alter column status set default 'unknown';

alter table public.external_accounts
  add column if not exists display_name text,
  add column if not exists last_synced_at timestamptz;

alter table public.external_accounts
  drop constraint if exists external_accounts_display_name_length_check;

alter table public.external_accounts
  add constraint external_accounts_display_name_length_check
  check (display_name is null or char_length(display_name) <= 300);

create index if not exists external_accounts_unmatched_idx
  on public.external_accounts (organization_id, provider)
  where person_id is null;

-- Reading an unmatched account is a portal-administrator job. The existing
-- policy already lands there for null rows, but it is restated so the
-- behaviour is written down rather than inferred from three-valued logic.
drop policy if exists external_accounts_authorized_read on public.external_accounts;
create policy external_accounts_authorized_read
on public.external_accounts
for select
to authenticated
using (
  person_id = (select private.current_person_id())
  or (select private.is_portal_admin())
);

-- A profile holding an external account is not an empty duplicate. The guard
-- already refused to discard anyone with a membership, and in practice a
-- Norstec person always has one — but that made the protection incidental.
-- This makes it deliberate.
create or replace function private.discard_declined_applicant(p_person_id bigint)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  person_row public.people%rowtype;
begin
  select * into person_row
  from public.people
  where id = p_person_id
  for update;

  if not found or person_row.deleted_at is not null then
    return false;
  end if;

  if person_row.alumni_access_granted_at is not null then
    return false;
  end if;

  if exists (
    select 1 from public.memberships where person_id = p_person_id
  ) then
    return false;
  end if;

  if exists (
    select 1 from public.portal_administrators where person_id = p_person_id
  ) then
    return false;
  end if;

  if exists (
    select 1 from public.external_accounts where person_id = p_person_id
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.access_requests
    where person_id = p_person_id
      and status = 'pending'
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.historical_membership_requests
    where person_id = p_person_id
      and status = 'pending'
  ) then
    return false;
  end if;

  delete from private.portal_account_link_intents
  where initiator_person_id = p_person_id;

  delete from public.people where id = p_person_id;

  return true;
end;
$$;

revoke all on function private.discard_declined_applicant(bigint)
  from public, anon, authenticated;

create or replace function private.norstec_organization_id()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select organization.id
  from public.organizations as organization
  where organization.slug = 'norstec';
$$;

revoke all on function private.norstec_organization_id()
  from public, anon, authenticated;

-- One directory snapshot, applied in one transaction. The caller reads every
-- user from the Directory API and hands the whole list over; doing it row by
-- row would leave the table half-updated whenever a request failed midway.
--
-- Matching is by address, against every address the portal knows for a person
-- rather than only their primary one — somebody whose primary address is their
-- student email still owns their norstec.no account.
--
-- An account that has stopped appearing in the directory has been deleted in
-- the Admin console. Its row goes too: the portal reports what the directory
-- contains, and a row for a user that no longer exists is not that.
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
      (
        select person_email.person_id
        from public.person_emails as person_email
        where person_email.email = snapshot.account_email
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

-- Recording a suspension the portal has already applied in Google. Deleted
-- people are allowed: deleting somebody is exactly when their Workspace
-- sign-in should stop working, and their row is still here for the 30 days
-- before the purge.
create or replace function public.set_workspace_account_suspended(
  p_person_id bigint,
  p_suspended boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  actor_person_id bigint;
  norstec_id bigint;
  existing public.external_accounts%rowtype;
  next_status text;
begin
  actor_person_id := (select private.current_person_id());

  if actor_person_id is null or not (select private.is_portal_admin()) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  norstec_id := (select private.norstec_organization_id());
  next_status := case when p_suspended then 'suspended' else 'active' end;

  select * into existing
  from public.external_accounts as account
  where account.person_id = p_person_id
    and account.organization_id = norstec_id
    and account.provider = 'google_workspace'
  for update;

  if not found or existing.external_id is null then
    raise exception using errcode = 'P0001', message = 'account_not_found';
  end if;

  if existing.status = next_status then
    return;
  end if;

  update public.external_accounts as account
  set status = next_status,
      deprovisioned_at = case when p_suspended then now() else null end
  where account.id = existing.id;

  insert into public.audit_events (
    actor_person_id, action, target_person_id, organization_id, details
  ) values (
    actor_person_id,
    case
      when p_suspended then 'workspace_account.suspended'
      else 'workspace_account.reactivated'
    end,
    p_person_id,
    norstec_id,
    jsonb_build_object('account_email', existing.account_email)
  );
end;
$$;

revoke all on function public.set_workspace_account_suspended(bigint, boolean)
  from public, anon;
grant execute on function public.set_workspace_account_suspended(bigint, boolean)
  to authenticated;

-- Deletion has two entry points — an administrator deleting somebody, and a
-- person deleting themselves — and only the first of them used to tell Google.
-- Rather than teaching the second one the same trick and hoping the third one
-- someday remembers, the record of the suspension moves into the shared body
-- both of them already run.
--
-- Only the record moves. The database cannot make an outbound request, so
-- pushing the suspension to Google stays with the caller — and a deletion the
-- person asked for is never held up by whether Google answered. The row says
-- suspended either way, which is what the next directory sync reconciles
-- against.
create or replace function private.soft_delete_person_row(
  p_person_id bigint,
  p_actor_person_id bigint,
  p_reason text,
  p_source text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  person_row public.people%rowtype;
  person_primary_email text;
  active_membership_count integer;
  ended_membership_count integer;
  had_organization_admin boolean;
  previous_status text;
  previous_access_level text;
begin
  select * into person_row
  from public.people
  where id = p_person_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'person_not_found';
  end if;

  if person_row.deleted_at is not null then
    raise exception using errcode = 'P0001', message = 'person_already_deleted';
  end if;

  if exists (
    select 1
    from public.portal_administrators as administrator
    where administrator.person_id = p_person_id
  ) then
    raise exception using errcode = 'P0001', message = 'portal_admin_role_first';
  end if;

  select person_email.email
  into person_primary_email
  from public.person_emails as person_email
  where person_email.person_id = p_person_id
    and person_email.is_primary
  limit 1;

  select
    count(*) filter (where membership.status = 'active'),
    count(*) filter (where membership.status = 'ended'),
    coalesce(
      bool_or(
        membership.status = 'active'
        and membership.role = 'organization_admin'
      ),
      false
    )
  into active_membership_count, ended_membership_count, had_organization_admin
  from public.memberships as membership
  where membership.person_id = p_person_id;

  -- The same three rules Manage people reads a person's status by, including
  -- alumni access granted without any membership row ever existing.
  previous_status := case
    when active_membership_count > 0 then 'active'
    when ended_membership_count > 0
      or person_row.alumni_access_granted_at is not null then 'alumni'
    else 'none'
  end;

  -- A portal administrator cannot reach this point — the guard above refuses
  -- to delete one — so the level is only ever one of the other two. Suspension
  -- is deliberately not folded in here: it is portal access, recorded on its
  -- own below, and folding it in is what confused the two in the first place.
  previous_access_level := case
    when had_organization_admin then 'organization_admin'
    else 'member'
  end;

  perform private.end_person_memberships(p_person_id);

  update public.people
  set deleted_at = now(),
      deleted_by_person_id = p_actor_person_id,
      deletion_reason = p_reason,
      access_status_before_deletion = person_row.portal_access_status,
      portal_access_status = 'suspended'
  where id = p_person_id;

  perform private.revoke_person_sessions(p_person_id);

  update public.external_accounts as account
  set status = 'suspended',
      deprovisioned_at = coalesce(account.deprovisioned_at, now())
  where account.person_id = p_person_id
    and account.provider = 'google_workspace'
    and account.status = 'active';

  -- Outstanding requests would otherwise keep the person in front of every
  -- organization administrator's review queue.
  update public.access_requests
  set status = 'cancelled'
  where person_id = p_person_id
    and status = 'pending';

  update public.historical_membership_requests
  set status = 'cancelled'
  where person_id = p_person_id
    and status = 'pending';

  insert into public.audit_events (
    actor_person_id, action, target_person_id, details
  ) values (
    p_actor_person_id,
    case when p_source = 'self_service'
      then 'person.self_deleted'
      else 'person.soft_deleted'
    end,
    p_person_id,
    jsonb_build_object(
      'previous_status', previous_status,
      'previous_access_level', previous_access_level,
      'previous_access_status', person_row.portal_access_status,
      'has_reason', p_reason is not null,
      'source', p_source,
      'deleted_person', jsonb_build_object(
        'name', person_row.full_name,
        'email', person_primary_email
      )
    )
  );
end;
$$;

revoke all on function private.soft_delete_person_row(bigint, bigint, text, text)
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
