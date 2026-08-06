begin;

-- Members could read every address on a profile that happened to be typed
-- `organization`, not just the address the person is reachable at. That rule
-- was written when an organization address *was* the directory address; now
-- that a person chooses their contact address, it is the only one the
-- directory has any use for, and the rest are the person's own business.
--
-- It mattered in both directions. Somebody who had never seen their own
-- imported or merged-in addresses had them shown to every member. And an
-- alumnus who moved their contact address to a personal one still had the
-- organization address they had left behind on display beside it.
--
-- Nobody who administers the person loses anything: `can_manage_person`
-- covers the person themselves, their organization administrators, and portal
-- administrators, and it is still the first branch.
drop policy if exists person_emails_authorized_read on public.person_emails;
create policy person_emails_authorized_read
on public.person_emails
for select
to authenticated
using (
  (select private.can_manage_person(person_id))
  or (
    is_primary
    and (select private.can_view_person(person_id))
  )
);

commit;
