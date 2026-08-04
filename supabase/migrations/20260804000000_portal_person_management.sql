begin;

-- Portal management is the only place a person can be suspended, deleted,
-- merged, or given the portal-administrator permission. Organization
-- administration deliberately stops at membership state; everything in this
-- migration is portal-admin only and audited.

-- Deletion is two staged operations, not one. Soft deletion hides the person
-- everywhere and revokes their sessions while staying reversible; purging is
-- the separate, irreversible step that removes the auth identity and the
-- personal rows. GDPR requires erasure without undue delay, not in the same
-- transaction as the decision, so the reversible stage is safe to keep.
alter table public.people
  add column deleted_at timestamptz,
  add column deleted_by_person_id bigint references public.people (id) on delete set null,
  add column deletion_reason text,
  add column access_status_before_deletion text,
  add constraint people_deletion_reason_length_check
    check (
      deletion_reason is null
      or char_length(btrim(deletion_reason)) between 1 and 500
    ),
  add constraint people_access_status_before_deletion_check
    check (
      access_status_before_deletion is null
      or access_status_before_deletion
        in ('unclaimed', 'active', 'suspended', 'deactivated')
    ),
  add constraint people_deletion_state_check
    check (
      deleted_at is not null
      or (
        deleted_by_person_id is null
        and deletion_reason is null
        and access_status_before_deletion is null
      )
    );

create index people_deleted_at_idx
  on public.people (deleted_at)
  where deleted_at is not null;

create or replace function private.person_is_deleted(target_person_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.people as person
    where person.id = target_person_id
      and person.deleted_at is not null
  );
$$;

revoke all on function private.person_is_deleted(bigint) from public, anon;
grant execute on function private.person_is_deleted(bigint) to authenticated;

-- A portal administrator manages people who share no organization with them:
-- applicants, alumni without memberships, and duplicates created by a failed
-- account link. can_manage_person only ever reached members of a shared
-- organization, which left exactly those people unreachable from portal
-- management.
create or replace function private.can_manage_person(target_person_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_person_id = (select private.current_person_id())
    or (select private.is_portal_admin())
    or exists (
      select 1
      from public.memberships as caller_membership
      join public.memberships as target_membership
        on target_membership.organization_id = caller_membership.organization_id
      where caller_membership.person_id = (select private.current_person_id())
        and target_membership.person_id = target_person_id
        and caller_membership.status = 'active'
        and target_membership.status in ('planned', 'active', 'suspended', 'ended')
        and caller_membership.role = 'organization_admin'
    )
    or exists (
      select 1
      from public.access_requests as request
      where request.person_id = target_person_id
        and request.status = 'pending'
        and (select private.is_organization_admin(request.organization_id))
    );
$$;

-- A soft-deleted person stays visible to portal administrators — that is the
-- only way to restore or purge them — and disappears for everyone else.
create or replace function private.can_view_person(target_person_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select private.is_portal_admin())
    or (
      not (select private.person_is_deleted(target_person_id))
      and (
        target_person_id = (select private.current_person_id())
        or (select private.can_manage_person(target_person_id))
        or exists (
          select 1
          from public.access_requests as request
          where request.person_id = target_person_id
            and (select private.is_organization_admin(request.organization_id))
        )
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
        )
      )
    );
$$;

-- Hiding the person row is not enough on its own: the member directory, the
-- member-status table, and the team pages all read through membership rows,
-- and an unreadable person there would render as a nameless ghost row.
drop policy if exists memberships_authorized_read on public.memberships;
create policy memberships_authorized_read
on public.memberships
for select
to authenticated
using (
  (select private.is_portal_admin())
  or (
    not (select private.person_is_deleted(person_id))
    and (
      person_id = (select private.current_person_id())
      or (
        (select private.is_portal_member())
        and status in ('active', 'ended')
      )
      or (select private.is_organization_admin(organization_id))
    )
  )
);

drop policy if exists team_memberships_portal_member_read on public.team_memberships;
create policy team_memberships_portal_member_read
on public.team_memberships
for select
to authenticated
using (
  (select private.is_portal_admin())
  or (
    (select private.is_portal_member())
    and not (select private.person_is_deleted(person_id))
  )
);

-- Portal management lists linked sign-in accounts and current administrators.
drop policy if exists portal_accounts_same_person_read on public.portal_accounts;
create policy portal_accounts_same_person_read
on public.portal_accounts
for select
to authenticated
using (
  person_id = (select private.current_person_id())
  or (select private.is_portal_admin())
);

drop policy if exists portal_administrators_self_read on public.portal_administrators;
create policy portal_administrators_self_read
on public.portal_administrators
for select
to authenticated
using (
  person_id = (select private.current_person_id())
  or (select private.is_portal_admin())
);

grant select on public.portal_administrators to authenticated;

-- Suspending, deactivating, deleting, or merging someone must not leave a
-- live browser session behind. Deleting the session cascades its refresh
-- tokens, so the next token refresh fails instead of silently continuing.
create or replace function private.revoke_person_sessions(target_person_id bigint)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  delete from auth.sessions
  where user_id in (
    select account.auth_user_id
    from public.portal_accounts as account
    where account.person_id = target_person_id
  );
end;
$$;

revoke all on function private.revoke_person_sessions(bigint)
  from public, anon, authenticated;

create or replace function public.set_person_portal_access(
  p_person_id bigint,
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
  actor_person_id bigint;
  person_row public.people%rowtype;
begin
  actor_person_id := (select private.current_person_id());

  if actor_person_id is null or not (select private.is_portal_admin()) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if p_status not in ('active', 'suspended', 'deactivated') then
    raise exception using errcode = 'P0001', message = 'invalid_status';
  end if;

  -- Locking yourself out of portal management is never the intent, and it
  -- can leave the portal with no reachable administrator.
  if p_person_id = actor_person_id then
    raise exception using errcode = 'P0001', message = 'self_action_blocked';
  end if;

  select * into person_row
  from public.people
  where id = p_person_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'person_not_found';
  end if;

  if person_row.deleted_at is not null then
    raise exception using errcode = 'P0001', message = 'person_deleted';
  end if;

  if person_row.portal_access_status = p_status then
    return;
  end if;

  -- An unclaimed profile has never been signed in to. Activating it would
  -- claim nothing; the person still has to arrive through sign-in.
  if p_status = 'active' and person_row.portal_access_status = 'unclaimed' then
    raise exception using errcode = 'P0001', message = 'person_never_claimed';
  end if;

  if p_status <> 'active'
    and exists (
      select 1
      from public.portal_administrators as administrator
      where administrator.person_id = p_person_id
    )
  then
    raise exception using errcode = 'P0001', message = 'portal_admin_role_first';
  end if;

  update public.people
  set portal_access_status = p_status
  where id = p_person_id;

  if p_status <> 'active' then
    perform private.revoke_person_sessions(p_person_id);
  end if;

  insert into public.audit_events (
    actor_person_id, action, target_person_id, details
  ) values (
    actor_person_id,
    'portal_access.' || p_status,
    p_person_id,
    jsonb_build_object(
      'previous_status', person_row.portal_access_status,
      'source', 'portal_management'
    )
  );
end;
$$;

revoke all on function public.set_person_portal_access(bigint, text)
  from public, anon;
grant execute on function public.set_person_portal_access(bigint, text)
  to authenticated;

create or replace function public.set_portal_administrator(
  p_person_id bigint,
  p_is_administrator boolean
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
  person_row public.people%rowtype;
  remaining_administrator_count integer;
begin
  actor_person_id := (select private.current_person_id());

  if actor_person_id is null or not (select private.is_portal_admin()) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if p_person_id = actor_person_id then
    raise exception using errcode = 'P0001', message = 'self_action_blocked';
  end if;

  select * into person_row
  from public.people
  where id = p_person_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'person_not_found';
  end if;

  if person_row.deleted_at is not null then
    raise exception using errcode = 'P0001', message = 'person_deleted';
  end if;

  if p_is_administrator then
    if person_row.portal_access_status <> 'active' then
      raise exception using errcode = 'P0001', message = 'portal_access_required';
    end if;

    insert into public.portal_administrators (person_id, granted_by_person_id)
    values (p_person_id, actor_person_id)
    on conflict (person_id) do nothing;

    if not found then
      return;
    end if;
  else
    select count(*) into remaining_administrator_count
    from public.portal_administrators as administrator
    where administrator.person_id <> p_person_id;

    if remaining_administrator_count = 0 then
      raise exception using errcode = 'P0001', message = 'last_portal_admin';
    end if;

    delete from public.portal_administrators
    where person_id = p_person_id;

    if not found then
      return;
    end if;
  end if;

  insert into public.audit_events (
    actor_person_id, action, target_person_id, details
  ) values (
    actor_person_id,
    case when p_is_administrator
      then 'portal_administrator.granted'
      else 'portal_administrator.revoked'
    end,
    p_person_id,
    jsonb_build_object('source', 'portal_management')
  );
end;
$$;

revoke all on function public.set_portal_administrator(bigint, boolean)
  from public, anon;
grant execute on function public.set_portal_administrator(bigint, boolean)
  to authenticated;

create or replace function public.soft_delete_person(
  p_person_id bigint,
  p_reason text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '10s'
as $$
declare
  actor_person_id bigint;
  person_row public.people%rowtype;
  reason text;
begin
  actor_person_id := (select private.current_person_id());

  if actor_person_id is null or not (select private.is_portal_admin()) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if p_person_id = actor_person_id then
    raise exception using errcode = 'P0001', message = 'self_action_blocked';
  end if;

  reason := nullif(btrim(coalesce(p_reason, '')), '');

  if reason is not null and char_length(reason) > 500 then
    raise exception using errcode = 'P0001', message = 'reason_too_long';
  end if;

  select * into person_row
  from public.people
  where id = p_person_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'person_not_found';
  end if;

  if person_row.deleted_at is not null then
    raise exception using errcode = 'P0001', message = 'person_already_deleted';
  end if;

  -- Membership state belongs to the organization that owns it. Deleting the
  -- person out from under an active membership would erase a member the
  -- organization still counts as its own.
  if exists (
    select 1
    from public.memberships as membership
    where membership.person_id = p_person_id
      and membership.status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'active_membership_exists';
  end if;

  if exists (
    select 1
    from public.portal_administrators as administrator
    where administrator.person_id = p_person_id
  ) then
    raise exception using errcode = 'P0001', message = 'portal_admin_role_first';
  end if;

  update public.people
  set deleted_at = now(),
      deleted_by_person_id = actor_person_id,
      deletion_reason = reason,
      access_status_before_deletion = person_row.portal_access_status,
      portal_access_status = 'deactivated'
  where id = p_person_id;

  perform private.revoke_person_sessions(p_person_id);

  -- Outstanding requests would otherwise keep the person in front of every
  -- organization administrator's review queue.
  update public.access_requests
  set status = 'cancelled'
  where person_id = p_person_id
    and status = 'pending';

  update public.historical_membership_requests
  set status = 'cancelled'
  where person_id = p_person_id
    and status = 'pending';

  insert into public.audit_events (
    actor_person_id, action, target_person_id, details
  ) values (
    actor_person_id,
    'person.soft_deleted',
    p_person_id,
    jsonb_build_object(
      'previous_access_status', person_row.portal_access_status,
      'has_reason', reason is not null
    )
  );
end;
$$;

revoke all on function public.soft_delete_person(bigint, text) from public, anon;
grant execute on function public.soft_delete_person(bigint, text) to authenticated;

create or replace function public.restore_person(p_person_id bigint)
returns void
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  actor_person_id bigint;
  person_row public.people%rowtype;
begin
  actor_person_id := (select private.current_person_id());

  if actor_person_id is null or not (select private.is_portal_admin()) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  select * into person_row
  from public.people
  where id = p_person_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'person_not_found';
  end if;

  if person_row.deleted_at is null then
    raise exception using errcode = 'P0001', message = 'person_not_deleted';
  end if;

  update public.people
  set deleted_at = null,
      deleted_by_person_id = null,
      deletion_reason = null,
      access_status_before_deletion = null,
      portal_access_status =
        coalesce(person_row.access_status_before_deletion, 'suspended')
  where id = p_person_id;

  insert into public.audit_events (
    actor_person_id, action, target_person_id, details
  ) values (
    actor_person_id,
    'person.restored',
    p_person_id,
    jsonb_build_object(
      'restored_access_status',
      coalesce(person_row.access_status_before_deletion, 'suspended')
    )
  );
end;
$$;

revoke all on function public.restore_person(bigint) from public, anon;
grant execute on function public.restore_person(bigint) to authenticated;

-- Purging is irreversible. It requires the person to be soft-deleted already
-- and the caller to name the exact deletion it means to finish, so a stale
-- page cannot purge somebody who was restored and deleted again meanwhile.
-- The avatar path is returned because Storage objects live outside the
-- database and have to be removed by the caller.
create or replace function public.purge_person(
  p_person_id bigint,
  p_expected_deleted_at timestamptz
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '30s'
as $$
declare
  actor_person_id bigint;
  person_row public.people%rowtype;
begin
  actor_person_id := (select private.current_person_id());

  if actor_person_id is null or not (select private.is_portal_admin()) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if p_person_id = actor_person_id then
    raise exception using errcode = 'P0001', message = 'self_action_blocked';
  end if;

  select * into person_row
  from public.people
  where id = p_person_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'person_not_found';
  end if;

  if person_row.deleted_at is null then
    raise exception using errcode = 'P0001', message = 'person_not_deleted';
  end if;

  if p_expected_deleted_at is null
    or person_row.deleted_at <> p_expected_deleted_at
  then
    raise exception using errcode = 'P0001', message = 'purge_conflict';
  end if;

  if exists (
    select 1
    from public.portal_administrators as administrator
    where administrator.person_id = p_person_id
  ) then
    raise exception using errcode = 'P0001', message = 'portal_admin_role_first';
  end if;

  -- Deleting the auth user cascades its identities, sessions, and the portal
  -- account row, which is what releases the on delete restrict from
  -- portal_accounts back to the person.
  delete from auth.users
  where id in (
    select account.auth_user_id
    from public.portal_accounts as account
    where account.person_id = p_person_id
  );

  delete from private.portal_account_link_intents
  where initiator_person_id = p_person_id;

  -- Audit rows survive the person: who did what to whom is the record the
  -- portal is required to keep. The person references are nulled by their
  -- foreign keys; the free-form details are stripped of anything personal
  -- the original event happened to copy in.
  update public.audit_events as event
  set details = coalesce(
    (
      select jsonb_object_agg(entry.key, entry.value)
      from jsonb_each(event.details) as entry
      where entry.key not in (
          'account_email',
          'decision_note',
          'first_name',
          'full_name',
          'last_name',
          'linkedin_url',
          'message',
          'name',
          'phone_number'
        )
        and entry.key not like '%email%'
    ),
    '{}'::jsonb
  )
  where event.actor_person_id = p_person_id
     or event.target_person_id = p_person_id;

  delete from public.people where id = p_person_id;

  insert into public.audit_events (
    actor_person_id, action, target_person_id, details
  ) values (
    actor_person_id,
    'person.purged',
    null,
    jsonb_build_object('purged_person_id', p_person_id)
  );

  return person_row.avatar_path;
end;
$$;

revoke all on function public.purge_person(bigint, timestamptz) from public, anon;
grant execute on function public.purge_person(bigint, timestamptz) to authenticated;

-- Account linking stops and asks for portal-admin duplicate review whenever a
-- verified identity already belongs to another profile. Without a repair
-- workflow that review had no outcome to reach: the person stayed split in
-- two and could never link the account. Merging keeps the target person and
-- folds everything the source owns into it.
--
-- The administrator permission is deliberately not carried over. Roles are
-- assigned by an explicit, audited operation, never as a side effect.
create or replace function public.merge_people(
  p_target_person_id bigint,
  p_source_person_id bigint,
  p_primary_email text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '30s'
as $$
declare
  actor_person_id bigint;
  target_row public.people%rowtype;
  source_row public.people%rowtype;
  source_membership public.memberships%rowtype;
  target_membership public.memberships%rowtype;
  source_team_membership public.team_memberships%rowtype;
  target_team_membership public.team_memberships%rowtype;
  source_external_account public.external_accounts%rowtype;
  target_external_account public.external_accounts%rowtype;
  merged_status text;
  primary_email text;
  portal_account_count integer;
  source_was_portal_admin boolean;
begin
  actor_person_id := (select private.current_person_id());

  if actor_person_id is null or not (select private.is_portal_admin()) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if p_target_person_id = p_source_person_id then
    raise exception using errcode = 'P0001', message = 'same_person';
  end if;

  if p_source_person_id = actor_person_id then
    raise exception using errcode = 'P0001', message = 'self_action_blocked';
  end if;

  perform 1
  from public.people
  where id in (p_target_person_id, p_source_person_id)
  order by id
  for update;

  select * into target_row from public.people where id = p_target_person_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'target_not_found';
  end if;

  select * into source_row from public.people where id = p_source_person_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'source_not_found';
  end if;

  if target_row.deleted_at is not null or source_row.deleted_at is not null then
    raise exception using errcode = 'P0001', message = 'person_deleted';
  end if;

  select count(*) into portal_account_count
  from public.portal_accounts as account
  where account.person_id in (p_target_person_id, p_source_person_id);

  if portal_account_count > 2 then
    raise exception using errcode = 'P0001', message = 'too_many_portal_accounts';
  end if;

  primary_email := nullif(btrim(lower(coalesce(p_primary_email, ''))), '');

  -- Memberships move first. Everything downstream — the email guard, the
  -- alumni derivation — reads membership state, and the source must look
  -- empty by the time those run.
  for source_membership in
    select * from public.memberships where person_id = p_source_person_id
  loop
    select * into target_membership
    from public.memberships
    where person_id = p_target_person_id
      and organization_id = source_membership.organization_id;

    if not found then
      update public.memberships
      set person_id = p_target_person_id
      where id = source_membership.id;
      continue;
    end if;

    merged_status := case
      when 'active' in (target_membership.status, source_membership.status)
        then 'active'
      else target_membership.status
    end;

    -- The surviving role is the target's. A merge never promotes anyone.
    update public.memberships
    set status = merged_status,
        joined_at = least(target_membership.joined_at, source_membership.joined_at),
        starts_on = least(target_membership.starts_on, source_membership.starts_on),
        ends_on = case when merged_status = 'active' then null
          else greatest(target_membership.ends_on, source_membership.ends_on)
        end,
        ended_at = case when merged_status = 'active' then null
          else greatest(target_membership.ended_at, source_membership.ended_at)
        end
    where id = target_membership.id;

    -- Two open periods would be the same real interval counted twice, and
    -- the one-open-period index rejects them anyway.
    if exists (
      select 1
      from public.membership_periods
      where membership_id = target_membership.id
        and ends_on is null
    ) and exists (
      select 1
      from public.membership_periods
      where membership_id = source_membership.id
        and ends_on is null
    ) then
      update public.membership_periods as target_period
      set starts_on = least(target_period.starts_on, source_period.starts_on),
          started_at = least(target_period.started_at, source_period.started_at)
      from public.membership_periods as source_period
      where target_period.membership_id = target_membership.id
        and target_period.ends_on is null
        and source_period.membership_id = source_membership.id
        and source_period.ends_on is null;

      delete from public.membership_periods
      where membership_id = source_membership.id
        and ends_on is null;
    end if;

    update public.membership_periods
    set membership_id = target_membership.id
    where membership_id = source_membership.id;

    delete from public.memberships where id = source_membership.id;
  end loop;

  for source_team_membership in
    select * from public.team_memberships where person_id = p_source_person_id
  loop
    select * into target_team_membership
    from public.team_memberships
    where person_id = p_target_person_id
      and team_id = source_team_membership.team_id;

    if not found then
      update public.team_memberships
      set person_id = p_target_person_id
      where id = source_team_membership.id;
      continue;
    end if;

    update public.team_memberships
    set role_title = coalesce(
          target_team_membership.role_title,
          source_team_membership.role_title
        )
    where id = target_team_membership.id;

    delete from public.team_memberships where id = source_team_membership.id;
  end loop;

  for source_external_account in
    select * from public.external_accounts where person_id = p_source_person_id
  loop
    select * into target_external_account
    from public.external_accounts
    where person_id = p_target_person_id
      and organization_id = source_external_account.organization_id
      and provider = source_external_account.provider;

    if not found then
      update public.external_accounts
      set person_id = p_target_person_id
      where id = source_external_account.id;
      continue;
    end if;

    if target_external_account.status = 'not_started'
      and source_external_account.status <> 'not_started'
    then
      update public.external_accounts
      set status = source_external_account.status,
          external_id = source_external_account.external_id,
          account_email = source_external_account.account_email,
          provisioned_at = source_external_account.provisioned_at,
          deprovisioned_at = source_external_account.deprovisioned_at
      where id = target_external_account.id;
    end if;

    delete from public.external_accounts where id = source_external_account.id;
  end loop;

  -- A duplicate pending request for the same organization is the same
  -- request twice; the surviving one is the target's.
  update public.access_requests as source_request
  set status = 'cancelled'
  where source_request.person_id = p_source_person_id
    and source_request.status = 'pending'
    and exists (
      select 1
      from public.access_requests as target_request
      where target_request.person_id = p_target_person_id
        and target_request.status = 'pending'
        and target_request.organization_id is not distinct from
          source_request.organization_id
    );

  update public.access_requests
  set person_id = p_target_person_id
  where person_id = p_source_person_id;

  update public.access_requests
  set reviewed_by_person_id = p_target_person_id
  where reviewed_by_person_id = p_source_person_id;

  update public.historical_membership_requests
  set person_id = p_target_person_id
  where person_id = p_source_person_id;

  update public.historical_membership_requests
  set reviewed_by_person_id = p_target_person_id
  where reviewed_by_person_id = p_source_person_id;

  update public.profile_experiences
  set person_id = p_target_person_id
  where person_id = p_source_person_id;

  update public.team_memberships
  set archived_by_person_id = p_target_person_id
  where archived_by_person_id = p_source_person_id;

  -- Email addresses are globally unique, so the two sets can never collide.
  -- Only the one-primary-per-person index has to be respected, and it is
  -- resolved after everything has moved.
  update public.person_emails
  set person_id = p_target_person_id,
      is_primary = false
  where person_id = p_source_person_id;

  update public.person_emails
  set is_primary = false
  where person_id = p_target_person_id
    and is_primary;

  if primary_email is not null then
    update public.person_emails
    set is_primary = true
    where person_id = p_target_person_id
      and email = primary_email;

    if not found then
      raise exception using errcode = 'P0001', message = 'primary_email_not_found';
    end if;
  else
    update public.person_emails
    set is_primary = true
    where id = (
      select candidate.id
      from public.person_emails as candidate
      where candidate.person_id = p_target_person_id
      order by candidate.created_at, candidate.id
      limit 1
    );
  end if;

  update public.portal_accounts
  set person_id = p_target_person_id
  where person_id = p_source_person_id;

  update public.audit_events as event
  set actor_person_id = p_target_person_id
  where event.actor_person_id = p_source_person_id;

  update public.audit_events as event
  set target_person_id = p_target_person_id
  where event.target_person_id = p_source_person_id;

  source_was_portal_admin := exists (
    select 1
    from public.portal_administrators as administrator
    where administrator.person_id = p_source_person_id
  );

  delete from public.portal_administrators where person_id = p_source_person_id;

  update public.portal_administrators
  set granted_by_person_id = p_target_person_id
  where granted_by_person_id = p_source_person_id;

  delete from private.portal_account_link_intents
  where initiator_person_id = p_source_person_id;

  -- The target keeps every field it already has; the source only fills the
  -- blanks. Portal access is the exception: a suspended or deactivated target
  -- stays that way, because that state was set deliberately. Only a profile
  -- nobody had ever signed in to is opened by the account arriving with the
  -- source.
  update public.people
  set full_name = coalesce(target_row.full_name, source_row.full_name),
      first_name = coalesce(target_row.first_name, source_row.first_name),
      last_name = coalesce(target_row.last_name, source_row.last_name),
      field_of_study = coalesce(target_row.field_of_study, source_row.field_of_study),
      study_year = coalesce(target_row.study_year, source_row.study_year),
      phone_number = coalesce(target_row.phone_number, source_row.phone_number),
      linkedin_url = coalesce(target_row.linkedin_url, source_row.linkedin_url),
      avatar_path = coalesce(target_row.avatar_path, source_row.avatar_path),
      avatar_alt = coalesce(target_row.avatar_alt, source_row.avatar_alt),
      alumni_access_granted_at = least(
        target_row.alumni_access_granted_at,
        source_row.alumni_access_granted_at
      ),
      portal_access_status = case
        when target_row.portal_access_status = 'unclaimed'
          and source_row.portal_access_status = 'active'
          then 'active'
        else target_row.portal_access_status
      end
  where id = p_target_person_id;

  delete from public.people where id = p_source_person_id;

  insert into public.audit_events (
    actor_person_id, action, target_person_id, details
  ) values (
    actor_person_id,
    'person.merged',
    p_target_person_id,
    jsonb_build_object(
      'source_person_id', p_source_person_id,
      'source_was_portal_administrator', source_was_portal_admin,
      'source_avatar_path', source_row.avatar_path is not null
    )
  );
end;
$$;

revoke all on function public.merge_people(bigint, bigint, text) from public, anon;
grant execute on function public.merge_people(bigint, bigint, text) to authenticated;

commit;
