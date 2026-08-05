begin;

-- An approval used to swallow the note written with it. The reviewer types a
-- welcome in the decision dialog, the request flips to approved, and the next
-- sign-in goes straight past /access into the portal — nothing ever shows it.
-- The note is carried to the dashboard instead, until the person dismisses it
-- once, which is what this column records. A declined request needs the same
-- column so the two decisions stay one shape, even though /access shows a
-- declined note for as long as it is the latest request.
alter table public.access_requests
  add column if not exists decision_acknowledged_at timestamptz;

create or replace function public.acknowledge_own_access_decision(
  p_request_id bigint
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
  request_row public.access_requests%rowtype;
begin
  caller_person_id := (select private.current_person_id());

  if caller_person_id is null then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  select * into request_row
  from public.access_requests
  where id = p_request_id
  for update;

  -- Only the person the decision was about may put it away, and only a
  -- decided request has anything to put away.
  if not found or request_row.person_id <> caller_person_id then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if request_row.status not in ('approved', 'rejected') then
    raise exception using errcode = 'P0001', message = 'request_not_decided';
  end if;

  update public.access_requests
  set decision_acknowledged_at = now()
  where id = request_row.id
    and decision_acknowledged_at is null;
end;
$$;

revoke all on function public.acknowledge_own_access_decision(bigint)
  from public, anon;
grant execute on function public.acknowledge_own_access_decision(bigint)
  to authenticated;

commit;
