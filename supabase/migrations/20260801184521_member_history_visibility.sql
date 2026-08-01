begin;

drop policy if exists memberships_authorized_read on public.memberships;
create policy memberships_authorized_read
on public.memberships
for select
to authenticated
using (
  person_id = (select private.current_person_id())
  or (
    (select private.is_portal_member())
    and status in ('active', 'alumni', 'ended')
  )
  or (select private.is_organization_admin(organization_id))
);

commit;
