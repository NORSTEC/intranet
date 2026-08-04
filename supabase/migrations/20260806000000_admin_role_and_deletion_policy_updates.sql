begin;

-- An ended membership never had its role reset, only a reactivated one did
-- (the reactivation branch below already sets role back to 'member'). That
-- left a former organization administrator's membership row still reading
-- 'organization_admin' once ended, which Member status displayed as an
-- "Organization admin" label next to "Former member". Ending a membership —
-- whichever of the two paths does it — now always clears the role too, so a
-- restored or reactivated person always starts over as a plain member.
create or replace function private.end_person_memberships(p_person_id bigint)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.membership_periods as period
  set ends_on = current_date,
      ended_at = now()
  where period.ends_on is null
    and exists (
      select 1
      from public.memberships as membership
      where membership.id = period.membership_id
        and membership.person_id = p_person_id
        and membership.status = 'active'
    );

  update public.team_memberships as team_membership
  set ends_on = current_date
  where team_membership.person_id = p_person_id
    and (team_membership.ends_on is null or team_membership.ends_on > current_date);

  -- Only experiences a membership owns close with it. An experience the
  -- person wrote themselves is their own record and is none of this
  -- operation's business.
  update public.profile_experience_roles as experience_role
  set ends_on = current_date
  where (experience_role.ends_on is null or experience_role.ends_on > current_date)
    and exists (
      select 1
      from public.profile_experiences as experience
      join public.memberships as membership
        on membership.id = experience.membership_id
      where experience.id = experience_role.experience_id
        and membership.person_id = p_person_id
        and membership.status = 'active'
    );

  update public.profile_experiences as experience
  set ends_on = current_date
  where (experience.ends_on is null or experience.ends_on > current_date)
    and exists (
      select 1
      from public.memberships as membership
      where membership.id = experience.membership_id
        and membership.person_id = p_person_id
        and membership.status = 'active'
    );

  update public.memberships
  set status = 'ended',
      role = 'member',
      ends_on = current_date,
      ended_at = now()
  where person_id = p_person_id
    and status = 'active';
end;
$$;

revoke all on function private.end_person_memberships(bigint)
  from public, anon, authenticated;

-- Same fix as above for the standalone "end membership" action an
-- organization administrator uses from Member status: ending no longer
-- leaves a stale organization_admin role behind either.
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
      role = 'member',
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
      'role', 'member'
    )
  );
end;
$$;

revoke all on function public.set_organization_membership_status(bigint, text) from public, anon;
grant execute on function public.set_organization_membership_status(bigint, text) to authenticated;

-- Granting the organization_admin role used to be allowed for the same
-- organization's own admins, because `private.is_organization_admin` ORs in
-- portal administrators. The only screen that calls this (Manage users, a
-- portal-admin-only page) never exposed that to an organization admin, but
-- the RPC is callable directly, so the boundary belongs here: promoting to
-- organization_admin now requires a portal administrator. Demoting back to
-- member is unchanged — an organization's own admins may still do that.
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

  if actor_person_id is null then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if p_role = 'organization_admin' then
    if not (select private.is_portal_admin()) then
      raise exception using errcode = '42501', message = 'not_authorized';
    end if;
  elsif not (select private.is_organization_admin(membership_row.organization_id)) then
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

  update public.memberships
  set role = p_role
  where id = p_membership_id;

  insert into public.audit_events (
    actor_person_id,
    action,
    target_person_id,
    organization_id,
    details
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

-- Deletion used to be blocked while the person was the sole active
-- administrator of an organization. An organization is no longer required to
-- have an administrator, so this guard is gone: both self-deletion and an
-- administrator-initiated deletion can leave an organization without one.
--
-- The deleted person's name and primary email are now also copied into the
-- audit details under a nested key. `private.purge_person_row`'s PII scrub
-- (below) only inspects an event's top-level keys, so nesting the snapshot
-- keeps it intact after the person row — and the join it would otherwise
-- depend on — is gone. This is the record GDPR's accountability exception
-- allows keeping: who did what to whom, even after erasure.
create or replace function private.soft_delete_person_row(
  p_person_id bigint,
  p_actor_person_id bigint,
  p_reason text,
  p_source text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  person_row public.people%rowtype;
  person_primary_email text;
begin
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

  if exists (
    select 1
    from public.portal_administrators as administrator
    where administrator.person_id = p_person_id
  ) then
    raise exception using errcode = 'P0001', message = 'portal_admin_role_first';
  end if;

  select person_email.email
  into person_primary_email
  from public.person_emails as person_email
  where person_email.person_id = p_person_id
    and person_email.is_primary
  limit 1;

  perform private.end_person_memberships(p_person_id);

  update public.people
  set deleted_at = now(),
      deleted_by_person_id = p_actor_person_id,
      deletion_reason = p_reason,
      access_status_before_deletion = person_row.portal_access_status,
      portal_access_status = 'suspended'
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
    p_actor_person_id,
    case when p_source = 'self_service'
      then 'person.self_deleted'
      else 'person.soft_deleted'
    end,
    p_person_id,
    jsonb_build_object(
      'previous_access_status', person_row.portal_access_status,
      'has_reason', p_reason is not null,
      'source', p_source,
      'deleted_person', jsonb_build_object(
        'name', person_row.full_name,
        'email', person_primary_email
      )
    )
  );
end;
$$;

revoke all on function private.soft_delete_person_row(bigint, bigint, text, text)
  from public, anon, authenticated;

-- Returning the purged person's name and email alongside the avatar path, so
-- both callers below can copy them into the `person.purged` audit event
-- before the row disappears. The signature grows OUT parameters, which
-- `create or replace` cannot do, hence the drop.
drop function if exists private.purge_person_row(bigint);

create function private.purge_person_row(
  p_person_id bigint,
  out avatar_path text,
  out full_name text,
  out email text
)
returns record
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  person_row public.people%rowtype;
begin
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

  if exists (
    select 1
    from public.portal_administrators as administrator
    where administrator.person_id = p_person_id
  ) then
    raise exception using errcode = 'P0001', message = 'portal_admin_role_first';
  end if;

  full_name := person_row.full_name;

  select person_email.email
  into email
  from public.person_emails as person_email
  where person_email.person_id = p_person_id
    and person_email.is_primary
  limit 1;

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

  if person_row.avatar_path is not null then
    delete from storage.objects
    where bucket_id = 'member-avatars'
      and name = person_row.avatar_path;
  end if;

  -- Audit rows survive the person: who did what to whom is the record the
  -- portal is required to keep. The person references are nulled by their
  -- foreign keys; the free-form details are stripped of anything personal
  -- the original event happened to copy in. The `deleted_person` /
  -- `purged_person` snapshots are deliberately exempt: this scrub only
  -- inspects top-level keys, and those live nested one level down.
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

  avatar_path := person_row.avatar_path;

  delete from public.people where id = p_person_id;
end;
$$;

revoke all on function private.purge_person_row(bigint)
  from public, anon, authenticated;

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
  purged record;
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
  where id = p_person_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'person_not_found';
  end if;

  -- Naming the exact deletion being finished stops a stale page from purging
  -- somebody who was restored, and deleted again, in the meantime.
  if person_row.deleted_at is null then
    raise exception using errcode = 'P0001', message = 'person_not_deleted';
  end if;

  if p_expected_deleted_at is null
    or person_row.deleted_at <> p_expected_deleted_at
  then
    raise exception using errcode = 'P0001', message = 'purge_conflict';
  end if;

  select * into purged from private.purge_person_row(p_person_id);

  insert into public.audit_events (
    actor_person_id, action, target_person_id, details
  ) values (
    actor_person_id,
    'person.purged',
    null,
    jsonb_build_object(
      'purged_person_id', p_person_id,
      'source', 'portal_management',
      'purged_person', jsonb_build_object(
        'name', purged.full_name,
        'email', purged.email
      )
    )
  );

  return purged.avatar_path;
end;
$$;

revoke all on function public.purge_person(bigint, timestamptz) from public, anon;
grant execute on function public.purge_person(bigint, timestamptz) to authenticated;

create or replace function private.purge_expired_people()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  expired_person_id bigint;
  purged record;
  purged_count integer := 0;
begin
  for expired_person_id in
    select person.id
    from public.people as person
    where person.deleted_at is not null
      and person.deleted_at < now() - interval '30 days'
      and not exists (
        select 1
        from public.portal_administrators as administrator
        where administrator.person_id = person.id
      )
    order by person.deleted_at
  loop
    select * into purged from private.purge_person_row(expired_person_id);

    insert into public.audit_events (
      actor_person_id, action, target_person_id, details
    ) values (
      null,
      'person.purged',
      null,
      jsonb_build_object(
        'purged_person_id', expired_person_id,
        'source', 'retention_expiry',
        'purged_person', jsonb_build_object(
          'name', purged.full_name,
          'email', purged.email
        )
      )
    );

    purged_count := purged_count + 1;
  end loop;

  return purged_count;
end;
$$;

revoke all on function private.purge_expired_people()
  from public, anon, authenticated;

-- Granting the portal administrator role is now limited to people reachable
-- through NORSTEC itself: either a primary email or a linked Google account
-- on the norstec.no domain (the same domain already seeded in
-- private.organization_domains for the Norstec organization).
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

    if not exists (
      select 1
      from public.person_emails as person_email
      where person_email.person_id = p_person_id
        and person_email.is_primary
        and split_part(person_email.email, '@', 2) in (
          select domain.domain
          from private.organization_domains as domain
          join public.organizations as organization
            on organization.id = domain.organization_id
          where organization.slug = 'norstec'
        )
    ) and not exists (
      select 1
      from public.portal_accounts as account
      where account.person_id = p_person_id
        and split_part(account.account_email, '@', 2) in (
          select domain.domain
          from private.organization_domains as domain
          join public.organizations as organization
            on organization.id = domain.organization_id
          where organization.slug = 'norstec'
        )
    ) then
      raise exception using errcode = 'P0001', message = 'norstec_domain_required';
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

commit;
