begin;

-- "Alumni" is a person-level state derived from having history but no active
-- memberships. Individual organization memberships therefore use "ended".
update public.memberships
set status = 'ended',
    ended_at = coalesce(ended_at, now()),
    ends_on = coalesce(ends_on, current_date)
where status = 'alumni';

alter table public.memberships
  drop constraint memberships_status_check,
  add constraint memberships_status_check
    check (status in ('planned', 'active', 'suspended', 'ended'));

alter table public.team_memberships
  add column archived_at timestamptz,
  add column archived_by_person_id bigint
    references public.people (id) on delete set null;

create index team_memberships_person_visible_idx
  on public.team_memberships (person_id, starts_on desc)
  where archived_at is null;

create table public.historical_membership_requests (
  id bigint generated always as identity primary key,
  person_id bigint not null references public.people (id) on delete cascade,
  organization_id bigint not null references public.organizations (id) on delete cascade,
  team_id bigint references public.teams (id) on delete set null,
  role_title text,
  starts_on date,
  ends_on date not null,
  message text,
  status text not null default 'pending',
  reviewed_by_person_id bigint references public.people (id) on delete set null,
  reviewed_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint historical_membership_requests_status_check
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  constraint historical_membership_requests_dates_check
    check (starts_on is null or ends_on >= starts_on),
  constraint historical_membership_requests_role_title_length_check
    check (role_title is null or char_length(btrim(role_title)) between 1 and 160),
  constraint historical_membership_requests_message_length_check
    check (message is null or char_length(message) <= 2000),
  constraint historical_membership_requests_decision_note_length_check
    check (decision_note is null or char_length(decision_note) <= 1000),
  constraint historical_membership_requests_review_state_check
    check (
      (status = 'pending' and reviewed_by_person_id is null and reviewed_at is null)
      or (status <> 'pending' and reviewed_at is not null)
    )
);

create unique index historical_membership_requests_one_pending_idx
  on public.historical_membership_requests (person_id, organization_id)
  where status = 'pending';

create index historical_membership_requests_org_status_created_idx
  on public.historical_membership_requests (organization_id, status, created_at);

create index historical_membership_requests_person_status_idx
  on public.historical_membership_requests (person_id, status);

create trigger historical_membership_requests_set_updated_at
before update on public.historical_membership_requests
for each row execute function private.set_updated_at();

-- Former members keep ordinary portal access. Admin authorization remains
-- active-only in is_norstec_admin/is_organization_admin.
create or replace function private.is_portal_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships as membership
    join public.people as person on person.id = membership.person_id
    where membership.person_id = (select private.current_person_id())
      and membership.status in ('active', 'ended')
      and person.portal_access_status = 'active'
  );
$$;

create or replace function private.can_manage_person(target_person_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_person_id = (select private.current_person_id())
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
    )
    or (select private.is_norstec_admin());
$$;

create or replace function private.can_view_person(target_person_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_person_id = (select private.current_person_id())
    or (select private.can_manage_person(target_person_id))
    or (
      (select private.is_portal_member())
      and exists (
        select 1
        from public.memberships as target_membership
        where target_membership.person_id = target_person_id
          and target_membership.status in ('active', 'ended')
      )
    );
$$;

drop policy if exists memberships_authorized_read on public.memberships;
create policy memberships_authorized_read
on public.memberships
for select
to authenticated
using (
  person_id = (select private.current_person_id())
  or (
    (select private.is_portal_member())
    and status in ('active', 'ended')
  )
  or (select private.is_organization_admin(organization_id))
);

drop policy if exists team_memberships_self_insert on public.team_memberships;
create policy team_memberships_self_insert
on public.team_memberships
for insert
to authenticated
with check (
  person_id = (select private.current_person_id())
  and archived_at is null
  and archived_by_person_id is null
  and exists (
    select 1
    from public.teams as team
    join public.memberships as membership
      on membership.organization_id = team.organization_id
    where team.id = team_id
      and membership.person_id = (select private.current_person_id())
      and membership.status in ('active', 'ended')
      and team.status = 'active'
  )
);

drop policy if exists team_memberships_portal_member_read on public.team_memberships;
create policy team_memberships_portal_member_read
on public.team_memberships
for select
to authenticated
using (
  (select private.is_portal_member())
  and (
    archived_at is null
    or person_id = (select private.current_person_id())
    or (select private.can_manage_person(person_id))
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
      and membership.status in ('active', 'ended')
      and team.status = 'active'
  )
);

-- Preserve compatibility with the existing profile RPC: a requested delete
-- archives the row instead of destroying the experience record.
create or replace function private.archive_own_team_membership_on_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_person_id bigint;
begin
  caller_person_id := (select private.current_person_id());
  if caller_person_id is null or caller_person_id <> old.person_id then
    return old;
  end if;

  update public.team_memberships
  set archived_at = now(),
      archived_by_person_id = caller_person_id
  where id = old.id;

  insert into public.audit_events (
    actor_person_id, action, target_person_id, organization_id, details
  )
  select
    caller_person_id,
    'team_experience_archived',
    caller_person_id,
    team.organization_id,
    jsonb_build_object('team_membership_id', old.id, 'team_id', old.team_id)
  from public.teams as team
  where team.id = old.team_id;

  return null;
end;
$$;

drop trigger if exists team_memberships_archive_self_delete on public.team_memberships;
create trigger team_memberships_archive_self_delete
before delete on public.team_memberships
for each row execute function private.archive_own_team_membership_on_delete();

create or replace function public.restore_own_team_experience(
  p_team_membership_id bigint,
  p_expected_updated_at timestamptz
)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  caller_person_id bigint;
  restored_at timestamptz;
begin
  caller_person_id := (select private.current_person_id());
  if caller_person_id is null or not (select private.is_portal_member()) then
    raise exception using errcode = '42501', message = 'portal_access_required';
  end if;

  update public.team_memberships
  set archived_at = null,
      archived_by_person_id = null
  where id = p_team_membership_id
    and person_id = caller_person_id
    and archived_at is not null
    and updated_at = p_expected_updated_at
  returning updated_at into restored_at;

  if restored_at is null then
    raise exception using errcode = 'P0001', message = 'experience_conflict';
  end if;

  insert into public.audit_events (
    actor_person_id, action, target_person_id, organization_id, details
  )
  select
    caller_person_id,
    'team_experience_restored',
    caller_person_id,
    team.organization_id,
    jsonb_build_object('team_membership_id', membership.id, 'team_id', membership.team_id)
  from public.team_memberships as membership
  join public.teams as team on team.id = membership.team_id
  where membership.id = p_team_membership_id;

  return restored_at;
end;
$$;

create or replace function public.submit_historical_membership_request(
  p_organization_id bigint,
  p_team_id bigint,
  p_role_title text,
  p_starts_on date,
  p_ends_on date,
  p_message text
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  caller_person_id bigint;
  new_request_id bigint;
begin
  caller_person_id := (select private.current_person_id());
  if caller_person_id is null or not (select private.is_portal_member()) then
    raise exception using errcode = 'P0001', message = 'portal_access_required';
  end if;
  if p_ends_on is null or (p_starts_on is not null and p_ends_on < p_starts_on) then
    raise exception using errcode = 'P0001', message = 'invalid_history';
  end if;
  if p_role_title is not null and char_length(btrim(p_role_title)) not between 1 and 160 then
    raise exception using errcode = 'P0001', message = 'invalid_history';
  end if;
  if not exists (
    select 1 from public.organizations
    where id = p_organization_id and status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'invalid_organization';
  end if;
  if p_team_id is not null and not exists (
    select 1 from public.teams
    where id = p_team_id
      and organization_id = p_organization_id
      and status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'invalid_team';
  end if;
  if exists (
    select 1 from public.memberships
    where person_id = caller_person_id
      and organization_id = p_organization_id
  ) then
    raise exception using errcode = 'P0001', message = 'membership_exists';
  end if;

  insert into public.historical_membership_requests (
    person_id, organization_id, team_id, role_title,
    starts_on, ends_on, message
  ) values (
    caller_person_id, p_organization_id, p_team_id,
    nullif(btrim(p_role_title), ''), p_starts_on, p_ends_on,
    nullif(btrim(p_message), '')
  ) returning id into new_request_id;

  insert into public.audit_events (
    actor_person_id, action, target_person_id, organization_id, details
  ) values (
    caller_person_id, 'historical_membership_requested', caller_person_id,
    p_organization_id, jsonb_build_object('request_id', new_request_id, 'team_id', p_team_id)
  );

  return new_request_id;
end;
$$;

create or replace function public.review_historical_membership_request(
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
  request_row public.historical_membership_requests%rowtype;
  reviewer_person_id bigint;
begin
  reviewer_person_id := (select private.current_person_id());
  if p_decision not in ('approved', 'rejected') then
    raise exception using errcode = 'P0001', message = 'invalid_decision';
  end if;
  if p_decision_note is not null and char_length(p_decision_note) > 1000 then
    raise exception using errcode = 'P0001', message = 'invalid_decision_note';
  end if;

  select * into request_row
  from public.historical_membership_requests
  where id = p_request_id
  for update;

  if not found or request_row.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'request_not_pending';
  end if;
  if reviewer_person_id is null
    or not (select private.is_organization_admin(request_row.organization_id))
  then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if p_decision = 'approved' then
    if exists (
      select 1 from public.memberships
      where person_id = request_row.person_id
        and organization_id = request_row.organization_id
    ) then
      raise exception using errcode = 'P0001', message = 'membership_exists';
    end if;

    insert into public.memberships (
      person_id, organization_id, role, status, provisioning_method,
      starts_on, ends_on, ended_at
    ) values (
      request_row.person_id, request_row.organization_id, 'member', 'ended',
      'access_request', request_row.starts_on, request_row.ends_on,
      request_row.ends_on::timestamptz
    );

    if request_row.team_id is not null then
      insert into public.team_memberships (
        team_id, person_id, role_title, starts_on, ends_on
      ) values (
        request_row.team_id, request_row.person_id, request_row.role_title,
        request_row.starts_on, request_row.ends_on
      );
    end if;
  end if;

  update public.historical_membership_requests
  set status = p_decision,
      reviewed_by_person_id = reviewer_person_id,
      reviewed_at = now(),
      decision_note = nullif(btrim(p_decision_note), '')
  where id = request_row.id;

  insert into public.audit_events (
    actor_person_id, action, target_person_id, organization_id, details
  ) values (
    reviewer_person_id,
    'historical_membership_' || p_decision,
    request_row.person_id,
    request_row.organization_id,
    jsonb_build_object('request_id', request_row.id, 'team_id', request_row.team_id)
  );
end;
$$;

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
  if reviewer_person_id is null
    or not (select private.is_organization_admin(request_row.organization_id))
  then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if p_decision = 'approved' then
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
    jsonb_build_object('request_id', request_row.id)
  );
end;
$$;

alter table public.historical_membership_requests enable row level security;

create policy historical_membership_requests_authorized_read
on public.historical_membership_requests
for select
to authenticated
using (
  person_id = (select private.current_person_id())
  or (select private.is_organization_admin(organization_id))
);

grant delete on public.team_memberships to authenticated;
drop policy if exists team_memberships_self_delete on public.team_memberships;
create policy team_memberships_self_delete
on public.team_memberships
for delete
to authenticated
using (person_id = (select private.current_person_id()));
grant update (archived_at, archived_by_person_id) on public.team_memberships to authenticated;

revoke all on public.historical_membership_requests from anon, authenticated;
grant select on public.historical_membership_requests to authenticated;
grant all on public.historical_membership_requests to service_role;
grant usage, select on sequence public.historical_membership_requests_id_seq to service_role;

revoke all on function private.archive_own_team_membership_on_delete() from public, anon, authenticated;
revoke all on function public.restore_own_team_experience(bigint, timestamptz) from public, anon;
grant execute on function public.restore_own_team_experience(bigint, timestamptz) to authenticated;
revoke all on function public.submit_historical_membership_request(bigint, bigint, text, date, date, text) from public, anon;
grant execute on function public.submit_historical_membership_request(bigint, bigint, text, date, date, text) to authenticated;
revoke all on function public.review_historical_membership_request(bigint, text, text) from public, anon;
grant execute on function public.review_historical_membership_request(bigint, text, text) to authenticated;
revoke all on function public.review_access_request(bigint, text, text) from public, anon;
grant execute on function public.review_access_request(bigint, text, text) to authenticated;

commit;
