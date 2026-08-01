begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.organizations (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_slug_format_check
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint organizations_name_length_check
    check (char_length(btrim(name)) between 1 and 120),
  constraint organizations_status_check
    check (status in ('active', 'inactive'))
);

create table private.organization_domains (
  domain text primary key,
  organization_id bigint not null references public.organizations (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint organization_domains_lowercase_check
    check (domain = lower(domain)),
  constraint organization_domains_format_check
    check (domain ~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$')
);

create index organization_domains_organization_id_idx
  on private.organization_domains (organization_id);

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text,
  first_name text,
  last_name text,
  field_of_study text,
  study_year smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_lowercase_check
    check (email = lower(email)),
  constraint profiles_email_format_check
    check (email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  constraint profiles_full_name_length_check
    check (full_name is null or char_length(full_name) <= 160),
  constraint profiles_first_name_length_check
    check (first_name is null or char_length(first_name) <= 80),
  constraint profiles_last_name_length_check
    check (last_name is null or char_length(last_name) <= 80),
  constraint profiles_field_of_study_length_check
    check (field_of_study is null or char_length(field_of_study) <= 160),
  constraint profiles_study_year_check
    check (study_year is null or study_year between 1 and 10)
);

create table public.memberships (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  organization_id bigint not null references public.organizations (id) on delete cascade,
  role text not null default 'member',
  status text not null default 'active',
  provisioning_method text not null default 'manual',
  joined_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memberships_user_organization_key unique (user_id, organization_id),
  constraint memberships_role_check
    check (role in ('member', 'organization_admin', 'norstec_admin')),
  constraint memberships_status_check
    check (status in ('active', 'suspended', 'alumni')),
  constraint memberships_provisioning_method_check
    check (provisioning_method in ('domain', 'access_request', 'manual'))
);

create index memberships_organization_status_role_idx
  on public.memberships (organization_id, status, role);

create table public.access_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  organization_id bigint not null references public.organizations (id) on delete cascade,
  status text not null default 'pending',
  field_of_study text,
  study_year smallint,
  message text,
  reviewed_by uuid references public.profiles (user_id) on delete set null,
  reviewed_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint access_requests_status_check
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  constraint access_requests_field_of_study_length_check
    check (field_of_study is null or char_length(field_of_study) <= 160),
  constraint access_requests_study_year_check
    check (study_year is null or study_year between 1 and 10),
  constraint access_requests_message_length_check
    check (message is null or char_length(message) <= 2000),
  constraint access_requests_decision_note_length_check
    check (decision_note is null or char_length(decision_note) <= 1000)
);

create unique index access_requests_one_pending_per_organization_idx
  on public.access_requests (user_id, organization_id)
  where status = 'pending';

create index access_requests_organization_pending_created_idx
  on public.access_requests (organization_id, created_at)
  where status = 'pending';

create index access_requests_reviewed_by_idx
  on public.access_requests (reviewed_by)
  where reviewed_by is not null;

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_user_id uuid references public.profiles (user_id) on delete set null,
  action text not null,
  target_user_id uuid references public.profiles (user_id) on delete set null,
  organization_id bigint references public.organizations (id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_events_action_length_check
    check (char_length(btrim(action)) between 1 and 120),
  constraint audit_events_details_object_check
    check (jsonb_typeof(details) = 'object')
);

create index audit_events_actor_created_idx
  on public.audit_events (actor_user_id, created_at desc)
  where actor_user_id is not null;

create index audit_events_target_created_idx
  on public.audit_events (target_user_id, created_at desc)
  where target_user_id is not null;

create index audit_events_organization_created_idx
  on public.audit_events (organization_id, created_at desc)
  where organization_id is not null;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function private.set_updated_at();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger memberships_set_updated_at
before update on public.memberships
for each row execute function private.set_updated_at();

create trigger access_requests_set_updated_at
before update on public.access_requests
for each row execute function private.set_updated_at();

create or replace function private.is_norstec_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships as membership
    where membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role = 'norstec_admin'
  );
$$;

create or replace function private.is_organization_admin(target_organization_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships as membership
    where membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and (
        membership.role = 'norstec_admin'
        or (
          membership.organization_id = target_organization_id
          and membership.role = 'organization_admin'
        )
      )
  );
$$;

create or replace function private.can_manage_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_user_id = (select auth.uid())
    or exists (
      select 1
      from public.memberships as caller_membership
      join public.memberships as target_membership
        on target_membership.organization_id = caller_membership.organization_id
      where caller_membership.user_id = (select auth.uid())
        and target_membership.user_id = target_user_id
        and caller_membership.status = 'active'
        and target_membership.status in ('active', 'suspended', 'alumni')
        and caller_membership.role = 'organization_admin'
    )
    or exists (
      select 1
      from public.memberships as admin_membership
      where admin_membership.user_id = (select auth.uid())
        and admin_membership.status = 'active'
        and admin_membership.role = 'norstec_admin'
    );
$$;

create or replace function private.has_active_membership(target_organization_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships as membership
    where membership.user_id = (select auth.uid())
      and membership.organization_id = target_organization_id
      and membership.status = 'active'
  );
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;
revoke all on function private.is_norstec_admin() from public, anon;
revoke all on function private.is_organization_admin(bigint) from public, anon;
revoke all on function private.can_manage_profile(uuid) from public, anon;
revoke all on function private.has_active_membership(bigint) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_norstec_admin() to authenticated;
grant execute on function private.is_organization_admin(bigint) to authenticated;
grant execute on function private.can_manage_profile(uuid) to authenticated;
grant execute on function private.has_active_membership(bigint) to authenticated;

insert into public.organizations (slug, name)
values ('norstec', 'Norstec')
on conflict (slug) do update set name = excluded.name;

insert into private.organization_domains (domain, organization_id)
select 'norstec.no', organization.id
from public.organizations as organization
where organization.slug = 'norstec'
on conflict (domain) do update
set organization_id = excluded.organization_id;

create or replace function private.provision_portal_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text;
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

  insert into public.profiles (user_id, email, full_name)
  values (new.id, normalized_email, display_name)
  on conflict (user_id) do update
  set email = excluded.email;

  select domain.organization_id
  into matched_organization_id
  from private.organization_domains as domain
  join public.organizations as organization
    on organization.id = domain.organization_id
  where domain.domain = split_part(normalized_email, '@', 2)
    and organization.status = 'active';

  if matched_organization_id is not null then
    insert into public.memberships (
      user_id,
      organization_id,
      role,
      status,
      provisioning_method
    )
    values (
      new.id,
      matched_organization_id,
      'member',
      'active',
      'domain'
    )
    on conflict (user_id, organization_id) do update
    set status = 'active',
        ended_at = null
    where public.memberships.provisioning_method = 'domain';
  else
    update public.memberships
    set status = 'suspended',
        ended_at = now()
    where user_id = new.id
      and provisioning_method = 'domain'
      and status = 'active';
  end if;

  return new;
end;
$$;

revoke all on function private.provision_portal_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_provision_portal on auth.users;
create trigger on_auth_user_provision_portal
after insert or update of email, email_confirmed_at, raw_app_meta_data on auth.users
for each row execute function private.provision_portal_user();

insert into public.profiles (user_id, email, full_name)
select
  auth_user.id,
  lower(auth_user.email),
  coalesce(
    nullif(btrim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(auth_user.raw_user_meta_data ->> 'name'), '')
  )
from auth.users as auth_user
where auth_user.email is not null
  and auth_user.email_confirmed_at is not null
  and (
    coalesce(auth_user.raw_app_meta_data ->> 'provider', '') = 'google'
    or coalesce(auth_user.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'google'
  )
on conflict (user_id) do update
set email = excluded.email;

insert into public.memberships (
  user_id,
  organization_id,
  role,
  status,
  provisioning_method
)
select
  profile.user_id,
  domain.organization_id,
  'member',
  'active',
  'domain'
from public.profiles as profile
join private.organization_domains as domain
  on domain.domain = split_part(profile.email, '@', 2)
join public.organizations as organization
  on organization.id = domain.organization_id
 and organization.status = 'active'
on conflict (user_id, organization_id) do nothing;

create or replace function private.assign_norstec_admin(target_email text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  target_user_id uuid;
  norstec_organization_id bigint;
begin
  select auth_user.id
  into target_user_id
  from auth.users as auth_user
  where lower(auth_user.email) = lower(target_email)
    and auth_user.email_confirmed_at is not null
    and (
      coalesce(auth_user.raw_app_meta_data ->> 'provider', '') = 'google'
      or coalesce(auth_user.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'google'
    );

  if target_user_id is null then
    raise exception 'No verified Google user exists for the supplied email';
  end if;

  select organization.id
  into norstec_organization_id
  from public.organizations as organization
  where organization.slug = 'norstec'
    and organization.status = 'active';

  if norstec_organization_id is null then
    raise exception 'The Norstec organization is not active';
  end if;

  update public.memberships
  set role = 'norstec_admin',
      status = 'active',
      provisioning_method = 'manual',
      ended_at = null
  where user_id = target_user_id
    and organization_id = norstec_organization_id;

  if not found then
    raise exception 'The user does not have a Norstec membership';
  end if;

  insert into public.audit_events (
    action,
    target_user_id,
    organization_id,
    details
  )
  values (
    'membership.role_assigned',
    target_user_id,
    norstec_organization_id,
    jsonb_build_object('role', 'norstec_admin', 'source', 'database_admin')
  );

  return target_user_id;
end;
$$;

revoke all on function private.assign_norstec_admin(text) from public, anon, authenticated;
grant execute on function private.assign_norstec_admin(text) to postgres;

create or replace function public.submit_access_request(
  target_organization_id bigint,
  requested_first_name text,
  requested_last_name text,
  requested_field_of_study text,
  requested_study_year smallint,
  requested_message text
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid;
  new_request_id bigint;
begin
  current_user_id := (select auth.uid());

  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;

  if not exists (
    select 1
    from public.organizations as organization
    where organization.id = target_organization_id
      and organization.status = 'active'
  ) then
    raise exception 'The selected organization is not available';
  end if;

  update public.profiles
  set first_name = nullif(btrim(requested_first_name), ''),
      last_name = nullif(btrim(requested_last_name), ''),
      full_name = nullif(
        btrim(concat_ws(' ', requested_first_name, requested_last_name)),
        ''
      ),
      field_of_study = nullif(btrim(requested_field_of_study), ''),
      study_year = requested_study_year
  where user_id = current_user_id;

  if not found then
    raise exception 'A portal profile does not exist for this user';
  end if;

  insert into public.access_requests (
    user_id,
    organization_id,
    field_of_study,
    study_year,
    message
  )
  values (
    current_user_id,
    target_organization_id,
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
  text
) from public, anon;
grant execute on function public.submit_access_request(
  bigint,
  text,
  text,
  text,
  smallint,
  text
) to authenticated;

alter table public.organizations enable row level security;
alter table private.organization_domains enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.access_requests enable row level security;
alter table public.audit_events enable row level security;

create policy organizations_authenticated_read
on public.organizations
for select
to authenticated
using (
  status = 'active'
  and (select auth.uid()) is not null
);

create policy profiles_authorized_read
on public.profiles
for select
to authenticated
using ((select private.can_manage_profile(user_id)));

create policy profiles_self_update
on public.profiles
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy memberships_authorized_read
on public.memberships
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_organization_admin(organization_id))
);

create policy access_requests_authorized_read
on public.access_requests
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_organization_admin(organization_id))
);

create policy access_requests_self_insert
on public.access_requests
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and status = 'pending'
  and reviewed_by is null
  and reviewed_at is null
  and decision_note is null
  and not (select private.has_active_membership(organization_id))
);

create policy audit_events_norstec_admin_read
on public.audit_events
for select
to authenticated
using ((select private.is_norstec_admin()));

revoke all on public.organizations from anon, authenticated;
revoke all on public.profiles from anon, authenticated;
revoke all on public.memberships from anon, authenticated;
revoke all on public.access_requests from anon, authenticated;
revoke all on public.audit_events from anon, authenticated;

grant select on public.organizations to authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, first_name, last_name, field_of_study, study_year)
  on public.profiles to authenticated;
grant select on public.memberships to authenticated;
grant select on public.access_requests to authenticated;
grant insert (user_id, organization_id, field_of_study, study_year, message)
  on public.access_requests to authenticated;
grant select on public.audit_events to authenticated;
grant usage, select on sequence public.access_requests_id_seq to authenticated;

grant all on public.organizations to service_role;
grant all on public.profiles to service_role;
grant all on public.memberships to service_role;
grant all on public.access_requests to service_role;
grant all on public.audit_events to service_role;
grant all on all sequences in schema public to service_role;

commit;
