begin;

-- The Slack report gained an account type and the Workspace one wants the same
-- two questions answered: what is this account, and is anybody still using it.
--
-- Google can answer both from the directory snapshot the sync already reads,
-- and one of them closes a manual step this repo documents. `docs/
-- google-workspace.md` tells an administrator to open an unmatched account in
-- the Admin console and look at the last sign-in before suspending it, because
-- an account nobody signs in *as* looks exactly like an abandoned one. Storing
-- `lastLoginAt` puts that fact in the row instead of in a second browser tab.
--
-- The administrator flags matter for a different reason. A delegated role
-- cannot change a super administrator — Google refuses it — so the portal
-- cannot suspend one whoever asks, and knowing that before the click is better
-- than a 403 after it.
--
-- Both go in `provider_details`, the column the Slack sync introduced, for the
-- same reason: `is_super_admin` would be meaningless on every Slack row.
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
    last_synced_at,
    provider_details
  )
  with snapshot as (
    select
      btrim(entry ->> 'externalId') as external_id,
      lower(btrim(entry ->> 'accountEmail')) as account_email,
      nullif(btrim(coalesce(entry ->> 'displayName', '')), '') as display_name,
      coalesce((entry ->> 'suspended')::boolean, false) as suspended,
      jsonb_strip_nulls(
        jsonb_build_object(
          'adminRole', nullif(btrim(coalesce(entry ->> 'adminRole', '')), ''),
          'lastLoginAt', nullif(btrim(coalesce(entry ->> 'lastLoginAt', '')), '')
        )
      ) as provider_details
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
    synced_at,
    ranked.provider_details
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
      last_synced_at = excluded.last_synced_at,
      -- Replaced rather than merged, so somebody who loses the administrator
      -- role loses the key instead of keeping a stale one.
      provider_details = excluded.provider_details;

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

notify pgrst, 'reload schema';

commit;
