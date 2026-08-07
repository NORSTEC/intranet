begin;

-- Three moments in a person's life here are decided by somebody else and are
-- worth an email: an access request approved, an access request declined, and
-- the last active membership ending. The portal already shows all three once
-- the person signs in, but the third one can take away the very account they
-- would sign in with, so waiting for them to look is not good enough.
--
-- The rows are queued here rather than sent from the server action, because
-- only the function that performs the decision knows what was true before it.
-- "Became an alumnus" is not a column — `derivePersonStatus` derives it from
-- how many active memberships remain — so the transition is knowable only
-- inside `set_organization_membership_status`, between the update and the
-- commit. Queueing in the same transaction also means a decision that rolls
-- back sends nothing, which the alternative cannot promise.
create table private.pending_notifications (
  id bigint generated always as identity primary key,
  kind text not null,
  -- Null once the person is gone. A declined applicant is deleted by
  -- `private.discard_declined_applicant` in the very transaction that queues
  -- their rejection email, so the recipient has to be copied onto this row
  -- rather than read back through the reference. `on delete cascade` here
  -- would delete the notification microseconds after queueing it.
  person_id bigint references public.people (id) on delete set null,
  -- Who caused the notification, and therefore who is allowed to drain it.
  -- See `public.claim_pending_notifications`.
  enqueued_by_person_id bigint references public.people (id) on delete set null,
  recipient_email text not null,
  recipient_name text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  attempts smallint not null default 0,
  last_error text,
  constraint pending_notifications_kind_check
    check (kind in (
      'access_request_approved',
      'access_request_rejected',
      'membership_ended'
    )),
  constraint pending_notifications_recipient_email_lowercase_check
    check (recipient_email = lower(recipient_email)),
  constraint pending_notifications_recipient_email_format_check
    check (recipient_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  constraint pending_notifications_last_error_length_check
    check (last_error is null or char_length(last_error) <= 500)
);

create index pending_notifications_unclaimed_idx
  on private.pending_notifications (created_at)
  where claimed_at is null;

-- The `private` schema is not exposed through PostgREST, but a table holding
-- names and email addresses should not rely on that alone.
revoke all on private.pending_notifications from public, anon, authenticated;
alter table private.pending_notifications enable row level security;

-- Which address to write to. Two different questions, so two different
-- answers:
--
--   * A decision on an access request goes to the address the request was
--     made from — their primary one.
--   * The end of a membership may be followed by the norstec.no Workspace
--     account being suspended, and that address is exactly the one that stops
--     working. So prefer anything else: a personal address first, and a
--     norstec.no address only when there is nothing else on file.
create or replace function private.notification_recipient(
  p_person_id bigint,
  p_avoid_organization_domain boolean
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select address.email
  from public.person_emails as address
  where address.person_id = p_person_id
  order by
    case
      when p_avoid_organization_domain
        then (address.email like '%@norstec.no')
      else false
    end asc,
    case
      when p_avoid_organization_domain
        then (address.email_type = 'personal')
      else false
    end desc,
    address.is_primary desc,
    address.created_at,
    address.id
  limit 1;
$$;

revoke all on function private.notification_recipient(bigint, boolean)
  from public, anon, authenticated;

-- True when every account this person signs in with belongs to the norstec.no
-- Workspace. Suspending that Workspace account then locks them out of the
-- portal entirely, and the only way back in is to link a personal Google
-- account first — which they cannot do once they are locked out. That is the
-- warning the membership email carries, and it is only honest to include it
-- when it is actually true.
create or replace function private.signs_in_only_with_workspace(p_person_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.portal_accounts as account
    where account.person_id = p_person_id
  )
  and not exists (
    select 1
    from public.portal_accounts as account
    where account.person_id = p_person_id
      and account.account_email not like '%@norstec.no'
  );
$$;

revoke all on function private.signs_in_only_with_workspace(bigint)
  from public, anon, authenticated;

create or replace function private.enqueue_notification(
  p_kind text,
  p_person_id bigint,
  p_recipient_email text,
  p_recipient_name text,
  p_payload jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  -- A person with no address on file cannot be written to. That is not an
  -- error worth failing the decision over — the decision itself is what
  -- matters, and the portal still shows it on next sign-in.
  if p_recipient_email is null or p_recipient_name is null then
    return;
  end if;

  insert into private.pending_notifications (
    kind,
    person_id,
    enqueued_by_person_id,
    recipient_email,
    recipient_name,
    payload
  ) values (
    p_kind,
    p_person_id,
    (select private.current_person_id()),
    lower(p_recipient_email),
    p_recipient_name,
    coalesce(p_payload, '{}'::jsonb)
  );
end;
$$;

revoke all on function private.enqueue_notification(text, bigint, text, text, jsonb)
  from public, anon, authenticated;

-- Hands the caller the notifications it is entitled to send, and marks them
-- claimed so a second concurrent request does not send them again.
--
-- The portal holds no privileged Supabase key by design, so this runs as the
-- signed-in person and has to be scoped to them. Two people may drain a row:
-- whoever caused it, who is about to do so milliseconds later in the same
-- request, and a portal administrator, who is the only retry path when a send
-- fails. `skip locked` keeps two of them from colliding.
--
-- `claimed_at` is also a timeout: a claim older than five minutes is treated
-- as abandoned, which covers a function that died between claiming and
-- sending.
create or replace function public.claim_pending_notifications(p_limit integer default 20)
returns table (
  id bigint,
  kind text,
  recipient_email text,
  recipient_name text,
  payload jsonb
)
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  caller_person_id bigint;
begin
  caller_person_id := (select private.current_person_id());

  if caller_person_id is null then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception using errcode = 'P0001', message = 'invalid_limit';
  end if;

  return query
  with claimable as (
    select notification.id
    from private.pending_notifications as notification
    where (
        notification.claimed_at is null
        or notification.claimed_at < now() - interval '5 minutes'
      )
      and notification.attempts < 5
      and (
        notification.enqueued_by_person_id = caller_person_id
        or (select private.is_portal_admin())
      )
    order by notification.created_at
    limit p_limit
    for update skip locked
  )
  update private.pending_notifications as notification
  set claimed_at = now(),
      attempts = notification.attempts + 1
  from claimable
  where notification.id = claimable.id
  returning
    notification.id,
    notification.kind,
    notification.recipient_email,
    notification.recipient_name,
    notification.payload;
end;
$$;

revoke all on function public.claim_pending_notifications(integer) from public, anon;
grant execute on function public.claim_pending_notifications(integer) to authenticated;

-- Sent successfully: the row is deleted rather than marked, on purpose.
--
-- Keeping it would mean keeping a record that we emailed this address about a
-- declined application — for a person whose profile
-- `private.discard_declined_applicant` has just erased. The audit log already
-- records the decision; the queue does not need to outlive the send. Deleting
-- also makes the table self-limiting, so there is nothing to prune.
--
-- Failed: the error is kept so the next portal administrator to make any
-- decision picks the row back up. `attempts` caps the retries at five.
create or replace function public.settle_notification(
  p_id bigint,
  p_error text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  caller_person_id bigint;
begin
  caller_person_id := (select private.current_person_id());

  if caller_person_id is null then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if not exists (
    select 1
    from private.pending_notifications as notification
    where notification.id = p_id
      and (
        notification.enqueued_by_person_id = caller_person_id
        or (select private.is_portal_admin())
      )
  ) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if p_error is null then
    delete from private.pending_notifications where id = p_id;
  else
    update private.pending_notifications
    set claimed_at = null,
        last_error = left(p_error, 500)
    where id = p_id;
  end if;
end;
$$;

revoke all on function public.settle_notification(bigint, text) from public, anon;
grant execute on function public.settle_notification(bigint, text) to authenticated;

-- A queued notification nobody managed to send is not kept indefinitely. It
-- holds a name and an email address, and after a week it is stale news
-- anyway.
create or replace function private.discard_stale_notifications()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from private.pending_notifications
  where created_at < now() - interval '7 days';
$$;

revoke all on function private.discard_stale_notifications()
  from public, anon, authenticated;

commit;
