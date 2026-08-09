begin;

-- Decision emails show when a request was created and decided. Older queued
-- payloads omitted those fields; the contract lives in docs/integrations.md.
--
-- Read from the row rather than formatted here. What a date looks like is a
-- rendering decision, and `Intl.DateTimeFormat` already makes it in the two
-- pages that show the same fields.
--
-- Both functions are recreated whole, because migrations are append-only and
-- the deployed body is whatever the last `create or replace` said. The only
-- change in each is the added payload keys.

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
  applicant_name text;
  applicant_email text;
  organization_name text;
  decided_at timestamptz;
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

  select person.full_name into applicant_name
  from public.people as person
  where person.id = request_row.person_id;

  select address.email into applicant_email
  from public.person_emails as address
  where address.person_id = request_row.person_id
  order by address.is_primary desc, address.created_at, address.id
  limit 1;

  select organization.name into organization_name
  from public.organizations as organization
  where organization.id = request_row.organization_id;

  decided_at := now();

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
      -- `provisioning_method` records how the membership came to exist, and
      -- reactivating one does not rewrite that. Overwriting it erased the
      -- fact that a membership had been granted by an organization domain,
      -- which is the only thing `assert_can_unlink_account` has to go on when
      -- it decides whether the account behind a membership may be removed. A
      -- domain membership that had been ended and later reinstated by request
      -- came back looking as though no account had ever proved it.
      set status = 'active',
          role = 'member',
          ends_on = null,
          ended_at = null;
    end if;
  end if;

  update public.access_requests
  set status = p_decision,
      reviewed_by_person_id = reviewer_person_id,
      reviewed_at = decided_at,
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
      'request_type', request_row.request_type,
      'decision_note', nullif(btrim(p_decision_note), ''),
      'applicant', jsonb_build_object(
        'name', applicant_name,
        'email', applicant_email
      )
    )
  );

  -- Queued before the decline cleanup below, which deletes the applicant.
  -- `private.pending_notifications.person_id` is `on delete set null` and the
  -- address is copied onto the row, so the queued email survives the profile
  -- it is about — which is the whole point: somebody has to be told they were
  -- turned down, and by then there is no profile left to tell.
  perform private.enqueue_notification(
    'access_request_' || p_decision,
    request_row.person_id,
    applicant_email,
    applicant_name,
    jsonb_build_object(
      'organization_name', organization_name,
      'request_type', request_row.request_type,
      'decision_note', nullif(btrim(p_decision_note), ''),
      'requested_at', request_row.created_at,
      'decided_at', decided_at
    )
  );

  -- `private.discard_declined_applicant` refuses to touch anyone who is more
  -- than an applicant — a membership past or present, alumni access, the
  -- administrator role, or another request still waiting all keep the profile.
  -- Declining one of several requests therefore removes nothing.
  if p_decision = 'rejected' then
    perform private.discard_declined_applicant(request_row.person_id);
  end if;
end;
$$;

revoke all on function public.review_access_request(bigint, text, text) from public, anon;
grant execute on function public.review_access_request(bigint, text, text) to authenticated;

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
  organization_name text;
  remaining_active_memberships integer;
  person_name text;
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

  -- Only the *last* one. Ending one membership while another is still active
  -- changes nothing the person needs to be told about by email — they keep
  -- their access, and the portal shows the change. Counted after the update
  -- above, so this membership is already excluded.
  if p_status = 'ended' then
    select count(*) into remaining_active_memberships
    from public.memberships as remaining
    where remaining.person_id = membership_row.person_id
      and remaining.status = 'active';

    if remaining_active_memberships = 0 then
      select person.full_name into person_name
      from public.people as person
      where person.id = membership_row.person_id;

      select organization.name into organization_name
      from public.organizations as organization
      where organization.id = membership_row.organization_id;

      perform private.enqueue_notification(
        'membership_ended',
        membership_row.person_id,
        -- Deliberately not their primary address: a norstec.no one is about
        -- to stop working, and this is the email telling them so.
        (select private.notification_recipient(membership_row.person_id, true)),
        person_name,
        jsonb_build_object(
          'organization_name', organization_name,
          'ended_on', current_date,
          'workspace_sign_in_only',
          (select private.signs_in_only_with_workspace(membership_row.person_id))
        )
      );
    end if;
  end if;
end;
$$;

revoke all on function public.set_organization_membership_status(bigint, text) from public, anon;
grant execute on function public.set_organization_membership_status(bigint, text) to authenticated;

commit;
