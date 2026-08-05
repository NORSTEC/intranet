-- Suspending a Workspace account was keyed on the person it belongs to, which
-- quietly made the accounts most worth acting on unreachable: the ones nobody
-- in the portal owns. Those are exactly what the directory reconciliation
-- exists to surface — an account left behind by somebody who left years ago —
-- and there was no way to act on one without first inventing a portal profile
-- for a person who does not need one.
--
-- Google's own user id is the key instead. Every account in the directory has
-- one whether or not a person in the portal claims it, and it survives an
-- address change, which the email does not.

drop function if exists public.set_workspace_account_suspended(bigint, boolean);

create or replace function public.set_workspace_account_suspended(
  p_external_id text,
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
  where account.external_id = btrim(coalesce(p_external_id, ''))
    and account.organization_id = norstec_id
    and account.provider = 'google_workspace'
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'account_not_found';
  end if;

  if existing.status = next_status then
    return;
  end if;

  update public.external_accounts as account
  set status = next_status,
      deprovisioned_at = case when p_suspended then now() else null end
  where account.id = existing.id;

  -- `target_person_id` stays null for an account no profile claims. The audit
  -- trail still records which address was acted on, which is the whole of what
  -- happened when there is no person to point at.
  insert into public.audit_events (
    actor_person_id, action, target_person_id, organization_id, details
  ) values (
    actor_person_id,
    case
      when p_suspended then 'workspace_account.suspended'
      else 'workspace_account.reactivated'
    end,
    existing.person_id,
    norstec_id,
    jsonb_build_object('account_email', existing.account_email)
  );
end;
$$;

revoke all on function public.set_workspace_account_suspended(text, boolean)
  from public, anon;
grant execute on function public.set_workspace_account_suspended(text, boolean)
  to authenticated;

notify pgrst, 'reload schema';
