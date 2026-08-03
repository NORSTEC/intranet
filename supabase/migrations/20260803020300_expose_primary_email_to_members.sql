begin;

-- The directory only exposed organization email addresses, so an alumnus who
-- signs in with a private Google account — and any member who joined with a
-- private address instead of an organization one — appeared without any way
-- to contact them. A person's primary address is their directory address,
-- whatever its type; every other address stays private to the person and
-- those who administer them.
drop policy if exists person_emails_authorized_read on public.person_emails;
create policy person_emails_authorized_read
on public.person_emails
for select
to authenticated
using (
  (select private.can_manage_person(person_id))
  or (
    (email_type = 'organization' or is_primary)
    and (select private.can_view_person(person_id))
  )
);

commit;
