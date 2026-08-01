begin;

-- A person is a portal domain record. Authentication accounts are optional and
-- linked separately so members can be registered before they can sign in.
drop trigger if exists on_auth_user_provision_portal on auth.users;

drop policy if exists profiles_authorized_read on public.profiles;
drop policy if exists profiles_self_update on public.profiles;
drop policy if exists memberships_authorized_read on public.memberships;
drop policy if exists access_requests_authorized_read on public.access_requests;
drop policy if exists access_requests_self_insert on public.access_requests;
drop policy if exists audit_events_norstec_admin_read on public.audit_events;

drop function if exists private.provision_portal_user();
drop function if exists public.submit_access_request(bigint, text, text, text, smallint, text);
drop function if exists private.assign_norstec_admin(text);
drop function if exists private.can_manage_profile(uuid);
drop function if exists private.has_active_membership(bigint);
drop function if exists private.is_organization_admin(bigint);
drop function if exists private.is_norstec_admin();

alter table public.organizations
  add column sanity_id text,
  add column specialization text,
  add column website_url text,
  add column short_description text,
  add column location text,
  add column logo_path text;

alter table public.organizations
  add constraint organizations_sanity_id_key unique (sanity_id),
  add constraint organizations_sanity_id_length_check
    check (sanity_id is null or char_length(sanity_id) between 1 and 200),
  add constraint organizations_specialization_check
    check (
      specialization is null
      or specialization in (
        'rocketeering',
        'satellites',
        'satellites-and-rocketeering'
      )
    ),
  add constraint organizations_website_url_length_check
    check (website_url is null or char_length(website_url) <= 2048),
  add constraint organizations_short_description_length_check
    check (short_description is null or char_length(short_description) <= 1000),
  add constraint organizations_location_length_check
    check (location is null or char_length(location) <= 160),
  add constraint organizations_logo_path_length_check
    check (logo_path is null or char_length(logo_path) <= 1024);

create table public.people (
  id bigint generated always as identity primary key,
  sanity_id text unique,
  full_name text,
  first_name text,
  last_name text,
  field_of_study text,
  study_year smallint,
  avatar_path text,
  avatar_alt text,
  linkedin_url text,
  portal_access_status text not null default 'unclaimed',
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  _migration_auth_user_id uuid unique,
  constraint people_sanity_id_length_check
    check (sanity_id is null or char_length(sanity_id) between 1 and 200),
  constraint people_full_name_length_check
    check (full_name is null or char_length(btrim(full_name)) between 1 and 160),
  constraint people_first_name_length_check
    check (first_name is null or char_length(first_name) <= 80),
  constraint people_last_name_length_check
    check (last_name is null or char_length(last_name) <= 80),
  constraint people_field_of_study_length_check
    check (field_of_study is null or char_length(field_of_study) <= 160),
  constraint people_study_year_check
    check (study_year is null or study_year between 1 and 10),
  constraint people_avatar_path_length_check
    check (avatar_path is null or char_length(avatar_path) <= 1024),
  constraint people_avatar_alt_length_check
    check (avatar_alt is null or char_length(avatar_alt) <= 300),
  constraint people_linkedin_url_length_check
    check (linkedin_url is null or char_length(linkedin_url) <= 2048),
  constraint people_portal_access_status_check
    check (portal_access_status in ('unclaimed', 'active', 'suspended')),
  constraint people_source_check
    check (source in ('manual', 'sanity', 'google'))
);

create table public.person_emails (
  id bigint generated always as identity primary key,
  person_id bigint not null references public.people (id) on delete cascade,
  email text not null unique,
  email_type text not null default 'unknown',
  is_primary boolean not null default false,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint person_emails_email_lowercase_check check (email = lower(email)),
  constraint person_emails_email_format_check
    check (email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  constraint person_emails_type_check
    check (email_type in ('organization', 'personal', 'unknown')),
  constraint person_emails_source_check
    check (source in ('manual', 'sanity', 'google'))
);

create unique index person_emails_one_primary_per_person_idx
  on public.person_emails (person_id)
  where is_primary;

create index person_emails_person_id_idx
  on public.person_emails (person_id);

create table public.portal_accounts (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  person_id bigint not null references public.people (id) on delete restrict,
  provider text not null default 'google',
  account_email text not null,
  linked_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint portal_accounts_provider_check check (provider = 'google'),
  constraint portal_accounts_email_lowercase_check
    check (account_email = lower(account_email)),
  constraint portal_accounts_email_format_check
    check (account_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);

create index portal_accounts_person_id_idx
  on public.portal_accounts (person_id);

insert into public.people (
  full_name,
  first_name,
  last_name,
  field_of_study,
  study_year,
  portal_access_status,
  source,
  created_at,
  updated_at,
  _migration_auth_user_id
)
select
  profile.full_name,
  profile.first_name,
  profile.last_name,
  profile.field_of_study,
  profile.study_year,
  'active',
  'google',
  profile.created_at,
  profile.updated_at,
  profile.user_id
from public.profiles as profile;

insert into public.person_emails (
  person_id,
  email,
  email_type,
  is_primary,
  source,
  created_at,
  updated_at
)
select
  person.id,
  profile.email,
  case
    when split_part(profile.email, '@', 2) = 'norstec.no' then 'organization'
    else 'personal'
  end,
  true,
  'google',
  profile.created_at,
  profile.updated_at
from public.profiles as profile
join public.people as person
  on person._migration_auth_user_id = profile.user_id;

insert into public.portal_accounts (
  auth_user_id,
  person_id,
  account_email,
  linked_at,
  last_seen_at
)
select
  profile.user_id,
  person.id,
  profile.email,
  profile.created_at,
  profile.updated_at
from public.profiles as profile
join public.people as person
  on person._migration_auth_user_id = profile.user_id;

alter table public.memberships
  add column person_id bigint references public.people (id) on delete cascade,
  add column starts_on date;

update public.memberships as membership
set person_id = person.id
from public.people as person
where person._migration_auth_user_id = membership.user_id;

alter table public.memberships
  alter column person_id set not null,
  drop constraint memberships_user_organization_key,
  drop constraint memberships_user_id_fkey,
  drop constraint memberships_status_check,
  drop constraint memberships_provisioning_method_check,
  drop column user_id,
  add constraint memberships_person_organization_key unique (person_id, organization_id),
  add constraint memberships_status_check
    check (status in ('planned', 'active', 'suspended', 'alumni', 'ended')),
  add constraint memberships_provisioning_method_check
    check (provisioning_method in ('domain', 'access_request', 'manual', 'sanity_import'));

create index memberships_person_status_idx
  on public.memberships (person_id, status);

alter table public.access_requests
  add column person_id bigint references public.people (id) on delete cascade,
  add column reviewed_by_person_id bigint references public.people (id) on delete set null;

update public.access_requests as request
set person_id = requester.id
from public.people as requester
where requester._migration_auth_user_id = request.user_id;

update public.access_requests as request
set reviewed_by_person_id = reviewer.id
from public.people as reviewer
where reviewer._migration_auth_user_id = request.reviewed_by;

alter table public.access_requests
  alter column person_id set not null,
  drop constraint access_requests_user_id_fkey,
  drop constraint access_requests_reviewed_by_fkey,
  drop column user_id,
  drop column reviewed_by;

drop index if exists access_requests_one_pending_per_organization_idx;
create unique index access_requests_one_pending_per_organization_idx
  on public.access_requests (person_id, organization_id)
  where status = 'pending';

drop index if exists access_requests_reviewed_by_idx;
create index access_requests_reviewed_by_person_idx
  on public.access_requests (reviewed_by_person_id)
  where reviewed_by_person_id is not null;

alter table public.audit_events
  add column actor_person_id bigint references public.people (id) on delete set null,
  add column target_person_id bigint references public.people (id) on delete set null;

update public.audit_events as event
set target_person_id = target.id
from public.people as target
where target._migration_auth_user_id = event.target_user_id;

update public.audit_events as event
set actor_person_id = actor.id
from public.people as actor
where event.actor_person_id is null
  and actor._migration_auth_user_id = event.actor_user_id;

alter table public.audit_events
  drop constraint audit_events_actor_user_id_fkey,
  drop constraint audit_events_target_user_id_fkey,
  drop column actor_user_id,
  drop column target_user_id;

drop index if exists audit_events_actor_created_idx;
drop index if exists audit_events_target_created_idx;
create index audit_events_actor_created_idx
  on public.audit_events (actor_person_id, created_at desc)
  where actor_person_id is not null;
create index audit_events_target_created_idx
  on public.audit_events (target_person_id, created_at desc)
  where target_person_id is not null;

drop table public.profiles;
alter table public.people drop column _migration_auth_user_id;

create table public.teams (
  id bigint generated always as identity primary key,
  organization_id bigint not null references public.organizations (id) on delete cascade,
  sanity_id text unique,
  slug text not null,
  name text not null,
  description text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teams_organization_slug_key unique (organization_id, slug),
  constraint teams_slug_format_check
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint teams_name_length_check
    check (char_length(btrim(name)) between 1 and 160),
  constraint teams_description_length_check
    check (description is null or char_length(description) <= 5000),
  constraint teams_status_check check (status in ('active', 'archived')),
  constraint teams_sanity_id_length_check
    check (sanity_id is null or char_length(sanity_id) between 1 and 200)
);

create index teams_organization_status_idx
  on public.teams (organization_id, status);

create table public.team_memberships (
  id bigint generated always as identity primary key,
  team_id bigint not null references public.teams (id) on delete cascade,
  person_id bigint not null references public.people (id) on delete cascade,
  role_title text,
  sort_order integer not null default 0,
  sanity_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_memberships_team_person_key unique (team_id, person_id),
  constraint team_memberships_team_sanity_key unique (team_id, sanity_key),
  constraint team_memberships_role_title_length_check
    check (role_title is null or char_length(role_title) <= 160),
  constraint team_memberships_sort_order_check check (sort_order >= 0),
  constraint team_memberships_sanity_key_length_check
    check (sanity_key is null or char_length(sanity_key) between 1 and 200)
);

create index team_memberships_person_id_idx
  on public.team_memberships (person_id);

create table public.external_accounts (
  id bigint generated always as identity primary key,
  person_id bigint not null references public.people (id) on delete cascade,
  organization_id bigint not null references public.organizations (id) on delete cascade,
  provider text not null,
  external_id text,
  account_email text,
  status text not null default 'not_started',
  provisioned_at timestamptz,
  deprovisioned_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint external_accounts_person_organization_provider_key
    unique (person_id, organization_id, provider),
  constraint external_accounts_provider_external_id_key unique (provider, external_id),
  constraint external_accounts_provider_check
    check (provider in ('google_workspace', 'slack')),
  constraint external_accounts_email_lowercase_check
    check (account_email is null or account_email = lower(account_email)),
  constraint external_accounts_status_check
    check (status in ('not_started', 'pending', 'active', 'suspended', 'failed')),
  constraint external_accounts_external_id_length_check
    check (external_id is null or char_length(external_id) <= 300),
  constraint external_accounts_email_format_check
    check (
      account_email is null
      or account_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ),
  constraint external_accounts_last_error_length_check
    check (last_error is null or char_length(last_error) <= 2000)
);

create index external_accounts_organization_status_idx
  on public.external_accounts (organization_id, status);

create trigger people_set_updated_at
before update on public.people
for each row execute function private.set_updated_at();

create trigger person_emails_set_updated_at
before update on public.person_emails
for each row execute function private.set_updated_at();

create trigger teams_set_updated_at
before update on public.teams
for each row execute function private.set_updated_at();

create trigger team_memberships_set_updated_at
before update on public.team_memberships
for each row execute function private.set_updated_at();

create trigger external_accounts_set_updated_at
before update on public.external_accounts
for each row execute function private.set_updated_at();

create or replace function private.current_person_id()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select account.person_id
  from public.portal_accounts as account
  where account.auth_user_id = (select auth.uid());
$$;

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
    where membership.person_id = (select private.current_person_id())
      and membership.status = 'active'
  );
$$;

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
    where membership.person_id = (select private.current_person_id())
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
    where membership.person_id = (select private.current_person_id())
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
        and target_membership.status in ('planned', 'active', 'suspended', 'alumni')
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
          and target_membership.status in ('active', 'alumni')
      )
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
    where membership.person_id = (select private.current_person_id())
      and membership.organization_id = target_organization_id
      and membership.status = 'active'
  );
$$;

revoke all on function private.current_person_id() from public, anon;
revoke all on function private.is_portal_member() from public, anon;
revoke all on function private.is_norstec_admin() from public, anon;
revoke all on function private.is_organization_admin(bigint) from public, anon;
revoke all on function private.can_manage_person(bigint) from public, anon;
revoke all on function private.can_view_person(bigint) from public, anon;
revoke all on function private.has_active_membership(bigint) from public, anon;
grant execute on function private.current_person_id() to authenticated;
grant execute on function private.is_portal_member() to authenticated;
grant execute on function private.is_norstec_admin() to authenticated;
grant execute on function private.is_organization_admin(bigint) to authenticated;
grant execute on function private.can_manage_person(bigint) to authenticated;
grant execute on function private.can_view_person(bigint) to authenticated;
grant execute on function private.has_active_membership(bigint) to authenticated;

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
    )
    values (display_name, 'active', 'google')
    returning id into matched_person_id;
  else
    update public.people
    set full_name = coalesce(full_name, display_name),
        portal_access_status = 'active'
    where id = matched_person_id;
  end if;

  insert into public.person_emails (
    person_id,
    email,
    email_type,
    is_primary,
    source
  )
  values (
    matched_person_id,
    normalized_email,
    case
      when split_part(normalized_email, '@', 2) = 'norstec.no' then 'organization'
      else 'personal'
    end,
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
  )
  values (new.id, matched_person_id, normalized_email)
  on conflict (auth_user_id) do update
  set account_email = excluded.account_email,
      last_seen_at = now();

  select domain.organization_id
  into matched_organization_id
  from private.organization_domains as domain
  join public.organizations as organization
    on organization.id = domain.organization_id
  where domain.domain = split_part(normalized_email, '@', 2)
    and organization.status = 'active';

  if matched_organization_id is not null then
    insert into public.memberships (
      person_id,
      organization_id,
      role,
      status,
      provisioning_method
    )
    values (
      matched_person_id,
      matched_organization_id,
      'member',
      'active',
      'domain'
    )
    on conflict (person_id, organization_id) do update
    set status = 'active',
        ended_at = null
    where public.memberships.provisioning_method = 'domain';
  else
    update public.memberships
    set status = 'suspended',
        ended_at = now()
    where person_id = matched_person_id
      and provisioning_method = 'domain'
      and status = 'active';
  end if;

  return new;
end;
$$;

revoke all on function private.provision_portal_user() from public, anon, authenticated;

create trigger on_auth_user_provision_portal
after insert or update of email, email_confirmed_at, raw_app_meta_data on auth.users
for each row execute function private.provision_portal_user();

create or replace function private.assign_norstec_admin(target_email text)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  target_person_id bigint;
  norstec_organization_id bigint;
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
    raise exception 'No linked, verified Google user exists for the supplied email';
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
  where person_id = target_person_id
    and organization_id = norstec_organization_id;

  if not found then
    raise exception 'The person does not have a Norstec membership';
  end if;

  insert into public.audit_events (
    action,
    target_person_id,
    organization_id,
    details
  )
  values (
    'membership.role_assigned',
    target_person_id,
    norstec_organization_id,
    jsonb_build_object('role', 'norstec_admin', 'source', 'database_admin')
  );

  return target_person_id;
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
  current_person_id bigint;
  new_request_id bigint;
begin
  current_person_id := (select private.current_person_id());

  if current_person_id is null then
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
    field_of_study,
    study_year,
    message
  )
  values (
    current_person_id,
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

alter table public.people enable row level security;
alter table public.person_emails enable row level security;
alter table public.portal_accounts enable row level security;
alter table public.teams enable row level security;
alter table public.team_memberships enable row level security;
alter table public.external_accounts enable row level security;

create policy people_authorized_read
on public.people
for select
to authenticated
using ((select private.can_view_person(id)));

create policy people_self_update
on public.people
for update
to authenticated
using (id = (select private.current_person_id()))
with check (id = (select private.current_person_id()));

create policy person_emails_authorized_read
on public.person_emails
for select
to authenticated
using ((select private.can_manage_person(person_id)));

create policy portal_accounts_self_read
on public.portal_accounts
for select
to authenticated
using (auth_user_id = (select auth.uid()));

create policy memberships_authorized_read
on public.memberships
for select
to authenticated
using (
  person_id = (select private.current_person_id())
  or (
    (select private.is_portal_member())
    and status in ('active', 'alumni')
  )
  or (select private.is_organization_admin(organization_id))
);

create policy teams_portal_member_read
on public.teams
for select
to authenticated
using ((select private.is_portal_member()));

create policy team_memberships_portal_member_read
on public.team_memberships
for select
to authenticated
using ((select private.is_portal_member()));

create policy external_accounts_authorized_read
on public.external_accounts
for select
to authenticated
using (
  person_id = (select private.current_person_id())
  or (select private.is_norstec_admin())
);

create policy access_requests_authorized_read
on public.access_requests
for select
to authenticated
using (
  person_id = (select private.current_person_id())
  or (select private.is_organization_admin(organization_id))
);

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
  and not (select private.has_active_membership(organization_id))
);

create policy audit_events_norstec_admin_read
on public.audit_events
for select
to authenticated
using ((select private.is_norstec_admin()));

revoke all on public.people from anon, authenticated;
revoke all on public.person_emails from anon, authenticated;
revoke all on public.portal_accounts from anon, authenticated;
revoke all on public.teams from anon, authenticated;
revoke all on public.team_memberships from anon, authenticated;
revoke all on public.external_accounts from anon, authenticated;
revoke all on public.memberships from anon, authenticated;
revoke all on public.access_requests from anon, authenticated;
revoke all on public.audit_events from anon, authenticated;

grant select on public.people to authenticated;
grant update (
  full_name,
  first_name,
  last_name,
  field_of_study,
  study_year,
  avatar_path,
  avatar_alt,
  linkedin_url
) on public.people to authenticated;
grant select on public.person_emails to authenticated;
grant select on public.portal_accounts to authenticated;
grant select on public.memberships to authenticated;
grant select on public.teams to authenticated;
grant select on public.team_memberships to authenticated;
grant select on public.external_accounts to authenticated;
grant select on public.access_requests to authenticated;
grant insert (
  person_id,
  organization_id,
  field_of_study,
  study_year,
  message
) on public.access_requests to authenticated;
grant select on public.audit_events to authenticated;

grant all on public.people to service_role;
grant all on public.person_emails to service_role;
grant all on public.portal_accounts to service_role;
grant all on public.memberships to service_role;
grant all on public.teams to service_role;
grant all on public.team_memberships to service_role;
grant all on public.external_accounts to service_role;
grant usage, select on sequence public.people_id_seq to service_role;
grant usage, select on sequence public.person_emails_id_seq to service_role;
grant usage, select on sequence public.teams_id_seq to service_role;
grant usage, select on sequence public.team_memberships_id_seq to service_role;
grant usage, select on sequence public.external_accounts_id_seq to service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'member-avatars',
  'member-avatars',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists member_avatars_portal_member_read on storage.objects;
create policy member_avatars_portal_member_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'member-avatars'
  and (select private.is_portal_member())
);

commit;
