begin;

alter table public.people
  add column phone_number text;

alter table public.people
  add constraint people_phone_number_check
  check (
    phone_number is null
    or (
      char_length(btrim(phone_number)) between 3 and 40
      and phone_number ~ '^[0-9+() .-]+$'
    )
  );

alter table public.memberships
  add column ends_on date;

alter table public.memberships
  add constraint memberships_history_dates_check
  check (
    ends_on is null
    or starts_on is null
    or ends_on >= starts_on
  );

alter table public.team_memberships
  add column starts_on date,
  add column ends_on date;

alter table public.team_memberships
  add constraint team_memberships_history_dates_check
  check (
    ends_on is null
    or starts_on is null
    or ends_on >= starts_on
  );

grant update (phone_number) on public.people to authenticated;
grant update (starts_on, ends_on) on public.memberships to authenticated;
grant insert (
  team_id,
  person_id,
  role_title,
  starts_on,
  ends_on
) on public.team_memberships to authenticated;
grant update (
  role_title,
  starts_on,
  ends_on
) on public.team_memberships to authenticated;
grant delete on public.team_memberships to authenticated;

create policy memberships_self_history_update
on public.memberships
for update
to authenticated
using (person_id = (select private.current_person_id()))
with check (person_id = (select private.current_person_id()));

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
      and membership.status in ('active', 'alumni')
      and team.status = 'active'
  )
);

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
      and membership.status in ('active', 'alumni')
      and team.status = 'active'
  )
);

create policy team_memberships_self_delete
on public.team_memberships
for delete
to authenticated
using (person_id = (select private.current_person_id()));

commit;
