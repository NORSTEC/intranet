begin;

drop policy if exists team_memberships_self_insert on public.team_memberships;
create policy team_memberships_self_insert
on public.team_memberships
for insert
to authenticated
with check (
  person_id = (select private.current_person_id())
  and exists (
    select 1
    from public.teams as team
    join public.memberships as membership
      on membership.organization_id = team.organization_id
    where team.id = team_id
      and membership.person_id = (select private.current_person_id())
      and membership.status in ('active', 'alumni', 'ended')
      and team.status = 'active'
  )
);

drop policy if exists team_memberships_self_update on public.team_memberships;
create policy team_memberships_self_update
on public.team_memberships
for update
to authenticated
using (person_id = (select private.current_person_id()))
with check (
  person_id = (select private.current_person_id())
  and exists (
    select 1
    from public.teams as team
    join public.memberships as membership
      on membership.organization_id = team.organization_id
    where team.id = team_id
      and membership.person_id = (select private.current_person_id())
      and membership.status in ('active', 'alumni', 'ended')
      and team.status = 'active'
  )
);

commit;
