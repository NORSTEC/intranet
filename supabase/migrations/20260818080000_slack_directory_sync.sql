begin;

-- The Slack half of the same reconciliation `sync_workspace_directory` does for
-- Google: which Slack accounts belong to somebody in the portal, and which
-- belong to nobody. `external_accounts.provider` has allowed 'slack' since the
-- table was created, and every structural change the Google sync needed — a
-- nullable `person_id`, the `unknown`/`active`/`suspended` statuses,
-- `display_name`, `last_synced_at` — is already in place. This migration adds
-- one function and nothing else.
--
-- Where the two deliberately differ:
--
--   * There is no `set_slack_account_suspended`. Deactivating a Slack member
--     over the API needs `admin.users.*` or SCIM, both of which are Business+
--     and Enterprise Grid features; this workspace is on Pro. The portal can
--     read Slack and report on it, and that is the whole of it. Writing a
--     function that records a suspension the portal cannot actually perform
--     would put a lie in the table — the row would say suspended while the
--     person kept posting.
--
--   * `private.soft_delete_person_row` is left alone, for the same reason. It
--     suspends `provider = 'google_workspace'` rows because the caller really
--     does suspend the Google account. Extending it to 'slack' would mark a
--     row suspended that nothing had suspended, and the next sync would flip it
--     straight back — churn in the audit trail describing something that never
--     happened.
--
--   * An account with no address is imported rather than skipped. Slack has
--     members it holds no email for — guests invited by phone, accounts older
--     than the workspace's own rules — and one of those belonging to nobody in
--     the portal is exactly the row the report exists to surface. The Google
--     sync can require an address because Workspace guarantees one.
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
    last_synced_at
  )
  with snapshot as (
    select
      btrim(entry ->> 'externalId') as external_id,
      -- Unlike the Google snapshot this may be null, and stays null rather
      -- than becoming the empty string, which the address format check would
      -- reject.
      nullif(lower(btrim(coalesce(entry ->> 'accountEmail', ''))), '')
        as account_email,
      nullif(btrim(coalesce(entry ->> 'displayName', '')), '') as display_name,
      coalesce((entry ->> 'deactivated')::boolean, false) as deactivated
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
  -- Same rule the Google sync uses: one person can hold two addresses the
  -- portal knows about, and the table allows only one linked row per person per
  -- provider. Rather than letting that abort the whole sync, the second account
  -- is imported unlinked, which puts it in the unmatched report where somebody
  -- can see it and decide what it is.
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
    -- Slack's `deleted` is a deactivation: the account and everything it ever
    -- wrote stay in the workspace. It is the nearest thing Slack has to a
    -- suspended Workspace account, and it is recorded under the same word so
    -- one report can read both providers.
    case when ranked.deactivated then 'suspended' else 'active' end,
    case when ranked.deactivated then synced_at else null end,
    synced_at
  from ranked
  on conflict (provider, external_id) do update
  set person_id = excluded.person_id,
      account_email = excluded.account_email,
      display_name = excluded.display_name,
      status = excluded.status,
      -- Kept rather than overwritten, so the first deactivation is the one on
      -- record instead of the most recent sync.
      deprovisioned_at = case
        when excluded.status = 'suspended'
          then coalesce(account.deprovisioned_at, excluded.deprovisioned_at)
        else null
      end,
      last_synced_at = excluded.last_synced_at;

  -- An account that has stopped appearing has been removed from the workspace
  -- entirely — deactivation keeps it in the member list. The portal reports
  -- what Slack contains, and a row for a member Slack no longer has is not
  -- that.
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
