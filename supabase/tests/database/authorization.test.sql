begin;

create extension if not exists pgtap with schema extensions;

select plan(41);

insert into public.people (
  full_name,
  portal_access_status,
  source
)
values (
  'Pre-created Member',
  'unclaimed',
  'manual'
);

insert into public.person_emails (
  person_id,
  email,
  email_type,
  is_primary,
  source
)
select
  person.id,
  'precreated@norstec.no',
  'organization',
  true,
  'manual'
from public.people as person
where person.full_name = 'Pre-created Member';

insert into public.person_emails (
  person_id,
  email,
  email_type,
  is_primary,
  source
)
select
  person.id,
  'precreated.personal@example.com',
  'personal',
  false,
  'manual'
from public.people as person
where person.full_name = 'Pre-created Member';

insert into public.memberships (
  person_id,
  organization_id,
  role,
  status,
  provisioning_method
)
select
  person.id,
  organization.id,
  'member',
  'active',
  'manual'
from public.people as person
cross join public.organizations as organization
where person.full_name = 'Pre-created Member'
  and organization.slug = 'norstec';

insert into public.organizations (slug, name, status)
values ('history-organization', 'History Organization', 'active');

insert into public.memberships (
  person_id,
  organization_id,
  role,
  status,
  provisioning_method,
  starts_on,
  ends_on
)
select
  person.id,
  organization.id,
  'member',
  'ended',
  'manual',
  '2023-08-01'::date,
  '2024-06-30'::date
from public.people as person
cross join public.organizations as organization
where person.full_name = 'Pre-created Member'
  and organization.slug = 'history-organization';

insert into public.teams (
  organization_id,
  slug,
  name
)
select
  organization.id,
  'pre-created-team',
  'Pre-created Team'
from public.organizations as organization
where organization.slug = 'norstec';

insert into public.team_memberships (
  team_id,
  person_id,
  role_title,
  sort_order
)
select
  team.id,
  person.id,
  'Team member',
  0
from public.teams as team
cross join public.people as person
where team.slug = 'pre-created-team'
  and person.full_name = 'Pre-created Member';

insert into auth.users (
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  is_sso_user,
  is_anonymous
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'authenticated',
    'authenticated',
    'member@norstec.no',
    now(),
    '{"provider":"google","providers":["google"]}'::jsonb,
    '{"full_name":"Norstec Member"}'::jsonb,
    now(),
    now(),
    false,
    false
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'authenticated',
    'authenticated',
    'personal@example.com',
    now(),
    '{"provider":"google","providers":["google"]}'::jsonb,
    '{"full_name":"Personal User"}'::jsonb,
    now(),
    now(),
    false,
    false
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'authenticated',
    'authenticated',
    'password-user@example.com',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    false,
    false
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    'authenticated',
    'authenticated',
    'precreated@norstec.no',
    now(),
    '{"provider":"google","providers":["google"]}'::jsonb,
    '{"full_name":"Pre-created Member"}'::jsonb,
    now(),
    now(),
    false,
    false
  );

select ok(
  exists (
    select 1
    from public.portal_accounts
    where auth_user_id = '11111111-1111-4111-8111-111111111111'
  ),
  'a verified Norstec Google user receives a portal account'
);

select ok(
  exists (
    select 1
    from public.memberships as membership
    join public.portal_accounts as account
      on account.person_id = membership.person_id
    where account.auth_user_id = '11111111-1111-4111-8111-111111111111'
      and membership.status = 'active'
  ),
  'a verified Norstec Google user receives active membership'
);

select is(
  (
    select membership.role
    from public.memberships as membership
    join public.portal_accounts as account
      on account.person_id = membership.person_id
    where account.auth_user_id = '11111111-1111-4111-8111-111111111111'
  ),
  'member',
  'domain provisioning grants only the member role'
);

select ok(
  exists (
    select 1
    from public.portal_accounts
    where auth_user_id = '22222222-2222-4222-8222-222222222222'
  ),
  'a verified personal Google user receives a portal account'
);

select is(
  (
    select count(*)
    from public.memberships as membership
    join public.portal_accounts as account
      on account.person_id = membership.person_id
    where account.auth_user_id = '22222222-2222-4222-8222-222222222222'
  ),
  0::bigint,
  'a personal Google user receives no automatic membership'
);

select is(
  (
    select count(*)
    from public.portal_accounts
    where auth_user_id = '33333333-3333-4333-8333-333333333333'
  ),
  0::bigint,
  'a non-Google user is not provisioned'
);

select is(
  (
    select count(*)
    from public.person_emails
    where email = 'precreated@norstec.no'
  ),
  1::bigint,
  'sign-in claims the pre-created person without creating a duplicate'
);

select is(
  (
    select account.person_id
    from public.portal_accounts as account
    where account.auth_user_id = '44444444-4444-4444-8444-444444444444'
  ),
  (
    select person.id
    from public.people as person
    where person.full_name = 'Pre-created Member'
  ),
  'the Google account is linked to the pre-created person'
);

select is(
  (
    select portal_access_status
    from public.people
    where full_name = 'Pre-created Member'
  ),
  'active',
  'claiming a person activates portal access'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);

select lives_ok(
  $$
    select public.submit_access_request(
      (select id from public.organizations where slug = 'norstec'),
      'Personal',
      'User',
      'Computer Science',
      3::smallint,
      'Please review my request'
    )
  $$,
  'a personal Google user can submit an access request'
);

select is(
  (
    select count(*)
    from public.access_requests
    where person_id = (select private.current_person_id())
      and status = 'pending'
  ),
  1::bigint,
  'a submitted request is visible to its owner'
);

select is(
  (
    select count(*)
    from public.people
    where id = (select private.current_person_id())
  ),
  1::bigint,
  'a user can read their own person record'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select lives_ok(
  $$
    update public.people
    set phone_number = '+47 900 00 000'
    where id = (select private.current_person_id())
  $$,
  'a member can update their own phone number'
);

select is(
  (
    select phone_number
    from public.people
    where id = (select private.current_person_id())
  ),
  '+47 900 00 000',
  'the updated phone number is stored on the member'
);

update public.people
set phone_number = '+47 911 11 111'
where full_name = 'Pre-created Member';

select is(
  (
    select phone_number
    from public.people
    where full_name = 'Pre-created Member'
  ),
  null::text,
  'a member cannot update another person phone number'
);

select lives_ok(
  $$
    update public.memberships
    set starts_on = '2025-08-01',
        ends_on = null
    where person_id = (select private.current_person_id())
      and organization_id = (
        select id from public.organizations where slug = 'norstec'
      )
  $$,
  'a member can update their own organization history dates'
);

select is(
  (
    select starts_on
    from public.memberships
    where person_id = (select private.current_person_id())
      and organization_id = (
        select id from public.organizations where slug = 'norstec'
      )
  ),
  '2025-08-01'::date,
  'the organization history start date is stored'
);

select lives_ok(
  $$
    insert into public.team_memberships (
      team_id,
      person_id,
      role_title,
      starts_on,
      ends_on
    )
    select
      team.id,
      (select private.current_person_id()),
      'Project Engineer',
      '2025-09-01'::date,
      null
    from public.teams as team
    where team.slug = 'pre-created-team'
  $$,
  'a member can add their own history in a team from their organization'
);

select is(
  (
    select role_title
    from public.team_memberships
    where person_id = (select private.current_person_id())
      and team_id = (
        select id from public.teams where slug = 'pre-created-team'
      )
  ),
  'Project Engineer',
  'the self-authored team role is stored'
);

select is(
  (
    select count(*)
    from public.people
    where full_name = 'Pre-created Member'
  ),
  1::bigint,
  'an active member can read another active member'
);

select is(
  (
    select count(*)
    from public.teams
    where slug = 'pre-created-team'
  ),
  1::bigint,
  'an active member can read teams'
);

select is(
  (
    select count(*)
    from public.team_memberships
    where role_title = 'Team member'
  ),
  1::bigint,
  'an active member can read team memberships'
);

select is(
  (
    select count(*)
    from public.person_emails
    where person_id = (
      select id from public.people where full_name = 'Pre-created Member'
    )
  ),
  1::bigint,
  'a member can read an organization email but not a personal email'
);

select is(
  (
    select count(*)
    from public.memberships
    where organization_id = (
      select id from public.organizations where slug = 'history-organization'
    )
      and status = 'ended'
  ),
  1::bigint,
  'an active member can read another member public organization history'
);

select is(
  (
    select count(*)
    from public.people
    where full_name = 'Personal User'
  ),
  0::bigint,
  'a regular member cannot read an unrelated access requester'
);

select is(
  (
    select count(*)
    from public.access_requests
    where person_id = (
      select person_id
      from public.portal_accounts
      where auth_user_id = '22222222-2222-4222-8222-222222222222'
    )
  ),
  0::bigint,
  'a regular member cannot read another person access request'
);

reset role;

select is(
  private.assign_norstec_admin('member@norstec.no'),
  (
    select person_id
    from public.portal_accounts
    where auth_user_id = '11111111-1111-4111-8111-111111111111'
  ),
  'the controlled bootstrap function returns the promoted person'
);

select is(
  (
    select membership.role
    from public.memberships as membership
    join public.portal_accounts as account
      on account.person_id = membership.person_id
    where account.auth_user_id = '11111111-1111-4111-8111-111111111111'
  ),
  'norstec_admin',
  'the bootstrap function grants the Norstec admin role'
);

select is(
  (
    select count(*)
    from public.audit_events
    where target_person_id = (
      select person_id
      from public.portal_accounts
      where auth_user_id = '11111111-1111-4111-8111-111111111111'
    )
      and action = 'membership.role_assigned'
  ),
  1::bigint,
  'the bootstrap role assignment is audited'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select is(
  (
    select count(*)
    from public.people
    where full_name = 'Personal User'
  ),
  1::bigint,
  'a Norstec admin can read an access requester person record'
);

select is(
  (
    select count(*)
    from public.access_requests
    where status = 'pending'
  ),
  1::bigint,
  'a Norstec admin can read pending access requests'
);

select is(
  (
    select count(*)
    from public.audit_events
    where action = 'membership.role_assigned'
  ),
  1::bigint,
  'a Norstec admin can read audit events'
);

select is(
  (
    select count(*)
    from public.person_emails
    where person_id = (
      select id from public.people where full_name = 'Pre-created Member'
    )
  ),
  2::bigint,
  'a Norstec admin can read both organization and personal emails'
);

reset role;

select is(
  has_function_privilege(
    'authenticated',
    'private.assign_norstec_admin(text)',
    'execute'
  ),
  false,
  'authenticated users cannot invoke the admin bootstrap function'
);

select is(
  (
    select count(*)
    from pg_class
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relname in (
        'organizations',
        'people',
        'person_emails',
        'portal_accounts',
        'memberships',
        'teams',
        'team_memberships',
        'external_accounts',
        'access_requests',
        'audit_events'
      )
      and pg_class.relrowsecurity
  ),
  10::bigint,
  'RLS is enabled on every public portal table'
);

select is(
  has_table_privilege('anon', 'public.people', 'select'),
  false,
  'anonymous users have no people table privileges'
);

select is(
  has_table_privilege('anon', 'public.person_emails', 'select'),
  false,
  'anonymous users have no email table privileges'
);

select is(
  has_column_privilege('authenticated', 'public.portal_accounts', 'account_email', 'update'),
  false,
  'authenticated users cannot change their authoritative account email'
);

select is(
  has_column_privilege('authenticated', 'public.person_emails', 'email', 'update'),
  false,
  'authenticated users cannot change registered email addresses directly'
);

select is(
  (
    select count(*)
    from public.people
    where full_name = 'Pre-created Member'
      and source = 'manual'
  ),
  1::bigint,
  'claiming a record preserves its manually created source'
);

select is(
  (
    select count(*)
    from public.memberships as membership
    join public.people as person on person.id = membership.person_id
    join public.organizations as organization
      on organization.id = membership.organization_id
    where person.full_name = 'Pre-created Member'
      and membership.provisioning_method = 'manual'
      and organization.slug = 'norstec'
  ),
  1::bigint,
  'claiming a record preserves its manually created membership'
);

select * from finish();
rollback;
