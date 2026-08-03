begin;

-- An alumnus approved through an alumni access request holds no membership
-- row at all, so the membership-based portal-member check locked them out of
-- the member directory, organizations, teams and avatars. Granted alumni
-- access counts as ordinary portal membership; admin authorization stays
-- active-membership-only in is_norstec_admin/is_organization_admin.
create or replace function private.is_portal_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.memberships as membership
      join public.people as person on person.id = membership.person_id
      where membership.person_id = (select private.current_person_id())
        and membership.status in ('active', 'ended')
        and person.portal_access_status = 'active'
    )
    or exists (
      select 1
      from public.people as person
      where person.id = (select private.current_person_id())
        and person.alumni_access_granted_at is not null
        and person.portal_access_status = 'active'
    );
$$;

revoke all on function private.is_portal_member() from public, anon;
grant execute on function private.is_portal_member() to authenticated;

-- The same alumnus must also be visible to everyone else: the directory is
-- the point of the portal, and a membership row is no longer the only proof
-- that someone belongs in it.
create or replace function private.can_view_person(target_person_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_person_id = (select private.current_person_id())
    or (select private.can_manage_person(target_person_id))
    or (
      (select private.is_portal_member())
      and (
        exists (
          select 1
          from public.memberships as target_membership
          where target_membership.person_id = target_person_id
            and target_membership.status in ('active', 'ended')
        )
        or exists (
          select 1
          from public.people as target_person
          where target_person.id = target_person_id
            and target_person.alumni_access_granted_at is not null
            and target_person.portal_access_status = 'active'
        )
      )
    );
$$;

revoke all on function private.can_view_person(bigint) from public, anon;
grant execute on function private.can_view_person(bigint) to authenticated;

commit;
