begin;

-- A request that has already been answered by something else should not still
-- be sitting in somebody's queue.
--
-- Two ways in: linking an approved organization account creates the missing
-- membership directly, and so does signing in with one for the first time.
-- Neither went anywhere near the access-request tables, so an alumni request
-- waiting on a portal administrator survived the applicant becoming an active
-- member — and could still be approved afterwards, granting alumni access to
-- somebody who is not an alumnus. A request to join the very organization the
-- membership just arrived in survived the same way.
--
-- This lives on the membership rather than in the three functions that create
-- one, because "a membership exists now" is the fact that answers the request,
-- and the fourth caller would have forgotten. `merge_people` gets it too: an
-- active membership moving onto a profile with a request pending answers that
-- request as surely as a new one would.
create or replace function private.cancel_requests_answered_by_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cancelled_request record;
begin
  if new.status <> 'active' then
    return new;
  end if;

  for cancelled_request in
    with cancelled as (
      update public.access_requests as request
      set status = 'cancelled'
      where request.person_id = new.person_id
        and request.status = 'pending'
        and (
          request.request_type = 'alumni'
          or request.organization_id = new.organization_id
        )
      returning request.id, request.request_type, request.organization_id
    )
    select cancelled.id, cancelled.request_type, cancelled.organization_id
    from cancelled
  loop
    insert into public.audit_events (
      actor_person_id, action, target_person_id, organization_id, details
    ) values (
      null,
      'access_request_cancelled',
      new.person_id,
      cancelled_request.organization_id,
      jsonb_build_object(
        'request_id', cancelled_request.id,
        'request_type', cancelled_request.request_type,
        'reason', 'membership_granted'
      )
    );
  end loop;

  return new;
end;
$$;

revoke all on function private.cancel_requests_answered_by_membership()
  from public, anon, authenticated;

drop trigger if exists memberships_cancel_answered_requests on public.memberships;
create trigger memberships_cancel_answered_requests
after insert or update of status, person_id on public.memberships
for each row execute function private.cancel_requests_answered_by_membership();

commit;
