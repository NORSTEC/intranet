begin;

-- Portal access had two ways of saying the same thing. `suspended` was an
-- administrator's decision and `deactivated` was the person's own, but the
-- outcome was identical: no sign-in. Two words for one state made every
-- screen explain a distinction that changed nothing for the reader.
--
-- Leaving the portal is now account deletion instead, which is what a person
-- asking to be removed actually means and what GDPR erasure requires. Both a
-- self-deletion and an administrator deletion soft delete the person for 30
-- days and then purge them permanently.

update public.people
set portal_access_status = 'suspended'
where portal_access_status = 'deactivated';

update public.people
set access_status_before_deletion = 'suspended'
where access_status_before_deletion = 'deactivated';

alter table public.people
  drop constraint people_portal_access_status_check,
  add constraint people_portal_access_status_check
    check (portal_access_status in ('unclaimed', 'active', 'suspended')),
  drop constraint people_access_status_before_deletion_check,
  add constraint people_access_status_before_deletion_check
    check (
      access_status_before_deletion is null
      or access_status_before_deletion
        in ('unclaimed', 'active', 'suspended')
    );

drop function if exists public.deactivate_own_portal_access();

-- Deleting a person used to be blocked while any organization membership was
-- still active, which left the person unable to leave and the administrator
-- unable to finish. Deletion now ends the memberships it finds, on the same
-- terms as an ordinary end-membership: periods close, team roles close, and
-- profile experiences stop on the same date.
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
      ends_on = current_date,
      ended_at = now()
  where person_id = p_person_id
    and status = 'active';
end;
$$;

revoke all on function private.end_person_memberships(bigint)
  from public, anon, authenticated;

-- One deletion body, two callers. A person deleting their own account and a
-- portal administrator deleting somebody else must leave the database in the
-- same state, or the 30-day purge would have two shapes of row to handle.
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
  orphaned_organization text;
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

  -- Ending the last active administrator of an organization would leave that
  -- organization with nobody who can run it. Deletion is not the place to
  -- discover that; the role has to be handed over first.
  select organization.name
  into orphaned_organization
  from public.memberships as membership
  join public.organizations as organization
    on organization.id = membership.organization_id
  where membership.person_id = p_person_id
    and membership.status = 'active'
    and membership.role = 'organization_admin'
    and not exists (
      select 1
      from public.memberships as other_administrator
      where other_administrator.organization_id = membership.organization_id
        and other_administrator.role = 'organization_admin'
        and other_administrator.status = 'active'
        and other_administrator.person_id <> p_person_id
    )
  limit 1;

  if orphaned_organization is not null then
    raise exception using errcode = 'P0001', message = 'last_organization_admin';
  end if;

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
      'source', p_source
    )
  );
end;
$$;

revoke all on function private.soft_delete_person_row(bigint, bigint, text, text)
  from public, anon, authenticated;

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

  perform private.soft_delete_person_row(
    p_person_id, actor_person_id, reason, 'portal_management'
  );
end;
$$;

revoke all on function public.soft_delete_person(bigint, text) from public, anon;
grant execute on function public.soft_delete_person(bigint, text) to authenticated;

-- The self-service half of the same operation. A person may always delete
-- their own account; the portal-administrator role is the one thing that has
-- to be handed over first, because nobody else can restore it afterwards.
create or replace function public.delete_own_account()
returns void
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '10s'
as $$
declare
  actor_person_id bigint;
begin
  actor_person_id := (select private.current_person_id());

  if actor_person_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;

  if (select private.is_portal_admin()) then
    raise exception using errcode = 'P0001', message = 'portal_admin_transfer_required';
  end if;

  perform private.soft_delete_person_row(
    actor_person_id, actor_person_id, null, 'self_service'
  );
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;

-- Purging is the same work whether a portal administrator asks for it early
-- or the retention window runs out, so both paths share one body.
create or replace function private.purge_person_row(p_person_id bigint)
returns text
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

  return person_row.avatar_path;
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
  avatar_path text;
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

  avatar_path := private.purge_person_row(p_person_id);

  insert into public.audit_events (
    actor_person_id, action, target_person_id, details
  ) values (
    actor_person_id,
    'person.purged',
    null,
    jsonb_build_object('purged_person_id', p_person_id, 'source', 'portal_management')
  );

  return avatar_path;
end;
$$;

revoke all on function public.purge_person(bigint, timestamptz) from public, anon;
grant execute on function public.purge_person(bigint, timestamptz) to authenticated;

-- The retention window. A deleted person is recoverable for 30 days, and is
-- then erased without anybody having to remember to do it.
create or replace function private.purge_expired_people()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  expired_person_id bigint;
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
    perform private.purge_person_row(expired_person_id);

    insert into public.audit_events (
      actor_person_id, action, target_person_id, details
    ) values (
      null,
      'person.purged',
      null,
      jsonb_build_object(
        'purged_person_id', expired_person_id,
        'source', 'retention_expiry'
      )
    );

    purged_count := purged_count + 1;
  end loop;

  return purged_count;
end;
$$;

revoke all on function private.purge_expired_people()
  from public, anon, authenticated;

-- A deleted person cannot read their own row — deletion hides them from
-- everybody but a portal administrator — so the sign-in screen had no way to
-- tell them why they were turned away. This says only why, and only about the
-- account currently signing in.
create or replace function public.sign_in_block_reason()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when person.deleted_at is not null then 'deleted'
    when person.portal_access_status = 'suspended' then 'suspended'
    when person.portal_access_status = 'unclaimed' then 'unclaimed'
    else null
  end
  from public.portal_accounts as account
  join public.people as person
    on person.id = account.person_id
  where account.auth_user_id = (select auth.uid());
$$;

revoke all on function public.sign_in_block_reason() from public, anon;
grant execute on function public.sign_in_block_reason() to authenticated;

-- A declined access request must leave nothing behind. The profile only ever
-- existed because the person signed in to ask, so once the answer is no, the
-- profile, its emails, and its Google sign-in go with it. The audit event is
-- the deliberate exception: the decision itself stays on the record.
create or replace function private.discard_declined_applicant(p_person_id bigint)
returns boolean
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

  if not found or person_row.deleted_at is not null then
    return false;
  end if;

  -- Anything that makes this a real user rather than an applicant keeps the
  -- profile: a membership past or present, alumni access, the administrator
  -- role, or another request still waiting for an answer.
  if person_row.alumni_access_granted_at is not null then
    return false;
  end if;

  if exists (
    select 1 from public.memberships where person_id = p_person_id
  ) then
    return false;
  end if;

  if exists (
    select 1 from public.portal_administrators where person_id = p_person_id
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.access_requests
    where person_id = p_person_id
      and status = 'pending'
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.historical_membership_requests
    where person_id = p_person_id
      and status = 'pending'
  ) then
    return false;
  end if;

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

  delete from public.people where id = p_person_id;

  return true;
end;
$$;

revoke all on function private.discard_declined_applicant(bigint)
  from public, anon, authenticated;

-- Rebuilt only to discard the profile behind a declined request. The
-- decision, its authorization, and the approval branch are unchanged.
create or replace function public.review_access_request(
  p_request_id bigint,
  p_decision text,
  p_decision_note text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '10s'
as $$
declare
  request_row public.access_requests%rowtype;
  reviewer_person_id bigint;
  reviewer_authorized boolean;
begin
  reviewer_person_id := (select private.current_person_id());
  if p_decision not in ('approved', 'rejected') then
    raise exception using errcode = 'P0001', message = 'invalid_decision';
  end if;
  if p_decision_note is not null and char_length(p_decision_note) > 1000 then
    raise exception using errcode = 'P0001', message = 'invalid_decision_note';
  end if;

  select * into request_row
  from public.access_requests
  where id = p_request_id
  for update;

  if not found or request_row.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'request_not_pending';
  end if;

  -- Alumni requests belong to no organization, so only portal administrators
  -- can decide them.
  reviewer_authorized := case
    when request_row.request_type = 'alumni'
      then (select private.is_portal_admin())
    else (select private.is_organization_admin(request_row.organization_id))
  end;

  if reviewer_person_id is null or not reviewer_authorized then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if p_decision = 'approved' then
    if request_row.request_type = 'alumni' then
      update public.people
      set alumni_access_granted_at = coalesce(alumni_access_granted_at, now())
      where id = request_row.person_id;
    else
      insert into public.memberships (
        person_id, organization_id, role, status, provisioning_method, starts_on
      ) values (
        request_row.person_id, request_row.organization_id, 'member', 'active',
        'access_request', current_date
      )
      on conflict (person_id, organization_id) do update
      set status = 'active',
          role = 'member',
          provisioning_method = 'access_request',
          ends_on = null,
          ended_at = null;
    end if;
  end if;

  update public.access_requests
  set status = p_decision,
      reviewed_by_person_id = reviewer_person_id,
      reviewed_at = now(),
      decision_note = nullif(btrim(p_decision_note), '')
  where id = request_row.id;

  insert into public.audit_events (
    actor_person_id, action, target_person_id, organization_id, details
  ) values (
    reviewer_person_id,
    'access_request_' || p_decision,
    request_row.person_id,
    request_row.organization_id,
    jsonb_build_object(
      'request_id', request_row.id,
      'request_type', request_row.request_type
    )
  );

  -- The audit event above keeps the decision. Everything else about a
  -- declined applicant goes: the foreign keys null the person reference and
  -- the request row disappears with the profile.
  if p_decision = 'rejected' then
    perform private.discard_declined_applicant(request_row.person_id);
  end if;
end;
$$;

revoke all on function public.review_access_request(bigint, text, text) from public, anon;
grant execute on function public.review_access_request(bigint, text, text) to authenticated;

-- `deactivated` is gone as a state, so portal management can only hand out
-- the two that remain.
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

  if p_status not in ('active', 'suspended') then
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

commit;
