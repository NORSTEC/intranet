begin;

drop policy if exists person_emails_authorized_read on public.person_emails;
create policy person_emails_authorized_read
on public.person_emails
for select
to authenticated
using (
  (select private.can_manage_person(person_id))
  or (
    email_type = 'organization'
    and (select private.can_view_person(person_id))
  )
);

commit;
