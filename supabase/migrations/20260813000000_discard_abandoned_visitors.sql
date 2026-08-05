begin;

-- The trigger on `auth.users` builds a person the moment somebody signs in
-- with Google, before they have asked for anything. Most of them go on to
-- request access, and a declined request now takes the profile with it. What
-- was left over is the visitor who signed in, never asked, and never came
-- back: a name, an address, and a Google identity the portal has no reason to
-- hold and no basis for holding.
--
-- They are discarded 30 days after their last sign-in — the same retention
-- window a deleted account gets. The window is what separates an abandoned
-- profile from someone who signed in and is still deciding.
--
-- Only profiles the sign-in trigger created are ever considered:
-- `source = 'google'`. A person an administrator entered by hand is a record
-- somebody keeps on purpose, and no cleanup job is entitled to it.
create or replace function private.discard_abandoned_visitors()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  visitor_id bigint;
  discarded_count integer := 0;
begin
  for visitor_id in
    select person.id
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
      -- Any request at all, whatever became of it, means this person did ask
      -- the organization for something. A withdrawn or approved-then-ended
      -- history is a relationship; this job only removes people who never
      -- started one.
      and not exists (
        select 1
        from public.access_requests as request
        where request.person_id = person.id
      )
      and not exists (
        select 1
        from public.historical_membership_requests as request
        where request.person_id = person.id
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
    if private.discard_declined_applicant(visitor_id) then
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
          'discarded_person_id', visitor_id,
          'source', 'retention_expiry'
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
