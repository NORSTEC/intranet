--
-- A queued email that is never sent currently disappears without trace.
--
-- The queue has no worker, deliberately: draining it needs the recipient's
-- address, and the intranet holds no key that can read every member's. A row is
-- drained by the administrator whose decision queued it, and a row left
-- stranded by a failed send is picked up the next time any intranet
-- administrator decides anything. That covers the ordinary case.
--
-- What it does not cover is a quiet week. After seven days
-- `private.discard_stale_notifications` deletes the row, and until now it did
-- so silently — so the one outcome nobody could see was the one that mattered:
-- a member told they were approved, who never was.
--
-- Deleting them is still right. Keeping an undeliverable address indefinitely
-- is not what the retention notice says the intranet does. So the row goes and
-- a record of its going stays.
--
-- The address itself is not copied across. `target_person_id` already says who
-- it was, and audit events are read more widely, and kept far longer, than the
-- queue row they describe. It is null for a person deleted in the same
-- transaction that queued their rejection — the event still records that an
-- email was dropped, which is the part worth keeping.
--
-- `actor_person_id` stays null: nobody did this, a schedule did.
--

begin;

create or replace function private.discard_stale_notifications()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  with discarded as (
    delete from private.pending_notifications
    where created_at < now() - interval '7 days'
    returning kind, person_id, created_at, attempts, last_error
  )
  insert into public.audit_events (action, target_person_id, details)
  select
    'notification.discarded',
    discarded.person_id,
    jsonb_build_object(
      'kind', discarded.kind,
      'queued_at', discarded.created_at,
      'attempts', discarded.attempts,
      -- Null when the row was never claimed at all, which is a different
      -- failure from one that was tried and refused.
      'last_error', discarded.last_error
    )
  from discarded;
$$;

revoke all on function private.discard_stale_notifications()
  from public, anon, authenticated;

commit;
