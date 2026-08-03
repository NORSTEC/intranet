begin;

-- Alumni who sign in with a private Google account have no organization to
-- request access from. They ask for portal access as alumni instead, which
-- only portal administrators can approve, and which grants portal access
-- without creating an organization membership.
alter table public.access_requests
  alter column organization_id drop not null;

alter table public.access_requests
  add column request_type text not null default 'organization';

alter table public.access_requests
  add constraint access_requests_request_type_check
    check (request_type in ('organization', 'alumni')),
  add constraint access_requests_alumni_has_no_organization_check
    check ((request_type = 'alumni') = (organization_id is null));

-- The per-organization index treats nulls as distinct, so alumni requests
-- need their own single-pending guard.
create unique index access_requests_one_pending_alumni_idx
  on public.access_requests (person_id)
  where status = 'pending' and request_type = 'alumni';

alter table public.people
  add column alumni_access_granted_at timestamptz;

drop policy if exists access_requests_authorized_read on public.access_requests;
create policy access_requests_authorized_read
on public.access_requests
for select
to authenticated
using (
  person_id = (select private.current_person_id())
  or (
    organization_id is not null
    and (select private.is_organization_admin(organization_id))
  )
  or (organization_id is null and (select private.is_portal_admin()))
);

drop policy if exists access_requests_self_insert on public.access_requests;
create policy access_requests_self_insert
on public.access_requests
for insert
to authenticated
with check (
  person_id = (select private.current_person_id())
  and status = 'pending'
  and reviewed_by_person_id is null
  and reviewed_at is null
  and decision_note is null
  and (
    organization_id is null
    or not (select private.has_active_membership(organization_id))
  )
);

grant insert (
  person_id,
  organization_id,
  request_type,
  field_of_study,
  study_year,
  message
) on public.access_requests to authenticated;

drop function if exists public.submit_access_request(bigint, text, text, text, smallint, text);

create or replace function public.submit_access_request(
  target_organization_id bigint,
  requested_first_name text,
  requested_last_name text,
  requested_field_of_study text,
  requested_study_year smallint,
  requested_message text,
  requested_request_type text
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_person_id bigint;
  new_request_id bigint;
begin
  current_person_id := (select private.current_person_id());

  if current_person_id is null then
    raise exception 'Authentication is required';
  end if;

  if requested_request_type not in ('organization', 'alumni') then
    raise exception 'The request type is not supported';
  end if;

  if requested_request_type = 'alumni' then
    if target_organization_id is not null then
      raise exception 'An alumni request cannot select an organization';
    end if;

    if exists (
      select 1
      from public.people as person
      where person.id = current_person_id
        and person.alumni_access_granted_at is not null
    ) then
      raise exception 'Alumni access has already been granted';
    end if;
  else
    if target_organization_id is null then
      raise exception 'An organization must be selected';
    end if;

    if not exists (
      select 1
      from public.organizations as organization
      where organization.id = target_organization_id
        and organization.status = 'active'
    ) then
      raise exception 'The selected organization is not available';
    end if;
  end if;

  update public.people
  set first_name = nullif(btrim(requested_first_name), ''),
      last_name = nullif(btrim(requested_last_name), ''),
      full_name = nullif(
        btrim(concat_ws(' ', requested_first_name, requested_last_name)),
        ''
      ),
      field_of_study = nullif(btrim(requested_field_of_study), ''),
      study_year = requested_study_year
  where id = current_person_id;

  if not found then
    raise exception 'A portal person does not exist for this user';
  end if;

  insert into public.access_requests (
    person_id,
    organization_id,
    request_type,
    field_of_study,
    study_year,
    message
  )
  values (
    current_person_id,
    target_organization_id,
    requested_request_type,
    nullif(btrim(requested_field_of_study), ''),
    requested_study_year,
    nullif(btrim(requested_message), '')
  )
  returning id into new_request_id;

  return new_request_id;
end;
$$;

revoke all on function public.submit_access_request(
  bigint,
  text,
  text,
  text,
  smallint,
  text,
  text
) from public, anon;
grant execute on function public.submit_access_request(
  bigint,
  text,
  text,
  text,
  smallint,
  text,
  text
) to authenticated;

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
set statement_timeout = '5s'
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
end;
$$;

revoke all on function public.review_access_request(bigint, text, text) from public, anon;
grant execute on function public.review_access_request(bigint, text, text) to authenticated;

commit;
