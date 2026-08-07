begin;

-- `20260813000000_discard_abandoned_visitors.sql` refused to touch anybody who
-- had ever filed a request, on the reasoning that asking the organization for
-- something is a relationship the portal should keep. That holds for a request
-- that was decided. It does not hold for one the person took back: withdrawing
-- is the ask being retracted, and what remains is the same abandoned profile
-- the job was written for — a name, an address and a Google identity, with
-- nothing on the other side of them. Those profiles were the one group nothing
-- ever cleaned up. A declined applicant is discarded on the spot, an
-- undecided one is discarded after the retention window, and somebody who
-- withdrew stayed forever.
--
-- The withdrawal gets its own 30 days, counted from the withdrawal rather than
-- from the profile's age. Somebody who pulls a request today and reconsiders
-- next week is still deciding, exactly as a fresh visitor is, and the job has
-- no business taking their profile out from under them. Filing again puts a
-- pending request on the profile and removes it from this query entirely.
--
-- Every other guard is unchanged, including the ones that keep memberships,
-- alumni access, portal administrators, Workspace account holders and recent
-- sign-ins out of reach.
create or replace function private.discard_abandoned_visitors()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  visitor record;
  discarded_count integer := 0;
begin
  for visitor in
    select
      person.id,
      -- Which of the two reasons this profile qualified under, decided here
      -- rather than after the delete, when the requests are already gone.
      exists (
        select 1
        from public.access_requests as request
        where request.person_id = person.id
      ) or exists (
        select 1
        from public.historical_membership_requests as request
        where request.person_id = person.id
      ) as withdrew
    from public.people as person
    where person.source = 'google'
      and person.deleted_at is null
      and person.alumni_access_granted_at is null
      and person.created_at < now() - interval '30 days'
      and not exists (
        select 1
        from public.memberships as membership
        where membership.person_id = person.id
      )
      and not exists (
        select 1
        from public.portal_administrators as administrator
        where administrator.person_id = person.id
      )
      -- A request that still stands — pending, approved or declined — is a
      -- relationship, and this job only removes people who have none. A
      -- withdrawn one counts for nothing once its own window has run out.
      and not exists (
        select 1
        from public.access_requests as request
        where request.person_id = person.id
          and (
            request.status <> 'cancelled'
            or request.updated_at > now() - interval '30 days'
          )
      )
      and not exists (
        select 1
        from public.historical_membership_requests as request
        where request.person_id = person.id
          and (
            request.status <> 'cancelled'
            or request.updated_at > now() - interval '30 days'
          )
      )
      -- Signing in inside the window is exactly what "still deciding" looks
      -- like. A profile with no sign-in account left falls back to its own
      -- age, already checked above.
      and not exists (
        select 1
        from public.portal_accounts as account
        where account.person_id = person.id
          and account.last_seen_at > now() - interval '30 days'
      )
    order by person.created_at
  loop
    -- `discard_declined_applicant` is named for its first caller, but what it
    -- does is delete a profile that is nothing but a profile — addresses,
    -- Google sign-in, avatar, link intents and all — and refuse the moment it
    -- finds anything more. That is exactly this job's delete, so it is reused
    -- rather than written twice. Returning false is not an error: it means the
    -- person stopped qualifying between the query above and the delete.
    if private.discard_declined_applicant(visitor.id) then
      -- Deliberately no name and no address. The whole point of the job is
      -- that the portal has no business holding this person's details, and an
      -- audit event that recorded them would put them straight back. The
      -- count and the date are what accountability needs here.
      insert into public.audit_events (
        actor_person_id, action, target_person_id, details
      ) values (
        null,
        'person.abandoned_discarded',
        null,
        jsonb_build_object(
          'discarded_person_id', visitor.id,
          'source',
          case when visitor.withdrew then 'withdrawal_expiry'
          else 'retention_expiry' end
        )
      );

      discarded_count := discarded_count + 1;
    end if;
  end loop;

  return discarded_count;
end;
$$;

revoke all on function private.discard_abandoned_visitors()
  from public, anon, authenticated;

commit;
