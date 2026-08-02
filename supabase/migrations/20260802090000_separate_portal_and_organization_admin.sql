begin;

-- Portal administration is a system permission. Portal administrators also
-- inherit organization administration for every active organization.
create table public.portal_administrators (
  person_id bigint primary key references public.people (id) on delete cascade,
  granted_by_person_id bigint references public.people (id) on delete set null,
  granted_at timestamptz not null default now()
);

alter table public.people
  drop constraint people_portal_access_status_check,
  add constraint people_portal_access_status_check
    check (portal_access_status in ('unclaimed', 'active', 'suspended', 'deactivated'));

-- Keep every separate active interval. The memberships row represents the
-- current organization relationship; periods are the canonical lifecycle
-- history when somebody leaves and later returns.
create table public.membership_periods (
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

create unique index membership_periods_one_open_idx
  on public.membership_periods (membership_id)
  where ends_on is null;

create index membership_periods_membership_starts_idx
  on public.membership_periods (membership_id, starts_on desc);

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
where membership.status in ('active', 'ended');

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

create trigger memberships_create_period
after insert on public.memberships
for each row execute function private.create_membership_period();

insert into public.portal_administrators (person_id)
select distinct membership.person_id
from public.memberships as membership
where membership.role = 'norstec_admin';

-- Existing Norstec administrators keep their current Norstec organization
-- administration while receiving the separate portal permission above.
update public.memberships
set role = 'organization_admin'
where role = 'norstec_admin';

alter table public.memberships
  drop constraint memberships_role_check,
  add constraint memberships_role_check
    check (role in ('member', 'organization_admin'));

create or replace function private.is_portal_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.portal_administrators as administrator
    join public.people as person on person.id = administrator.person_id
    where administrator.person_id = (select private.current_person_id())
      and person.portal_access_status = 'active'
  );
$$;

create or replace function private.is_organization_admin(target_organization_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select private.is_portal_admin())
    or exists (
      select 1
      from public.memberships as membership
      where membership.person_id = (select private.current_person_id())
        and membership.organization_id = target_organization_id
        and membership.status = 'active'
        and membership.role = 'organization_admin'
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
    );
$$;

-- Keep the old private helper unavailable to application roles while replacing
-- its former policy usages with the explicit portal permission.
drop policy if exists audit_events_norstec_admin_read on public.audit_events;
create policy audit_events_portal_admin_read
on public.audit_events
for select
to authenticated
using ((select private.is_portal_admin()));

drop policy if exists external_accounts_authorized_read on public.external_accounts;
create policy external_accounts_authorized_read
on public.external_accounts
for select
to authenticated
using (
  person_id = (select private.current_person_id())
  or (select private.is_portal_admin())
);

alter table public.portal_administrators enable row level security;
alter table public.membership_periods enable row level security;

create policy portal_administrators_self_read
on public.portal_administrators
for select
to authenticated
using (person_id = (select private.current_person_id()));

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

revoke all on public.portal_administrators from anon, authenticated;
grant select (person_id) on public.portal_administrators to authenticated;
grant all on public.portal_administrators to service_role;

revoke all on public.membership_periods from anon, authenticated;
grant select on public.membership_periods to authenticated;
grant all on public.membership_periods to service_role;
grant usage, select on sequence public.membership_periods_id_seq to service_role;

revoke all on function private.is_portal_admin() from public, anon;
grant execute on function private.is_portal_admin() to authenticated;

create or replace function private.assign_portal_admin(target_email text)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  target_person_id bigint;
begin
  select person_email.person_id
  into target_person_id
  from public.person_emails as person_email
  join public.portal_accounts as account
    on account.person_id = person_email.person_id
  join auth.users as auth_user
    on auth_user.id = account.auth_user_id
  where person_email.email = lower(target_email)
    and auth_user.email_confirmed_at is not null
    and (
      coalesce(auth_user.raw_app_meta_data ->> 'provider', '') = 'google'
      or coalesce(auth_user.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'google'
    )
  limit 1;

  if target_person_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'verified_google_account_required';
  end if;

  insert into public.portal_administrators (person_id)
  values (target_person_id)
  on conflict (person_id) do nothing;

  insert into public.audit_events (
    action,
    target_person_id,
    details
  ) values (
    'portal_admin.assigned',
    target_person_id,
    jsonb_build_object('source', 'database_admin')
  );

  return target_person_id;
end;
$$;

revoke all on function private.assign_portal_admin(text) from public, anon, authenticated;
grant execute on function private.assign_portal_admin(text) to postgres;

drop function if exists private.assign_norstec_admin(text);
drop function if exists private.is_norstec_admin();

-- Authentication may create a first domain membership, but it must never
-- reactivate or end an existing organization relationship. Suspended and
-- self-deactivated portal access also survives later Google sign-ins.
create or replace function private.provision_portal_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text;
  matched_person_id bigint;
  matched_organization_id bigint;
  display_name text;
begin
  normalized_email := lower(new.email);

  if normalized_email is null
    or new.email_confirmed_at is null
    or not (
      coalesce(new.raw_app_meta_data ->> 'provider', '') = 'google'
      or coalesce(new.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'google'
    )
  then
    return new;
  end if;

  display_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), '')
  );

  select account.person_id
  into matched_person_id
  from public.portal_accounts as account
  where account.auth_user_id = new.id;

  if matched_person_id is null then
    select person_email.person_id
    into matched_person_id
    from public.person_emails as person_email
    where person_email.email = normalized_email;
  end if;

  if matched_person_id is null then
    insert into public.people (
      full_name,
      portal_access_status,
      source
    ) values (display_name, 'active', 'google')
    returning id into matched_person_id;
  else
    update public.people
    set full_name = coalesce(full_name, display_name),
        portal_access_status = case
          when portal_access_status = 'unclaimed' then 'active'
          else portal_access_status
        end
    where id = matched_person_id;
  end if;

  select domain.organization_id
  into matched_organization_id
  from private.organization_domains as domain
  join public.organizations as organization
    on organization.id = domain.organization_id
  where domain.domain = split_part(normalized_email, '@', 2)
    and organization.status = 'active';

  insert into public.person_emails (
    person_id,
    email,
    email_type,
    is_primary,
    source
  ) values (
    matched_person_id,
    normalized_email,
    case when matched_organization_id is not null then 'organization' else 'personal' end,
    not exists (
      select 1
      from public.person_emails as existing_email
      where existing_email.person_id = matched_person_id
        and existing_email.is_primary
    ),
    'google'
  )
  on conflict (email) do nothing;

  insert into public.portal_accounts (
    auth_user_id,
    person_id,
    account_email
  ) values (
    new.id,
    matched_person_id,
    normalized_email
  )
  on conflict (auth_user_id) do update
  set account_email = excluded.account_email,
      last_seen_at = now();

  if matched_organization_id is not null then
    insert into public.memberships (
      person_id,
      organization_id,
      role,
      status,
      provisioning_method
    ) values (
      matched_person_id,
      matched_organization_id,
      'member',
      'active',
      'domain'
    )
    on conflict (person_id, organization_id) do nothing;
  end if;

  return new;
end;
$$;

create or replace function private.require_member_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active'
    and not exists (
      select 1
      from public.person_emails as person_email
      where person_email.person_id = new.person_id
    )
  then
    raise exception using
      errcode = '23514',
      message = 'membership_email_required';
  end if;

  return new;
end;
$$;

create trigger memberships_require_email
before insert or update of person_id, status on public.memberships
for each row execute function private.require_member_email();

create or replace function private.prevent_last_member_email_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.person_id = old.person_id then
    return new;
  end if;

  if exists (
    select 1
    from public.memberships as membership
    where membership.person_id = old.person_id
      and membership.status = 'active'
  )
    and not exists (
      select 1
      from public.person_emails as person_email
      where person_email.person_id = old.person_id
        and person_email.id <> old.id
    )
  then
    raise exception using
      errcode = '23514',
      message = 'member_must_keep_email';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger person_emails_keep_one_for_members
before delete or update of person_id on public.person_emails
for each row execute function private.prevent_last_member_email_removal();

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

revoke all on function private.require_member_email() from public, anon, authenticated;
revoke all on function private.prevent_last_member_email_removal() from public, anon, authenticated;
revoke all on function private.create_membership_period() from public, anon, authenticated;
revoke all on function public.set_organization_membership_status(bigint, text) from public, anon;
grant execute on function public.set_organization_membership_status(bigint, text) to authenticated;
revoke all on function public.deactivate_own_portal_access() from public, anon;
grant execute on function public.deactivate_own_portal_access() to authenticated;

commit;
