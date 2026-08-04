begin;

-- Two gaps this closes, both of them about the per-person view in portal
-- management being able to show and change everything that matters:
--
-- 1. The organization-administrator role could only ever be handed out by
--    editing `memberships.role` directly. Every other permission change goes
--    through an audited `security definer` RPC; this one now does too.
-- 2. Team membership was the one membership change that left no audit trail,
--    so a person's history showed organization moves but never team ones.

create or replace function public.set_membership_role(
  p_membership_id bigint,
  p_role text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  actor_person_id bigint;
  membership_row public.memberships%rowtype;
  person_row public.people%rowtype;
begin
  if p_role not in ('member', 'organization_admin') then
    raise exception using errcode = 'P0001', message = 'invalid_membership_role';
  end if;

  actor_person_id := (select private.current_person_id());

  select * into membership_row
  from public.memberships
  where id = p_membership_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'membership_not_found';
  end if;

  -- `private.is_organization_admin` already ORs in portal administrators, so
  -- this covers both the organization's own admins and portal management.
  if actor_person_id is null
    or not (select private.is_organization_admin(membership_row.organization_id))
  then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if membership_row.role = p_role then
    return;
  end if;

  -- An ended membership's role is history. Promoting it would grant live
  -- authorization to somebody who is no longer a member of the organization.
  if membership_row.status <> 'active' then
    raise exception using errcode = 'P0001', message = 'membership_not_active';
  end if;

  select * into person_row
  from public.people
  where id = membership_row.person_id
  for update;

  if person_row.deleted_at is not null then
    raise exception using errcode = 'P0001', message = 'person_deleted';
  end if;

  if p_role = 'organization_admin'
    and person_row.portal_access_status <> 'active'
  then
    raise exception using errcode = 'P0001', message = 'portal_access_required';
  end if;

  -- Demoting the only administrator leaves the organization unmanageable,
  -- the same rule ending their membership already enforces.
  if p_role = 'member'
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

  update public.memberships
  set role = p_role
  where id = membership_row.id;

  insert into public.audit_events (
    actor_person_id, action, target_person_id, organization_id, details
  ) values (
    actor_person_id,
    'membership.role_changed',
    membership_row.person_id,
    membership_row.organization_id,
    jsonb_build_object(
      'membership_id', membership_row.id,
      'previous_role', membership_row.role,
      'role', p_role
    )
  );
end;
$$;

revoke all on function public.set_membership_role(bigint, text)
  from public, anon;
grant execute on function public.set_membership_role(bigint, text)
  to authenticated;

-- Unchanged apart from the audit events: the added and removed sets are
-- resolved before the table is touched, because afterwards there is no way
-- to tell who was already on the team.
create or replace function public.save_team_settings(
  p_team_id bigint,
  p_expected_updated_at timestamptz,
  p_name text,
  p_description text,
  p_person_ids bigint[]
)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  target_organization_id bigint;
  saved_at timestamptz;
  caller_person_id bigint;
  member_ids bigint[];
  added_person_ids bigint[];
  removed_person_ids bigint[];
begin
  select team.organization_id into target_organization_id
  from public.teams as team
  where team.id = p_team_id;

  if target_organization_id is null then
    raise exception using errcode = 'P0001', message = 'team_not_found';
  end if;

  if not (select private.is_organization_admin(target_organization_id)) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if char_length(btrim(p_name)) < 1 or char_length(btrim(p_name)) > 160 then
    raise exception using errcode = 'P0001', message = 'invalid_team';
  end if;

  if p_description is not null and char_length(p_description) > 5000 then
    raise exception using errcode = 'P0001', message = 'invalid_team';
  end if;

  member_ids := coalesce(p_person_ids, array[]::bigint[]);

  if exists (
    select 1
    from unnest(member_ids) as person_id
    where not exists (
      select 1 from public.memberships as membership
      where membership.person_id = person_id
        and membership.organization_id = target_organization_id
        and membership.status in ('active', 'ended')
    )
  ) then
    raise exception using errcode = 'P0001', message = 'invalid_team_member';
  end if;

  caller_person_id := (select private.current_person_id());

  select coalesce(array_agg(team_membership.person_id), array[]::bigint[])
    into removed_person_ids
  from public.team_memberships as team_membership
  where team_membership.team_id = p_team_id
    and team_membership.archived_at is null
    and not (team_membership.person_id = any (member_ids));

  select coalesce(array_agg(candidate.person_id), array[]::bigint[])
    into added_person_ids
  from unnest(member_ids) as candidate (person_id)
  where not exists (
    select 1
    from public.team_memberships as team_membership
    where team_membership.team_id = p_team_id
      and team_membership.person_id = candidate.person_id
      and team_membership.archived_at is null
  );

  update public.teams
  set name = btrim(p_name),
      description = nullif(btrim(p_description), '')
  where id = p_team_id
    and updated_at = p_expected_updated_at
  returning updated_at into saved_at;

  if saved_at is null then
    if exists (select 1 from public.teams where id = p_team_id) then
      raise exception using errcode = 'P0001', message = 'team_conflict';
    end if;
    raise exception using errcode = 'P0001', message = 'team_not_found';
  end if;

  update public.team_memberships
  set archived_at = now(),
      archived_by_person_id = caller_person_id
  where team_id = p_team_id
    and archived_at is null
    and not (person_id = any (member_ids));

  insert into public.team_memberships (team_id, person_id)
  select p_team_id, person_id
  from unnest(member_ids) as person_id
  on conflict (team_id, person_id) do update
    set archived_at = null,
        archived_by_person_id = null
    where public.team_memberships.archived_at is not null;

  -- The team name is stored alongside the id so the audit line stays
  -- readable after a rename, or after the team itself is deleted.
  insert into public.audit_events (
    actor_person_id, action, target_person_id, organization_id, details
  )
  select
    caller_person_id,
    'team_membership.added',
    person_id,
    target_organization_id,
    jsonb_build_object('team_id', p_team_id, 'team_name', btrim(p_name))
  from unnest(added_person_ids) as person_id;

  insert into public.audit_events (
    actor_person_id, action, target_person_id, organization_id, details
  )
  select
    caller_person_id,
    'team_membership.removed',
    person_id,
    target_organization_id,
    jsonb_build_object('team_id', p_team_id, 'team_name', btrim(p_name))
  from unnest(removed_person_ids) as person_id;

  return saved_at;
end;
$$;

revoke all on function public.save_team_settings(
  bigint, timestamptz, text, text, bigint[]
) from public, anon;
grant execute on function public.save_team_settings(
  bigint, timestamptz, text, text, bigint[]
) to authenticated;

notify pgrst, 'reload schema';

commit;
