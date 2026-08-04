begin;

-- The deployed database was missing the entire second half of
-- 20260802090000_separate_portal_and_organization_admin.sql even though that
-- migration is recorded as applied: no membership_periods table, no
-- memberships_create_period trigger, no deactivate_own_portal_access, an
-- older set_organization_membership_status that never touches periods, and a
-- people_portal_access_status_check that still rejects 'deactivated'. That is
-- the failure mode AGENTS.md warns about — a migration file edited after it
-- had already been pushed replays only on a fresh reset.
--
-- Everything here is written to be safe on a database that already has it, so
-- local and deployed converge on the same definitions. Without it, portal
-- management cannot deactivate or delete anybody: the check constraint rejects
-- the status it has to write.

create table if not exists public.membership_periods (
  id bigint generated always as identity primary key,
  membership_id bigint not null references public.memberships (id) on delete cascade,
  starts_on date not null,
  ends_on date,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  constraint membership_periods_dates_check
    check (ends_on is null or ends_on >= starts_on),
  constraint membership_periods_end_state_check
    check (
      (ends_on is null and ended_at is null)
      or (ends_on is not null and ended_at is not null)
    )
);

create unique index if not exists membership_periods_one_open_idx
  on public.membership_periods (membership_id)
  where ends_on is null;

create index if not exists membership_periods_membership_starts_idx
  on public.membership_periods (membership_id, starts_on desc);

alter table public.membership_periods enable row level security;

drop policy if exists membership_periods_authorized_read on public.membership_periods;
create policy membership_periods_authorized_read
on public.membership_periods
for select
to authenticated
using (
  exists (
    select 1
    from public.memberships as membership
    where membership.id = membership_id
      and (
        membership.person_id = (select private.current_person_id())
        or (
          (select private.is_portal_member())
          and membership.status in ('active', 'ended')
        )
        or (select private.is_organization_admin(membership.organization_id))
      )
  )
);

revoke all on public.membership_periods from anon, authenticated;
grant select on public.membership_periods to authenticated;
grant all on public.membership_periods to service_role;
grant usage, select on sequence public.membership_periods_id_seq to service_role;

-- Rebuild the history the trigger would have written. Memberships that already
-- have a period keep it untouched.
insert into public.membership_periods (
  membership_id,
  starts_on,
  ends_on,
  started_at,
  ended_at
)
select
  membership.id,
  coalesce(membership.starts_on, membership.created_at::date),
  case when membership.status = 'ended'
    then coalesce(membership.ends_on, membership.created_at::date)
    else null
  end,
  membership.created_at,
  case when membership.status = 'ended'
    then coalesce(membership.ended_at, membership.updated_at)
    else null
  end
from public.memberships as membership
where membership.status in ('active', 'ended')
  and not exists (
    select 1
    from public.membership_periods as period
    where period.membership_id = membership.id
  );

create or replace function private.create_membership_period()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active' then
    insert into public.membership_periods (
      membership_id,
      starts_on,
      started_at
    ) values (
      new.id,
      coalesce(new.starts_on, current_date),
      new.created_at
    );
  elsif new.status = 'ended' then
    insert into public.membership_periods (
      membership_id,
      starts_on,
      ends_on,
      started_at,
      ended_at
    ) values (
      new.id,
      coalesce(new.starts_on, new.ends_on, current_date),
      coalesce(new.ends_on, current_date),
      new.created_at,
      coalesce(new.ended_at, new.created_at)
    );
  end if;

  return new;
end;
$$;

revoke all on function private.create_membership_period()
  from public, anon, authenticated;

drop trigger if exists memberships_create_period on public.memberships;
create trigger memberships_create_period
after insert on public.memberships
for each row execute function private.create_membership_period();

alter table public.people
  drop constraint if exists people_portal_access_status_check;
alter table public.people
  add constraint people_portal_access_status_check
    check (portal_access_status in ('unclaimed', 'active', 'suspended', 'deactivated'));

create or replace function public.set_organization_membership_status(
  p_membership_id bigint,
  p_status text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  membership_row public.memberships%rowtype;
  actor_person_id bigint;
begin
  if p_status not in ('active', 'ended') then
    raise exception using errcode = 'P0001', message = 'invalid_membership_status';
  end if;

  actor_person_id := (select private.current_person_id());

  select * into membership_row
  from public.memberships
  where id = p_membership_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'membership_not_found';
  end if;

  if actor_person_id is null
    or not (select private.is_organization_admin(membership_row.organization_id))
  then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if membership_row.status = p_status then
    return;
  end if;

  if p_status = 'active'
    and not exists (
      select 1
      from public.person_emails as person_email
      where person_email.person_id = membership_row.person_id
    )
  then
    raise exception using errcode = '23514', message = 'membership_email_required';
  end if;

  if p_status = 'ended'
    and membership_row.role = 'organization_admin'
    and not exists (
      select 1
      from public.memberships as other_administrator
      where other_administrator.organization_id = membership_row.organization_id
        and other_administrator.role = 'organization_admin'
        and other_administrator.status = 'active'
        and other_administrator.id <> membership_row.id
    )
  then
    raise exception using errcode = 'P0001', message = 'last_organization_admin';
  end if;

  if p_status = 'ended' then
    update public.membership_periods
    set ends_on = current_date,
        ended_at = now()
    where membership_id = membership_row.id
      and ends_on is null;

    update public.team_memberships as team_membership
    set ends_on = current_date
    where team_membership.person_id = membership_row.person_id
      and (team_membership.ends_on is null or team_membership.ends_on > current_date)
      and exists (
        select 1
        from public.teams as team
        where team.id = team_membership.team_id
          and team.organization_id = membership_row.organization_id
      );

    update public.profile_experience_roles as experience_role
    set ends_on = current_date
    where (experience_role.ends_on is null or experience_role.ends_on > current_date)
      and exists (
        select 1
        from public.profile_experiences as experience
        where experience.id = experience_role.experience_id
          and experience.membership_id = membership_row.id
      );

    update public.profile_experiences
    set ends_on = current_date
    where membership_id = membership_row.id;
  end if;

  update public.memberships
  set status = p_status,
      role = case when p_status = 'active' then 'member' else role end,
      starts_on = case when p_status = 'active' then current_date else starts_on end,
      ends_on = case when p_status = 'ended' then current_date else null end,
      ended_at = case when p_status = 'ended' then now() else null end
  where id = membership_row.id;

  if p_status = 'active' then
    insert into public.membership_periods (
      membership_id,
      starts_on
    ) values (
      membership_row.id,
      current_date
    );
  end if;

  insert into public.audit_events (
    actor_person_id,
    action,
    target_person_id,
    organization_id,
    details
  ) values (
    actor_person_id,
    'membership.status_changed',
    membership_row.person_id,
    membership_row.organization_id,
    jsonb_build_object(
      'membership_id', membership_row.id,
      'previous_status', membership_row.status,
      'status', p_status,
      'role', case when p_status = 'active' then 'member' else membership_row.role end
    )
  );
end;
$$;

revoke all on function public.set_organization_membership_status(bigint, text) from public, anon;
grant execute on function public.set_organization_membership_status(bigint, text) to authenticated;

create or replace function public.deactivate_own_portal_access()
returns void
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  actor_person_id bigint;
begin
  actor_person_id := (select private.current_person_id());

  if actor_person_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;

  if exists (
    select 1
    from public.memberships as membership
    where membership.person_id = actor_person_id
      and membership.status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'active_membership_exists';
  end if;

  if (select private.is_portal_admin()) then
    raise exception using errcode = 'P0001', message = 'portal_admin_transfer_required';
  end if;

  update public.people
  set portal_access_status = 'deactivated'
  where id = actor_person_id
    and portal_access_status = 'active';

  if not found then
    raise exception using errcode = 'P0001', message = 'portal_access_not_active';
  end if;

  insert into public.audit_events (
    actor_person_id,
    action,
    target_person_id,
    details
  ) values (
    actor_person_id,
    'portal_access.deactivated',
    actor_person_id,
    jsonb_build_object('source', 'self_service')
  );
end;
$$;

revoke all on function public.deactivate_own_portal_access() from public, anon;
grant execute on function public.deactivate_own_portal_access() to authenticated;

notify pgrst, 'reload schema';

commit;
