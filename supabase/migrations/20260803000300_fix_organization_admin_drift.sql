begin;

-- The deployed private.is_organization_admin was missing the portal-admin
-- fallback that migration 20260802090000 intended to add (confirmed via
-- pg_get_functiondef against the live database), leaving portal admins
-- unable to manage organizations they don't personally belong to. Re-assert
-- the intended definition.
create or replace function private.is_organization_admin(target_organization_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select private.is_portal_admin())
    or exists (
      select 1
      from public.memberships as membership
      where membership.person_id = (select private.current_person_id())
        and membership.organization_id = target_organization_id
        and membership.status = 'active'
        and membership.role = 'organization_admin'
    );
$$;

revoke all on function private.is_organization_admin(bigint) from public, anon;
grant execute on function private.is_organization_admin(bigint) to authenticated;

commit;
