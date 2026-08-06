begin;

-- Slack reports facts about an account that Google has no equivalent for and
-- that the reconciliation genuinely needs: whether somebody is a guest rather
-- than a full member, whether they administer the workspace, and the @handle
-- people actually refer to each other by.
--
-- These go in one jsonb column rather than three typed ones. `external_accounts`
-- is a shared inventory across providers, and `is_guest` would be a column that
-- is meaningless for every Google row in the table — the sort of thing that
-- accumulates until nobody can tell which columns apply to what. The shape is
-- the provider's business, the same way `audit_events.details` is the caller's.
alter table public.external_accounts
  add column if not exists provider_details jsonb not null default '{}'::jsonb;

alter table public.external_accounts
  drop constraint if exists external_accounts_provider_details_object_check;

alter table public.external_accounts
  add constraint external_accounts_provider_details_object_check
  check (jsonb_typeof(provider_details) = 'object');

-- Adds `provider_details` to what the snapshot writes. Everything else is the
-- function as it was.
create or replace function public.sync_slack_directory(p_accounts jsonb)
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
    last_synced_at,
    provider_details
  )
  with snapshot as (
    select
      btrim(entry ->> 'externalId') as external_id,
      nullif(lower(btrim(coalesce(entry ->> 'accountEmail', ''))), '')
        as account_email,
      nullif(btrim(coalesce(entry ->> 'displayName', '')), '') as display_name,
      coalesce((entry ->> 'deactivated')::boolean, false) as deactivated,
      -- Only the keys the report reads, rebuilt here rather than passed
      -- through, so an added field in Slack's response cannot quietly become a
      -- stored column of unknown provenance.
      jsonb_strip_nulls(
        jsonb_build_object(
          'handle', nullif(btrim(coalesce(entry ->> 'handle', '')), ''),
          'guestType', nullif(btrim(coalesce(entry ->> 'guestType', '')), ''),
          'workspaceRole', nullif(btrim(coalesce(entry ->> 'workspaceRole', '')), '')
        )
      ) as provider_details
    from jsonb_array_elements(p_accounts) as entry
    where nullif(btrim(coalesce(entry ->> 'externalId', '')), '') is not null
  ),
  matched as (
    select
      snapshot.*,
      case
        when snapshot.account_email is null then null
        else (
          select person_email.person_id
          from public.person_emails as person_email
          where person_email.email = snapshot.account_email
        )
      end as person_id
    from snapshot
  ),
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
    'slack',
    ranked.external_id,
    ranked.account_email,
    ranked.display_name,
    case when ranked.deactivated then 'suspended' else 'active' end,
    case when ranked.deactivated then synced_at else null end,
    synced_at,
    ranked.provider_details
  from ranked
  on conflict (provider, external_id) do update
  set person_id = excluded.person_id,
      account_email = excluded.account_email,
      display_name = excluded.display_name,
      status = excluded.status,
      deprovisioned_at = case
        when excluded.status = 'suspended'
          then coalesce(account.deprovisioned_at, excluded.deprovisioned_at)
        else null
      end,
      last_synced_at = excluded.last_synced_at,
      -- Replaced rather than merged: somebody who stops being a guest, or loses
      -- the admin role, must lose the key rather than keep the stale one.
      provider_details = excluded.provider_details;

  delete from public.external_accounts as account
  where account.organization_id = norstec_id
    and account.provider = 'slack'
    and (account.last_synced_at is null or account.last_synced_at < synced_at);

  get diagnostics removed_count = row_count;

  select
    count(*) filter (where account.person_id is not null),
    count(*) filter (where account.person_id is null)
  into matched_count, unmatched_count
  from public.external_accounts as account
  where account.organization_id = norstec_id
    and account.provider = 'slack';

  insert into public.audit_events (
    actor_person_id, action, organization_id, details
  ) values (
    actor_person_id,
    'slack_directory.synced',
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

revoke all on function public.sync_slack_directory(jsonb) from public, anon;
grant execute on function public.sync_slack_directory(jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;
