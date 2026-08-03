begin;

create or replace function public.debug_org_admin_check(p_organization_id bigint)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select format(
    'auth_uid=%s person_id=%s is_portal_admin=%s is_org_admin=%s',
    (select auth.uid()),
    (select private.current_person_id()),
    (select private.is_portal_admin()),
    (select private.is_organization_admin(p_organization_id))
  );
$$;

revoke all on function public.debug_org_admin_check(bigint) from public, anon;
grant execute on function public.debug_org_admin_check(bigint) to authenticated;

commit;
