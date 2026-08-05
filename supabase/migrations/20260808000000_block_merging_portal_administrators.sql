begin;

-- Merging used to accept a portal administrator as the duplicate being folded
-- in, dropping the role on the way through. That made a portal-wide role
-- disappear as a side effect of a duplicate repair, and left the profile that
-- disappears — rather than the administrator's own — as the surviving one.
-- The source is now rejected outright when it holds the role: fold the other
-- profile into the administrator instead, or revoke the role first.
--
-- The audit payload loses the two facts that only existed to explain what a
-- merge quietly carried over. Which profile was folded in is still recorded.

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

  -- A portal administrator is never the profile that disappears. Folding one
  -- into another person would end a portal-wide role as a side effect of a
  -- duplicate repair, and leave the administrator's own profile as the one
  -- that no longer exists. Merging the other way — an ordinary duplicate into
  -- an administrator — is unaffected: the administrator is the target, keeps
  -- their role, and is the profile that survives.
  if exists (
    select 1
    from public.portal_administrators as administrator
    where administrator.person_id = p_source_person_id
  ) then
    raise exception using errcode = 'P0001',
      message = 'source_is_portal_administrator';
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
    jsonb_build_object('source_person_id', p_source_person_id)
  );
end;
$$;

revoke all on function public.merge_people(bigint, bigint, text) from public, anon;
grant execute on function public.merge_people(bigint, bigint, text) to authenticated;

commit;
