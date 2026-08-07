begin;

create extension if not exists pgtap with schema extensions;

select plan(240);

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

insert into public.organizations (slug, name, status)
values ('claimed-history-organization', 'Claimed History Organization', 'active');

insert into public.organizations (slug, name, status)
values ('orbit-ntnu', 'Orbit NTNU', 'active');

insert into private.organization_domains (domain, organization_id)
select 'orbitntnu.no', id
from public.organizations
where slug = 'orbit-ntnu';

insert into public.teams (organization_id, slug, name)
select id, 'historical-team', 'Historical Team'
from public.organizations
where slug = 'claimed-history-organization';

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

insert into public.people (
  full_name,
  portal_access_status,
  source
)
values (
  'Organization Email Only',
  'active',
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
  'orgonly@norstec.no',
  'organization',
  true,
  'manual'
from public.people as person
where person.full_name = 'Organization Email Only';

insert into public.memberships (
  person_id,
  organization_id,
  role,
  status,
  provisioning_method,
  starts_on
)
select
  person.id,
  organization.id,
  'member',
  'active',
  'manual',
  '2025-08-01'::date
from public.people as person
cross join public.organizations as organization
where person.full_name = 'Organization Email Only'
  and organization.slug = 'norstec';

insert into public.team_memberships (
  team_id,
  person_id,
  role_title,
  starts_on,
  sort_order
)
select
  team.id,
  person.id,
  'Team member',
  '2025-08-01'::date,
  0
from public.teams as team
cross join public.people as person
where team.slug = 'pre-created-team'
  and person.full_name = 'Organization Email Only';

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
    '{"full_name":"Norstec Member","custom_claims":{"hd":"norstec.no"}}'::jsonb,
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
    '{"full_name":"Pre-created Member","custom_claims":{"hd":"norstec.no"}}'::jsonb,
    now(),
    now(),
    false,
    false
  ),
  (
    '55555555-5555-4555-8555-555555555555',
    'authenticated',
    'authenticated',
    'orgonly@norstec.no',
    now(),
    '{"provider":"google","providers":["google"]}'::jsonb,
    '{"full_name":"Organization Email Only","custom_claims":{"hd":"norstec.no"}}'::jsonb,
    now(),
    now(),
    false,
    false
  );

insert into auth.identities (
  provider_id,
  user_id,
  identity_data,
  provider,
  created_at,
  updated_at
)
values
  (
    'google-member-primary',
    '11111111-1111-4111-8111-111111111111',
    '{"email":"member@norstec.no","email_verified":true}'::jsonb,
    'google',
    now(),
    now()
  );

select ok(
  exists (
    select 1
    from public.portal_accounts
    where auth_user_id = '11111111-1111-4111-8111-111111111111'
  ),
  'a verified Norstec Google user receives a portal account'
);

select is(
  (
    select onboarding_status
    from public.portal_accounts
    where auth_user_id = '11111111-1111-4111-8111-111111111111'
  ),
  'pending',
  'a new organization account waits for the user to choose a profile'
);

select is(
  (
    select count(*)
    from public.memberships as membership
    join public.portal_accounts as account
      on account.person_id = membership.person_id
    where account.auth_user_id = '11111111-1111-4111-8111-111111111111'
  ),
  0::bigint,
  'pending organization onboarding does not create membership prematurely'
);

update auth.users
set updated_at = now()
where id = '11111111-1111-4111-8111-111111111111';

select is(
  (
    select onboarding_status
    from public.portal_accounts
    where auth_user_id = '11111111-1111-4111-8111-111111111111'
  ),
  'pending',
  'a later Auth user update preserves pending organization onboarding'
);

select is(
  (
    select count(*)
    from public.memberships as membership
    join public.portal_accounts as account
      on account.person_id = membership.person_id
    where account.auth_user_id = '11111111-1111-4111-8111-111111111111'
  ),
  0::bigint,
  'a later Auth user update cannot bypass the organization account choice'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select lives_ok(
  $$ select public.complete_own_organization_onboarding() $$,
  'a first-time organization user can choose to create a new profile'
);

reset role;

select is(
  (
    select onboarding_status
    from public.portal_accounts
    where auth_user_id = '11111111-1111-4111-8111-111111111111'
  ),
  'complete',
  'creating a new profile completes organization onboarding'
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

-- Identity synchronization was granted to every authenticated role while the
-- application only ever linked accounts through the link-intent flow. Its
-- absence is the guarantee: a signed-in user cannot link a Google identity in
-- Supabase Auth and turn it into an organization membership on their own.
select is(
  (
    select count(*)
    from pg_proc
    join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
    where pg_namespace.nspname = 'public'
      and pg_proc.proname = 'sync_linked_google_identities'
  ),
  0::bigint,
  'the superseded identity-synchronization RPC no longer exists'
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
      'Please review my request',
      'organization'
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

select lives_ok(
  $$
    select public.save_own_profile_v4(
      (select updated_at from public.people where id = (select private.current_person_id())),
      '+47 922 22 222',
      'Technology, Engineering and Architecture',
      4::smallint,
      null,
      (select avatar_path from public.people where id = (select private.current_person_id())),
      (select avatar_alt from public.people where id = (select private.current_person_id())),
      jsonb_build_array(
        (
          select jsonb_build_object(
            'id', experience.id,
            'expectedUpdatedAt', experience.updated_at,
            'organizationId', experience.organization_id,
            'organizationName', experience.organization_name,
            'description', '',
            'startsOn', '2025-09-01',
            'endsOn', ''
          )
          from public.profile_experiences as experience
          where experience.person_id = (select private.current_person_id())
            and experience.organization_id = (
              select id from public.organizations where slug = 'norstec'
            )
        )
      ),
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb
    )
  $$,
  'a member can save profile and visual experience atomically'
);

select is(
  (select phone_number from public.people where id = (select private.current_person_id())),
  '+47 922 22 222',
  'the atomic profile save stores personal information'
);

select has_column(
  'public', 'people', 'profile_updated_at',
  'people has a profile-specific concurrency version'
);

create temporary table profile_version_snapshot as
select id, profile_updated_at
from public.people
where id = (select private.current_person_id());

reset role;
update auth.users
set raw_app_meta_data = raw_app_meta_data
where id = '44444444-4444-4444-8444-444444444444';
set local role authenticated;

select is(
  (select profile_updated_at from public.people where id = (select private.current_person_id())),
  (select profile_updated_at from profile_version_snapshot),
  'non-profile system updates do not invalidate an open profile editor'
);

select lives_ok(
  $$
    select public.save_own_profile_v5(
      (select profile_updated_at from public.people where id = (select private.current_person_id())),
      (select phone_number from public.people where id = (select private.current_person_id())),
      (select field_of_study from public.people where id = (select private.current_person_id())),
      (select study_year from public.people where id = (select private.current_person_id())),
      (select linkedin_url from public.people where id = (select private.current_person_id())),
      (select avatar_path from public.people where id = (select private.current_person_id())),
      (select avatar_alt from public.people where id = (select private.current_person_id())),
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb
    )
  $$,
  'the app-facing save accepts the current profile-specific version'
);

select throws_ok(
  $$
    select public.save_own_profile_v5(
      '2000-01-01T00:00:00Z'::timestamptz,
      (select phone_number from public.people where id = (select private.current_person_id())),
      (select field_of_study from public.people where id = (select private.current_person_id())),
      (select study_year from public.people where id = (select private.current_person_id())),
      (select linkedin_url from public.people where id = (select private.current_person_id())),
      (select avatar_path from public.people where id = (select private.current_person_id())),
      (select avatar_alt from public.people where id = (select private.current_person_id())),
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb
    )
  $$,
  'P0001',
  'profile_conflict',
  'the profile-specific version still rejects a real stale edit'
);

select lives_ok(
  $$
    select public.save_own_profile_v6(
      (select profile_updated_at from public.people where id = (select private.current_person_id())),
      (select phone_number from public.people where id = (select private.current_person_id())),
      (select field_of_study from public.people where id = (select private.current_person_id())),
      (select study_year from public.people where id = (select private.current_person_id())),
      (select linkedin_url from public.people where id = (select private.current_person_id())),
      (select avatar_path from public.people where id = (select private.current_person_id())),
      (select avatar_alt from public.people where id = (select private.current_person_id())),
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      jsonb_build_array(
        jsonb_build_object(
          'organizationName', 'Draft Organization One',
          'organizationId', null,
          'startsOn', '2024-01-01',
          'endsOn', '',
          'description', 'First draft',
          'roles', '[]'::jsonb
        ),
        jsonb_build_object(
          'organizationName', 'Draft Organization Two',
          'organizationId', null,
          'startsOn', '',
          'endsOn', '',
          'description', '',
          'roles', jsonb_build_array(
            jsonb_build_object(
              'teamName', 'Payload',
              'roleTitle', 'Engineer',
              'startsOn', '',
              'endsOn', ''
            )
          )
        )
      ),
      '[]'::jsonb,
      '[]'::jsonb
    )
  $$,
  'one profile save can add multiple new experiences'
);

select is(
  (
    select count(*)
    from public.profile_experiences
    where person_id = (select private.current_person_id())
      and organization_name in ('Draft Organization One', 'Draft Organization Two')
  ),
  2::bigint,
  'all new experience drafts are stored by the same save'
);

select throws_ok(
  $$
    select public.save_own_profile_v6(
      (select profile_updated_at from public.people where id = (select private.current_person_id())),
      (select phone_number from public.people where id = (select private.current_person_id())),
      (select field_of_study from public.people where id = (select private.current_person_id())),
      (select study_year from public.people where id = (select private.current_person_id())),
      (select linkedin_url from public.people where id = (select private.current_person_id())),
      (select avatar_path from public.people where id = (select private.current_person_id())),
      (select avatar_alt from public.people where id = (select private.current_person_id())),
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      jsonb_build_array(
        jsonb_build_object('organizationName', 'Must Roll Back', 'roles', '[]'::jsonb),
        jsonb_build_object('organizationName', '', 'roles', '[]'::jsonb)
      ),
      '[]'::jsonb,
      '[]'::jsonb
    )
  $$,
  'P0001',
  'invalid_experience',
  'an invalid draft rejects the complete profile save'
);

select is(
  (
    select count(*)
    from public.profile_experiences
    where person_id = (select private.current_person_id())
      and organization_name = 'Must Roll Back'
  ),
  0::bigint,
  'a later invalid draft rolls back earlier experience inserts'
);

select is(
  (
    select starts_on
    from public.profile_experiences
    where person_id = (select private.current_person_id())
      and organization_id = (
        select id from public.organizations where slug = 'norstec'
      )
  ),
  '2025-09-01'::date,
  'the same atomic save stores visual experience without changing membership'
);

select throws_ok(
  $$
    select public.save_own_profile_v4(
      '2000-01-01T00:00:00Z'::timestamptz,
      '+47 933 33 333',
      'Technology, Engineering and Architecture',
      4::smallint,
      null,
      (select avatar_path from public.people where id = (select private.current_person_id())),
      (select avatar_alt from public.people where id = (select private.current_person_id())),
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb
    )
  $$,
  'P0001',
  'profile_conflict',
  'a stale profile version is rejected instead of overwriting newer data'
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

select is(
  has_column_privilege('authenticated', 'public.memberships', 'starts_on', 'update'),
  false,
  'members cannot edit authoritative membership dates'
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
  null::date,
  'editing visual experience did not alter the authoritative membership'
);

select is(
  has_table_privilege('authenticated', 'public.team_memberships', 'insert'),
  false,
  'members cannot create authoritative team assignments'
);

select is(
  (
    select count(*)
    from public.team_memberships
    where person_id = (select private.current_person_id())
  ),
  0::bigint,
  'no team assignment was created by editing experience'
);

select hasnt_column(
  'public', 'profile_experiences', 'archived_at',
  'profile experiences no longer have archive state'
);

select hasnt_column(
  'public', 'profile_experience_roles', 'archived_at',
  'profile experience roles no longer have archive state'
);

select ok(
  to_regprocedure('public.save_own_profile_v2(timestamptz,text,text,smallint,text,text,text,jsonb,jsonb)') is null,
  'the archive-capable v2 profile function is removed'
);

select ok(
  to_regprocedure('public.save_own_profile_v3(timestamptz,text,text,smallint,text,text,text,jsonb,jsonb,jsonb)') is null,
  'the archive-capable v3 profile function is removed'
);

select lives_ok(
  $$
    select public.create_own_profile_experience(
      'Independent Space Company',
      null,
      'Payload project',
      'Former engineer',
      '2022-08-01'::date,
      '2023-06-30'::date,
      'A freely authored profile entry'
    )
  $$,
  'a portal member can add arbitrary profile experience without approval'
);

select is(
  (
    select count(*)
    from public.profile_experiences
    where person_id = (select private.current_person_id())
      and organization_name = 'Independent Space Company'
  ),
  1::bigint,
  'the arbitrary profile experience is immediately visible to its owner'
);

select lives_ok(
  $$
    select public.create_own_profile_experience_v2(
      'Multi-role Space Company',
      null,
      '2020-01-01'::date,
      null,
      'An experience with several teams and roles',
      jsonb_build_array(
        jsonb_build_object('teamName', 'Avionics', 'roleTitle', 'Engineer', 'startsOn', '2020-01-01', 'endsOn', '2021-01-01'),
        jsonb_build_object('teamName', 'Avionics', 'roleTitle', 'Lead', 'startsOn', '2021-01-02', 'endsOn', ''),
        jsonb_build_object('teamName', 'Operations', 'roleTitle', 'Advisor', 'startsOn', '2022-01-01', 'endsOn', '')
      )
    )
  $$,
  'a member can create one experience with multiple teams and roles'
);

select is(
  (
    select count(*)
    from public.profile_experience_roles as experience_role
    join public.profile_experiences as experience on experience.id = experience_role.experience_id
    where experience.person_id = (select private.current_person_id())
      and experience.organization_name = 'Multi-role Space Company'
  ),
  3::bigint,
  'all roles are stored under the same experience'
);

select is(
  (
    select count(distinct experience_role.team_name)
    from public.profile_experience_roles as experience_role
    join public.profile_experiences as experience on experience.id = experience_role.experience_id
    where experience.person_id = (select private.current_person_id())
      and experience.organization_name = 'Multi-role Space Company'
  ),
  2::bigint,
  'multiple roles can belong to the same team'
);

select lives_ok(
  $$
    select public.save_own_profile_v4(
      (select updated_at from public.people where id = (select private.current_person_id())),
      (select phone_number from public.people where id = (select private.current_person_id())),
      (select field_of_study from public.people where id = (select private.current_person_id())),
      (select study_year from public.people where id = (select private.current_person_id())),
      (select linkedin_url from public.people where id = (select private.current_person_id())),
      (select avatar_path from public.people where id = (select private.current_person_id())),
      (select avatar_alt from public.people where id = (select private.current_person_id())),
      '[]'::jsonb,
      '[]'::jsonb,
      jsonb_build_array(
        jsonb_build_object(
          'experienceId', (
            select id from public.profile_experiences
            where person_id = (select private.current_person_id())
              and organization_name = 'Multi-role Space Company'
          ),
          'teamName', 'Operations',
          'roleTitle', 'Team lead',
          'startsOn', '2023-01-01',
          'endsOn', '',
          'sortOrder', 3
        )
      ),
      '[]'::jsonb,
      '[]'::jsonb
    )
  $$,
  'a profile save can add another role to an existing experience'
);

select is(
  (
    select count(*)
    from public.profile_experience_roles as experience_role
    join public.profile_experiences as experience on experience.id = experience_role.experience_id
    where experience.person_id = (select private.current_person_id())
      and experience.organization_name = 'Multi-role Space Company'
      and experience_role.team_name = 'Operations'
  ),
  2::bigint,
  'the added role is stored alongside the existing team role'
);

select lives_ok(
  $$
    select public.save_own_profile_v4(
      (select updated_at from public.people where id = (select private.current_person_id())),
      (select phone_number from public.people where id = (select private.current_person_id())),
      (select field_of_study from public.people where id = (select private.current_person_id())),
      (select study_year from public.people where id = (select private.current_person_id())),
      (select linkedin_url from public.people where id = (select private.current_person_id())),
      (select avatar_path from public.people where id = (select private.current_person_id())),
      (select avatar_alt from public.people where id = (select private.current_person_id())),
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      jsonb_build_array(
        (
          select jsonb_build_object('id', experience_role.id, 'expectedUpdatedAt', experience_role.updated_at)
          from public.profile_experience_roles as experience_role
          join public.profile_experiences as experience on experience.id = experience_role.experience_id
          where experience.person_id = (select private.current_person_id())
            and experience.organization_name = 'Multi-role Space Company'
            and experience_role.team_name = 'Operations'
            and experience_role.role_title = 'Advisor'
        )
      )
    )
  $$,
  'a member can permanently remove a role without archive state'
);

select is(
  (
    select count(*)
    from public.profile_experience_roles as experience_role
    join public.profile_experiences as experience on experience.id = experience_role.experience_id
    where experience.person_id = (select private.current_person_id())
      and experience.organization_name = 'Multi-role Space Company'
      and experience_role.team_name = 'Operations'
  ),
  1::bigint,
  'the removed role is deleted from the profile experience'
);

select throws_ok(
  $$
    select public.save_own_profile_v4(
      (select updated_at from public.people where id = (select private.current_person_id())),
      '+47 955 55 555',
      (select field_of_study from public.people where id = (select private.current_person_id())),
      (select study_year from public.people where id = (select private.current_person_id())),
      (select linkedin_url from public.people where id = (select private.current_person_id())),
      (select avatar_path from public.people where id = (select private.current_person_id())),
      (select avatar_alt from public.people where id = (select private.current_person_id())),
      '[]'::jsonb,
      '[]'::jsonb,
      jsonb_build_array(jsonb_build_object('experienceId', 999999, 'teamName', 'Invalid', 'roleTitle', 'Invalid')),
      '[]'::jsonb,
      '[]'::jsonb
    )
  $$,
  'P0001',
  'invalid_experience_role',
  'a role cannot be attached to an experience the member does not own'
);

select isnt(
  (select phone_number from public.people where id = (select private.current_person_id())),
  '+47 955 55 555',
  'an invalid role rolls back the entire profile save'
);

select lives_ok(
  $$
    select public.create_own_profile_experience_v2(
      'Disposable Experience', null, null, null, null, '[]'::jsonb
    )
  $$,
  'a disposable experience can be created for deletion testing'
);

select lives_ok(
  $$
    select public.save_own_profile_v4(
      (select updated_at from public.people where id = (select private.current_person_id())),
      (select phone_number from public.people where id = (select private.current_person_id())),
      (select field_of_study from public.people where id = (select private.current_person_id())),
      (select study_year from public.people where id = (select private.current_person_id())),
      (select linkedin_url from public.people where id = (select private.current_person_id())),
      (select avatar_path from public.people where id = (select private.current_person_id())),
      (select avatar_alt from public.people where id = (select private.current_person_id())),
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      jsonb_build_array(
        (
          select jsonb_build_object('id', experience.id, 'expectedUpdatedAt', experience.updated_at)
          from public.profile_experiences as experience
          where experience.person_id = (select private.current_person_id())
            and experience.organization_name = 'Disposable Experience'
        )
      ),
      '[]'::jsonb
    )
  $$,
  'a member can permanently remove their own experience'
);

select is(
  (
    select count(*)
    from public.profile_experiences
    where person_id = (select private.current_person_id())
      and organization_name = 'Disposable Experience'
  ),
  0::bigint,
  'the removed experience and its dependent roles are deleted'
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
    from public.team_memberships as team_membership
    join public.people as person on person.id = team_membership.person_id
    where team_membership.role_title = 'Team member'
      and person.full_name = 'Pre-created Member'
  ),
  1::bigint,
  'an active member can read team memberships'
);

-- A second organization address, so the assertion below distinguishes the
-- contact address from the address type rather than passing on both readings.
reset role;

insert into public.person_emails (
  person_id, email, email_type, is_primary, source
)
select id, 'precreated.alternate@norstec.no', 'organization', false, 'manual'
from public.people
where full_name = 'Pre-created Member';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
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
  'a member reads the contact address alone, not every organization address'
);

select is(
  (
    select count(*)
    from public.person_emails
    where person_id = (
      select id from public.people where full_name = 'Pre-created Member'
    )
      and is_primary
  ),
  1::bigint,
  'the address a member reads is the contact one'
);

reset role;

delete from public.person_emails
where email = 'precreated.alternate@norstec.no';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
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
  private.assign_portal_admin('member@norstec.no'),
  (
    select person_id
    from public.portal_accounts
    where auth_user_id = '11111111-1111-4111-8111-111111111111'
  ),
  'the controlled portal-admin bootstrap returns the promoted person'
);

select is(
  (
    select count(*)
    from public.portal_administrators as administrator
    join public.portal_accounts as account
      on account.person_id = administrator.person_id
    where account.auth_user_id = '11111111-1111-4111-8111-111111111111'
  ),
  1::bigint,
  'the bootstrap function grants the separate portal-admin permission'
);

select is(
  (
    select membership.role
    from public.memberships as membership
    join public.portal_accounts as account
      on account.person_id = membership.person_id
    join public.organizations as organization
      on organization.id = membership.organization_id
    where account.auth_user_id = '11111111-1111-4111-8111-111111111111'
      and organization.slug = 'norstec'
  ),
  'member',
  'portal administration does not rewrite organization membership roles'
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
      and action = 'portal_admin.assigned'
  ),
  1::bigint,
  'the portal-admin assignment is audited'
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
  'a portal admin can read an access requester for any organization'
);

select is(
  (
    select count(*)
    from public.access_requests
    where status = 'pending'
  ),
  1::bigint,
  'a portal admin can administer access requests for every organization'
);

select is(
  (
    select count(*)
    from public.audit_events
    where action = 'portal_admin.assigned'
  ),
  1::bigint,
  'a portal admin can read audit events'
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
  'a portal admin reads every address of a person, as an organization admin does'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select is(
  private.is_organization_admin(
    (select id from public.organizations where slug = 'norstec')
  ),
  true,
  'a portal admin inherits organization administration'
);

select lives_ok(
  $$
    select public.set_organization_membership_status(
      (
        select membership.id
        from public.memberships as membership
        join public.people as person on person.id = membership.person_id
        where person.full_name = 'Pre-created Member'
          and membership.organization_id = (
            select id from public.organizations where slug = 'norstec'
          )
      ),
      'ended'
    )
  $$,
  'an organization admin can end a membership in the assigned organization'
);

select is(
  (
    select membership.status
    from public.memberships as membership
    join public.people as person on person.id = membership.person_id
    where person.full_name = 'Pre-created Member'
      and membership.organization_id = (
        select id from public.organizations where slug = 'norstec'
      )
  ),
  'ended',
  'ending a membership stores the alumni lifecycle state'
);

select lives_ok(
  $$
    select public.set_organization_membership_status(
      (
        select membership.id
        from public.memberships as membership
        join public.people as person on person.id = membership.person_id
        where person.full_name = 'Pre-created Member'
          and membership.organization_id = (
            select id from public.organizations where slug = 'norstec'
          )
      ),
      'active'
    )
  $$,
  'an organization admin can reactivate a member with an email address'
);

select is(
  (
    select membership.status
    from public.memberships as membership
    join public.people as person on person.id = membership.person_id
    where person.full_name = 'Pre-created Member'
      and membership.organization_id = (
        select id from public.organizations where slug = 'norstec'
      )
  ),
  'active',
  'reactivating a member clears the alumni lifecycle state'
);

select lives_ok(
  $$
    select public.set_organization_membership_status(
      (
        select membership.id
        from public.memberships as membership
        join public.people as person on person.id = membership.person_id
        where person.full_name = 'Organization Email Only'
          and membership.organization_id = (
            select id from public.organizations where slug = 'norstec'
          )
      ),
      'ended'
    )
  $$,
  'an organization admin can end membership when only an organization email exists'
);

select is(
  (
    select membership.status
    from public.memberships as membership
    join public.people as person on person.id = membership.person_id
    where person.full_name = 'Organization Email Only'
  ),
  'ended',
  'the organization-email-only membership is ended'
);

select is(
  (
    select count(*)
    from public.person_emails as person_email
    join public.people as person on person.id = person_email.person_id
    where person.full_name = 'Organization Email Only'
      and person_email.email_type = 'personal'
  ),
  0::bigint,
  'ending membership does not require or invent a personal email'
);

select is(
  (
    select count(*)
    from public.membership_periods as period
    join public.memberships as membership on membership.id = period.membership_id
    join public.people as person on person.id = membership.person_id
    where person.full_name = 'Organization Email Only'
      and period.ends_on = current_date
  ),
  1::bigint,
  'ending membership closes the active membership period'
);

select is(
  (
    select team_membership.ends_on
    from public.team_memberships as team_membership
    join public.people as person on person.id = team_membership.person_id
    where person.full_name = 'Organization Email Only'
  ),
  current_date,
  'ending membership closes open team memberships in the organization'
);

select is(
  (
    select experience.ends_on
    from public.profile_experiences as experience
    join public.people as person on person.id = experience.person_id
    where person.full_name = 'Organization Email Only'
      and experience.membership_id is not null
  ),
  current_date,
  'ending membership closes its authoritative profile experience'
);

reset role;

select lives_ok(
  $$
    update auth.users
    set raw_app_meta_data = raw_app_meta_data || '{"lifecycle_refresh":1}'::jsonb
    where id = '55555555-5555-4555-8555-555555555555'
  $$,
  'a later domain-account refresh succeeds after membership has ended'
);

select is(
  (
    select membership.status
    from public.memberships as membership
    join public.people as person on person.id = membership.person_id
    where person.full_name = 'Organization Email Only'
  ),
  'ended',
  'domain sign-in provisioning never reactivates an ended membership'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select lives_ok(
  $$
    select public.set_organization_membership_status(
      (
        select membership.id
        from public.memberships as membership
        join public.people as person on person.id = membership.person_id
        where person.full_name = 'Organization Email Only'
      ),
      'active'
    )
  $$,
  'an organization admin can reactivate one ended organization membership'
);

select is(
  (
    select membership.status || ':' || membership.role
    from public.memberships as membership
    join public.people as person on person.id = membership.person_id
    where person.full_name = 'Organization Email Only'
  ),
  'active:member',
  'reactivation restores membership with the safe member role'
);

select is(
  (
    select count(*)
    from public.membership_periods as period
    join public.memberships as membership on membership.id = period.membership_id
    join public.people as person on person.id = membership.person_id
    where person.full_name = 'Organization Email Only'
  ),
  2::bigint,
  'reactivation starts a new membership period without rewriting history'
);

select is(
  (
    select count(*)
    from public.team_memberships as team_membership
    join public.people as person on person.id = team_membership.person_id
    where person.full_name = 'Organization Email Only'
      and team_membership.ends_on is null
  ),
  0::bigint,
  'reactivation does not reopen former team memberships'
);

select lives_ok(
  $$
    select public.set_organization_membership_status(
      (
        select membership.id
        from public.memberships as membership
        join public.people as person on person.id = membership.person_id
        where person.full_name = 'Organization Email Only'
      ),
      'ended'
    )
  $$,
  'the reactivated organization membership can be ended again'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}',
  true
);

select lives_ok(
  $$ select public.delete_own_account() $$,
  'a person who holds no portal-admin role can delete their own account'
);

reset role;

select is(
  (
    select person.portal_access_status
    from public.people as person
    where person.full_name = 'Organization Email Only'
      and person.deleted_at is not null
      and person.deleted_by_person_id = person.id
  ),
  'suspended',
  'self-deletion soft deletes the person and blocks sign-in'
);

select is(
  (
    select count(*)
    from public.audit_events
    where action = 'person.self_deleted'
      and actor_person_id = (
        select id from public.people where full_name = 'Organization Email Only'
      )
  ),
  1::bigint,
  'self-service account deletion is audited'
);

select lives_ok(
  $$
    update auth.users
    set raw_app_meta_data = raw_app_meta_data || '{"lifecycle_refresh":2}'::jsonb
    where id = '55555555-5555-4555-8555-555555555555'
  $$,
  'a later identity refresh succeeds for a deleted account'
);

select is(
  (
    select person.portal_access_status || ':' || membership.status
    from public.people as person
    join public.memberships as membership on membership.person_id = person.id
    where person.full_name = 'Organization Email Only'
  ),
  'suspended:ended',
  'identity refresh never restores a deleted account or its membership'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select lives_ok(
  $$
    update public.profile_experiences
    set organization_name = 'Edited Space Company'
    where person_id = (select private.current_person_id())
      and organization_name = 'Independent Space Company'
  $$,
  'a member can freely edit their own profile experience'
);

select is(
  (
    select organization_name
    from public.profile_experiences
    where person_id = (select private.current_person_id())
      and organization_name = 'Edited Space Company'
  ),
  'Edited Space Company',
  'the edited profile experience is stored'
);

select is(
  (
    select count(*)
    from public.memberships
    where person_id = (select private.current_person_id())
      and organization_id = (
        select id from public.organizations where slug = 'claimed-history-organization'
      )
  ),
  0::bigint,
  'profile experience never creates an authoritative membership'
);

select is(
  (
    select count(*)
    from public.profile_experiences
    where person_id = (select private.current_person_id())
      and membership_id is not null
  ),
  1::bigint,
  'each authoritative organization membership created one default profile experience'
);

reset role;

select is(
  has_function_privilege(
    'authenticated',
    'private.assign_portal_admin(text)',
    'execute'
  ),
  false,
  'authenticated users cannot invoke the portal-admin bootstrap function'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.submit_historical_membership_request(bigint,bigint,text,date,date,text)',
    'execute'
  ),
  false,
  'the deprecated historical membership submission workflow is disabled'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.review_historical_membership_request(bigint,text,text)',
    'execute'
  ),
  false,
  'the deprecated historical membership review workflow is disabled'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.restore_own_team_experience(bigint,timestamptz)',
    'execute'
  ),
  false,
  'the deprecated team experience restore RPC is disabled'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.save_own_profile(timestamptz,text,text,text,smallint,text,text,text,jsonb,jsonb,jsonb)',
    'execute'
  ),
  false,
  'the deprecated profile RPC cannot edit authoritative membership data'
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
        'membership_periods',
        'teams',
        'team_memberships',
        'external_accounts',
        'access_requests',
        'historical_membership_requests',
        'profile_experiences',
        'profile_experience_roles',
        'audit_events'
      )
      and pg_class.relrowsecurity
  ),
  14::bigint,
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
values (
  '66666666-6666-4666-8666-666666666666',
  'authenticated',
  'authenticated',
  'alternative@example.com',
  now(),
  '{"provider":"google","providers":["google"]}'::jsonb,
  '{"full_name":"Alternative Login"}'::jsonb,
  now(),
  now(),
  false,
  false
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select lives_ok(
  $$ select public.start_portal_account_link(repeat('a', 64), 'add_account') $$,
  'an existing profile can start linking one alternative Google account'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}',
  true
);

select lives_ok(
  $$ select public.complete_portal_account_link(repeat('a', 64)) $$,
  'an empty account shell can be linked to the existing portal profile'
);

select is(
  (
    select person_id
    from public.portal_accounts
    where auth_user_id = '66666666-6666-4666-8666-666666666666'
  ),
  (
    select person_id
    from public.portal_accounts
    where auth_user_id = '11111111-1111-4111-8111-111111111111'
  ),
  'both Google sign-ins point to the same portal person'
);

reset role;

select is(
  (select count(*) from public.people where full_name = 'Alternative Login'),
  0::bigint,
  'the unused duplicate person shell is removed after linking'
);

select is(
  (
    select count(*)
    from public.portal_accounts
    where person_id = (
      select person_id
      from public.portal_accounts
      where auth_user_id = '11111111-1111-4111-8111-111111111111'
    )
  ),
  2::bigint,
  'a portal profile has at most one primary and one alternative sign-in account'
);

select is(
  (
    select person_id
    from public.person_emails
    where email = 'alternative@example.com'
  ),
  (
    select person_id
    from public.portal_accounts
    where auth_user_id = '11111111-1111-4111-8111-111111111111'
  ),
  'the alternative email belongs to the existing profile'
);

select is(
  (
    select count(*)
    from public.audit_events
    where action = 'auth.portal_account_linked'
      and details ->> 'account_email' = 'alternative@example.com'
  ),
  1::bigint,
  'linking an alternative account is audited'
);

reset role;

-- Deleting a person cascades into their emails. The guard that keeps an
-- active member from losing their last email must not mistake that cascade
-- for someone stripping a live member, which is what made members
-- undeletable.
insert into public.people (full_name, portal_access_status, source)
values ('Cascade Member', 'active', 'manual');

insert into public.person_emails (
  person_id,
  email,
  email_type,
  is_primary,
  source
)
select person.id, 'cascade.member@example.com', 'personal', true, 'manual'
from public.people as person
where person.full_name = 'Cascade Member';

insert into public.memberships (
  person_id,
  organization_id,
  role,
  status,
  provisioning_method
)
select person.id, organization.id, 'member', 'active', 'manual'
from public.people as person
cross join public.organizations as organization
where person.full_name = 'Cascade Member'
  and organization.slug = 'norstec';

select throws_ok(
  $$ delete from public.person_emails where email = 'cascade.member@example.com' $$,
  '23514',
  'member_must_keep_email',
  'an active member still cannot have their last email removed on its own'
);

select lives_ok(
  $$ delete from public.people where full_name = 'Cascade Member' $$,
  'deleting a person is not blocked by the email their membership required'
);

select is(
  (
    select count(*)
    from public.person_emails
    where email = 'cascade.member@example.com'
  ),
  0::bigint,
  'the delete cascaded through the emails of the deleted person'
);

-- GoTrue updates auth.users on every sign-in, so provisioning runs again and
-- again for the same account. Offboarding that deleted a membership row must
-- not be undone the next time the person signs in.
insert into public.people (full_name, portal_access_status, source)
values ('Returning Member', 'unclaimed', 'manual');

insert into public.person_emails (
  person_id,
  email,
  email_type,
  is_primary,
  source
)
select person.id, 'returning@norstec.no', 'organization', true, 'manual'
from public.people as person
where person.full_name = 'Returning Member';

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
values (
  '99999999-9999-4999-8999-999999999999',
  'authenticated',
  'authenticated',
  'returning@norstec.no',
  now(),
  '{"provider":"google","providers":["google"]}'::jsonb,
  '{"full_name":"Returning Member","custom_claims":{"hd":"norstec.no"}}'::jsonb,
  now(),
  now(),
  false,
  false
);

select is(
  (
    select count(*)
    from public.memberships as membership
    join public.people as person on person.id = membership.person_id
    where person.full_name = 'Returning Member'
  ),
  1::bigint,
  'first sign-in with an approved organization domain creates the membership'
);

delete from public.memberships
where person_id = (
  select id from public.people where full_name = 'Returning Member'
);

update auth.users
set raw_app_meta_data = '{"provider":"google","providers":["google"]}'::jsonb,
    updated_at = now()
where id = '99999999-9999-4999-8999-999999999999';

select is(
  (
    select count(*)
    from public.memberships as membership
    join public.people as person on person.id = membership.person_id
    where person.full_name = 'Returning Member'
  ),
  0::bigint,
  'a later sign-in does not recreate a membership that offboarding removed'
);

-- Unlinking used to remove the organization email a domain membership rested
-- on while leaving the membership active, which let a borrowed organization
-- account be cashed in for membership and then erased.
insert into public.people (full_name, portal_access_status, source)
values ('Unlink Member', 'active', 'manual');

insert into public.person_emails (
  person_id,
  email,
  email_type,
  is_primary,
  source
)
select person.id, 'unlink.personal@example.com', 'personal', true, 'manual'
from public.people as person
where person.full_name = 'Unlink Member';

insert into public.person_emails (
  person_id,
  email,
  email_type,
  is_primary,
  source
)
select person.id, 'unlink.org@norstec.no', 'organization', false, 'manual'
from public.people as person
where person.full_name = 'Unlink Member';

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
    '77777777-7777-4777-8777-777777777777',
    'authenticated',
    'authenticated',
    'unlink.personal@example.com',
    now(),
    '{"provider":"google","providers":["google"]}'::jsonb,
    '{"full_name":"Unlink Member"}'::jsonb,
    now(),
    now(),
    false,
    false
  ),
  (
    '88888888-8888-4888-8888-888888888888',
    'authenticated',
    'authenticated',
    'unlink.org@norstec.no',
    now(),
    '{"provider":"google","providers":["google"]}'::jsonb,
    '{"full_name":"Unlink Member","custom_claims":{"hd":"norstec.no"}}'::jsonb,
    now(),
    now(),
    false,
    false
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"77777777-7777-4777-8777-777777777777","role":"authenticated"}',
  true
);

select throws_ok(
  $$
    select public.unlink_own_portal_account(
      '88888888-8888-4888-8888-888888888888'::uuid
    )
  $$,
  'P0001',
  'membership_requires_account',
  'the account an active domain membership rests on cannot be unlinked'
);

reset role;

update public.memberships
set status = 'ended',
    ends_on = current_date,
    ended_at = now()
where person_id = (
    select id from public.people where full_name = 'Unlink Member'
  )
  and status = 'active';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"77777777-7777-4777-8777-777777777777","role":"authenticated"}',
  true
);

select lives_ok(
  $$
    select public.unlink_own_portal_account(
      '88888888-8888-4888-8888-888888888888'::uuid
    )
  $$,
  'the same account unlinks once the membership has been ended'
);

reset role;

-- Access review lifecycle: an administrator decides a request, the requester
-- reads the decision, and a request that is still open can be withdrawn.
-- Row level security hides other people's portal_accounts rows, so the request
-- under test is pinned in a temporary table instead of looked up per role.
reset role;

create temporary table access_review_target as
select request.id
from public.access_requests as request
join public.portal_accounts as account on account.person_id = request.person_id
where account.auth_user_id = '22222222-2222-4222-8222-222222222222'
  and request.status = 'pending';

grant select on access_review_target to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select lives_ok(
  $$
    select public.review_access_request(
      (select id from access_review_target),
      'rejected',
      'Ask your organization to add your address first.'
    )
  $$,
  'an administrator can decline a pending access request'
);

reset role;

-- Declining is an erasure, not a status. The applicant only ever existed
-- because they asked, so the request, the profile, and the Google sign-in go
-- together and the audit event carries the decision on alone.
select is(
  (
    select count(*)
    from public.access_requests
    where id = (select id from access_review_target)
  ),
  0::bigint,
  'a declined request is removed with the profile behind it'
);

select is(
  (
    select count(*)
    from public.people
    where full_name = 'Personal User'
  ),
  0::bigint,
  'declining deletes the applicant profile'
);

select is(
  (
    select count(*)
    from auth.users
    where id = '22222222-2222-4222-8222-222222222222'
  ),
  0::bigint,
  'declining deletes the Google sign-in the applicant used'
);

select is(
  (
    select count(*)
    from public.audit_events
    where action = 'access_request_rejected'
  ),
  1::bigint,
  'the decision survives in the audit log'
);

-- A second applicant, so withdrawing a still-open request can be tested after
-- the declined one has been erased.
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
values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'authenticated',
  'authenticated',
  'withdrawer@example.com',
  now(),
  '{"provider":"google","providers":["google"]}'::jsonb,
  '{"full_name":"Withdrawing Applicant"}'::jsonb,
  now(),
  now(),
  false,
  false
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}',
  true
);

select public.submit_access_request(
  null,
  'Withdrawing',
  'Applicant',
  'Computer Science',
  null::smallint,
  'Requesting alumni access',
  'alumni'
);

reset role;

create temporary table access_withdraw_target as
select request.id
from public.access_requests as request
join public.portal_accounts as account on account.person_id = request.person_id
where account.auth_user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  and request.status = 'pending';

grant select on access_withdraw_target to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"77777777-7777-4777-8777-777777777777","role":"authenticated"}',
  true
);

select throws_ok(
  $$
    select public.cancel_own_access_request(
      (select id from access_withdraw_target)
    )
  $$,
  '42501',
  'not_authorized',
  'no one can withdraw another person access request'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}',
  true
);

select lives_ok(
  $$
    select public.cancel_own_access_request(
      (select id from access_withdraw_target)
    )
  $$,
  'a requester can withdraw their own pending request'
);

select is(
  (
    select status
    from public.access_requests
    where id = (select id from access_withdraw_target)
  ),
  'cancelled',
  'withdrawing marks the request as cancelled'
);

select throws_ok(
  $$
    select public.cancel_own_access_request(
      (select id from access_withdraw_target)
    )
  $$,
  'P0001',
  'request_not_pending',
  'a withdrawn request cannot be withdrawn twice'
);

reset role;

-- Portal management: suspending, deleting, purging, and merging a person are
-- portal-admin-only operations that exist nowhere else in the product.
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
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'authenticated',
  'authenticated',
  'managed@example.com',
  now(),
  '{"provider":"google","providers":["google"]}'::jsonb,
  '{"full_name":"Managed Person"}'::jsonb,
  now(),
  now(),
  false,
  false
);

create temporary table portal_management_people as
select
  (
    select person_id
    from public.portal_accounts
    where auth_user_id = '11111111-1111-4111-8111-111111111111'
  ) as admin_person_id,
  (
    select person_id
    from public.portal_accounts
    where auth_user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ) as managed_person_id;

grant select on portal_management_people to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}',
  true
);

select throws_ok(
  $$
    select public.set_person_portal_access(
      (select managed_person_id from portal_management_people),
      'suspended'
    )
  $$,
  '42501',
  'not_authorized',
  'an ordinary member cannot suspend portal access'
);

select throws_ok(
  $$
    select public.soft_delete_person(
      (select managed_person_id from portal_management_people),
      null
    )
  $$,
  '42501',
  'not_authorized',
  'an ordinary member cannot delete a person'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select throws_ok(
  $$
    select public.set_person_portal_access(
      (select admin_person_id from portal_management_people),
      'suspended'
    )
  $$,
  'P0001',
  'self_action_blocked',
  'a portal administrator cannot suspend their own access'
);

select throws_ok(
  $$
    select public.set_portal_administrator(
      (select admin_person_id from portal_management_people),
      false
    )
  $$,
  'P0001',
  'self_action_blocked',
  'a portal administrator cannot revoke their own role'
);

select lives_ok(
  $$
    select public.set_person_portal_access(
      (select managed_person_id from portal_management_people),
      'suspended'
    )
  $$,
  'a portal administrator can suspend portal access'
);

reset role;

select is(
  (
    select portal_access_status
    from public.people
    where id = (select managed_person_id from portal_management_people)
  ),
  'suspended',
  'suspension is stored on the person'
);

select is(
  (
    select count(*)
    from public.audit_events
    where action = 'portal_access.suspended'
      and target_person_id
        = (select managed_person_id from portal_management_people)
  ),
  1::bigint,
  'suspending portal access is audited'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

reset role;

select lives_ok(
  $$
    insert into public.memberships (
      person_id, organization_id, role, status, provisioning_method, starts_on
    )
    select
      (select managed_person_id from portal_management_people),
      organization.id,
      'member',
      'active',
      'manual',
      current_date
    from public.organizations as organization
    where organization.slug = 'orbit-ntnu'
  $$,
  'a person can hold an active membership before being deleted'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select lives_ok(
  $$
    select public.soft_delete_person(
      (select managed_person_id from portal_management_people),
      'duplicate profile'
    )
  $$,
  'a portal administrator can delete a person, ending their memberships'
);

reset role;

select is(
  (
    select person.portal_access_status || ':' || membership.status
    from public.people as person
    join public.memberships as membership on membership.person_id = person.id
    where person.id = (select managed_person_id from portal_management_people)
      and person.deleted_at is not null
      and person.access_status_before_deletion = 'suspended'
  ),
  'suspended:ended',
  'deletion suspends access, remembers the previous state, and ends the membership'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}',
  true
);

select is(
  (
    select count(*)
    from public.people
    where id = (select managed_person_id from portal_management_people)
  ),
  0::bigint,
  'a deleted person disappears for ordinary members'
);

reset role;
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
    where id = (select managed_person_id from portal_management_people)
  ),
  1::bigint,
  'a deleted person stays visible to portal administrators'
);

select throws_ok(
  $$
    select public.purge_person(
      (select managed_person_id from portal_management_people),
      now() - interval '1 hour'
    )
  $$,
  'P0001',
  'purge_conflict',
  'purging requires the exact deletion the administrator saw'
);

select lives_ok(
  $$
    select public.restore_person(
      (select managed_person_id from portal_management_people)
    )
  $$,
  'a deleted person can be restored'
);

reset role;

select is(
  (
    select portal_access_status
    from public.people
    where id = (select managed_person_id from portal_management_people)
      and deleted_at is null
  ),
  'suspended',
  'restoring returns the access state the person had before deletion'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select lives_ok(
  $$
    select public.soft_delete_person(
      (select managed_person_id from portal_management_people),
      null
    )
  $$,
  'a restored person can be deleted again'
);

select lives_ok(
  $$
    select public.purge_person(
      (select managed_person_id from portal_management_people),
      (
        select deleted_at
        from public.people
        where id = (select managed_person_id from portal_management_people)
      )
    )
  $$,
  'a deleted person can be purged'
);

reset role;

select is(
  (
    select count(*)
    from public.people
    where id = (select managed_person_id from portal_management_people)
  ),
  0::bigint,
  'purging removes the person row'
);

select is(
  (
    select count(*)
    from auth.users
    where email = 'managed@example.com'
  ),
  0::bigint,
  'purging removes the Auth identity behind the person'
);

select is(
  (
    select count(*)
    from public.audit_events
    where action = 'person.purged'
  ),
  1::bigint,
  'purging is audited without naming the purged person'
);

-- Duplicate repair: two profiles for the same human, one of them holding the
-- organization membership.
insert into public.people (full_name, portal_access_status, source)
values ('Duplicate Keeper', 'unclaimed', 'manual');

insert into public.people (full_name, portal_access_status, source)
values ('Duplicate Copy', 'active', 'manual');

insert into public.person_emails (person_id, email, email_type, is_primary, source)
select id, 'duplicate.keeper@norstec.no', 'organization', true, 'manual'
from public.people
where full_name = 'Duplicate Keeper';

insert into public.person_emails (person_id, email, email_type, is_primary, source)
select id, 'duplicate.copy@example.com', 'personal', true, 'manual'
from public.people
where full_name = 'Duplicate Copy';

insert into public.memberships (
  person_id, organization_id, role, status, provisioning_method
)
select person.id, organization.id, 'member', 'ended', 'manual'
from public.people as person
cross join public.organizations as organization
where person.full_name = 'Duplicate Keeper'
  and organization.slug = 'norstec';

insert into public.memberships (
  person_id, organization_id, role, status, provisioning_method
)
select person.id, organization.id, 'member', 'active', 'manual'
from public.people as person
cross join public.organizations as organization
where person.full_name = 'Duplicate Copy'
  and organization.slug = 'norstec';

insert into public.portal_administrators (person_id)
select id from public.people where full_name = 'Duplicate Copy';

create temporary table duplicate_people as
select
  (select id from public.people where full_name = 'Duplicate Keeper') as keeper_id,
  (select id from public.people where full_name = 'Duplicate Copy') as copy_id;

grant select on duplicate_people to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}',
  true
);

select throws_ok(
  $$
    select public.merge_people(
      (select keeper_id from duplicate_people),
      (select copy_id from duplicate_people),
      null
    )
  $$,
  '42501',
  'not_authorized',
  'an ordinary member cannot merge two profiles'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select throws_ok(
  $$
    select public.merge_people(
      (select keeper_id from duplicate_people),
      (select copy_id from duplicate_people),
      null
    )
  $$,
  'P0001',
  'source_is_portal_administrator',
  'a portal administrator cannot be the duplicate that is folded in'
);

reset role;

-- The role moves to the profile that survives, which is the direction a merge
-- involving a portal administrator is allowed to run in.
delete from public.portal_administrators
where person_id = (select copy_id from duplicate_people);

insert into public.portal_administrators (person_id)
select keeper_id from duplicate_people;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select lives_ok(
  $$
    select public.merge_people(
      (select keeper_id from duplicate_people),
      (select copy_id from duplicate_people),
      'duplicate.copy@example.com'
    )
  $$,
  'a portal administrator can merge a duplicate into an administrator profile'
);

reset role;

select is(
  (
    select count(*)
    from public.people
    where id = (select copy_id from duplicate_people)
  ),
  0::bigint,
  'merging removes the duplicate profile'
);

select is(
  (
    select count(*)
    from public.person_emails
    where person_id = (select keeper_id from duplicate_people)
  ),
  2::bigint,
  'merging moves every email address to the surviving profile'
);

select is(
  (
    select email
    from public.person_emails
    where person_id = (select keeper_id from duplicate_people)
      and is_primary
  ),
  'duplicate.copy@example.com',
  'merging honours the chosen primary address'
);

select is(
  (
    select status
    from public.memberships
    where person_id = (select keeper_id from duplicate_people)
  ),
  'active',
  'merging folds two memberships in one organization into the live one'
);

select is(
  (
    select count(*)
    from public.membership_periods as period
    join public.memberships as membership on membership.id = period.membership_id
    where membership.person_id = (select keeper_id from duplicate_people)
      and period.ends_on is null
  ),
  1::bigint,
  'the merged membership keeps exactly one open period'
);

select is(
  (
    select count(*)
    from public.portal_administrators
    where person_id = (select keeper_id from duplicate_people)
  ),
  1::bigint,
  'merging into a portal administrator leaves the role with the survivor'
);



-- Identity, contact addresses and unlinking. Each assertion below stands for a
-- way one of these used to go wrong: a merge moving somebody's contact
-- address, a Workspace rename stranding it, a reassigned address inheriting
-- the previous holder's profile, and an unlink that took the address with it.

insert into auth.users (
  id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  is_sso_user, is_anonymous
)
values
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'authenticated', 'authenticated', 'rename.subject@orbitntnu.no', now(),
    '{"provider":"google","providers":["google"]}'::jsonb,
    '{"full_name":"Rename Subject","provider_id":"google-rename-subject","custom_claims":{"hd":"orbitntnu.no"}}'::jsonb,
    now(), now(), false, false
  ),
  (
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'authenticated', 'authenticated', 'unlink.subject@orbitntnu.no', now(),
    '{"provider":"google","providers":["google"]}'::jsonb,
    '{"full_name":"Unlink Subject","provider_id":"google-unlink-subject","custom_claims":{"hd":"orbitntnu.no"}}'::jsonb,
    now(), now(), false, false
  ),
  (
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    'authenticated', 'authenticated', 'unlink.subject.private@example.com', now(),
    '{"provider":"google","providers":["google"]}'::jsonb,
    '{"full_name":"Unlink Subject Private","provider_id":"google-unlink-private"}'::jsonb,
    now(), now(), false, false
  );

-- The organization account claims its membership, the way a first-time
-- organization user does.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}',
  true
);
select public.complete_own_organization_onboarding();
reset role;

-- The personal account joins the same person, which is where linking leaves it.
update public.portal_accounts
set person_id = (
  select person_id from public.person_emails
  where email = 'unlink.subject@orbitntnu.no'
)
where auth_user_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

update public.person_emails
set person_id = (
  select person_id from public.person_emails
  where email = 'unlink.subject@orbitntnu.no'
),
is_primary = false
where email = 'unlink.subject.private@example.com';

delete from public.people
where full_name = 'Unlink Subject Private';

create temporary table identity_people as
select
  (select person_id from public.person_emails where email = 'rename.subject@orbitntnu.no')
    as rename_person_id,
  (select person_id from public.person_emails where email = 'unlink.subject@orbitntnu.no')
    as unlink_person_id;

grant select on identity_people to authenticated;

-- A rename in the Google Admin console: same account, new address.
update auth.users
set email = 'renamed.subject@orbitntnu.no'
where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

select is(
  (
    select count(*)
    from public.person_emails
    where person_id = (select rename_person_id from identity_people)
  ),
  1::bigint,
  'a Workspace rename moves the address rather than adding a second one'
);

select is(
  (
    select email
    from public.person_emails
    where person_id = (select rename_person_id from identity_people)
      and is_primary
  ),
  'renamed.subject@orbitntnu.no',
  'the contact address follows a Workspace rename'
);

select is(
  (
    select count(*)
    from public.person_emails
    where email = 'rename.subject@orbitntnu.no'
  ),
  0::bigint,
  'the address a rename left behind is released rather than held forever'
);

-- The Admin console deletes that account and gives the address to somebody
-- new. Auth allows one user per address, so the successor can only exist once
-- the previous holder's Auth user is gone — which is what deleting the
-- Workspace account, or unlinking it here, leaves behind. What survives is the
-- *address row* on the previous holder's profile, still naming the Google
-- account that proved it, and that is the whole of what the portal has to go
-- on when the successor arrives.
delete from auth.users where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

insert into auth.users (
  id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  is_sso_user, is_anonymous
)
values (
  'ffffffff-ffff-4fff-8fff-ffffffffffff',
  'authenticated', 'authenticated', 'renamed.subject@orbitntnu.no', now(),
  '{"provider":"google","providers":["google"]}'::jsonb,
  '{"full_name":"Address Successor","provider_id":"google-address-successor","custom_claims":{"hd":"orbitntnu.no"}}'::jsonb,
  now(), now(), false, false
);

select isnt(
  (
    select person_id
    from public.portal_accounts
    where auth_user_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
  ),
  (select rename_person_id from identity_people),
  'a reassigned address does not hand its new holder the previous profile'
);

select is(
  (
    select person_id
    from public.person_emails
    where email = 'renamed.subject@orbitntnu.no'
  ),
  (select rename_person_id from identity_people),
  'the address stays with the person who already held it'
);

select is(
  (
    select count(*)
    from public.audit_events
    where action = 'auth.account_email_reused'
  ),
  1::bigint,
  'a reused address is recorded for a portal administrator to resolve'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}',
  true
);

select throws_ok(
  $$ select public.unlink_own_portal_account('dddddddd-dddd-4ddd-8ddd-dddddddddddd') $$,
  'P0001',
  'membership_requires_account',
  'an active domain membership blocks unlinking the account that proved it'
);

-- The interface asks the same guard before offering the button, so what a page
-- shows and what the operation does cannot drift apart.
select is(
  (
    select public.portal_account_unlink_block(
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    )
  ),
  'membership_requires_account',
  'the reason a removal would fail is readable before attempting it'
);

reset role;

update public.memberships
set status = 'ended', ended_at = now()
where person_id = (select unlink_person_id from identity_people);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}',
  true
);

select is(
  (
    select public.portal_account_unlink_block(
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    )
  ),
  null,
  'no reason is reported once the removal would succeed'
);

select lives_ok(
  $$ select public.unlink_own_portal_account('dddddddd-dddd-4ddd-8ddd-dddddddddddd') $$,
  'an ended membership no longer holds the sign-in account in place'
);

reset role;

select is(
  (
    select count(*)
    from public.portal_accounts
    where auth_user_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  ),
  0::bigint,
  'unlinking removes the sign-in account'
);

select is(
  (
    select person_id
    from public.person_emails
    where email = 'unlink.subject@orbitntnu.no'
  ),
  (select unlink_person_id from identity_people),
  'unlinking keeps the address on the profile'
);

-- Signing in again with the account that was unlinked. Unlinking deleted the
-- Auth user, so this is a new one — which is what makes the provisioning
-- trigger run at all. The address is still theirs and still names the same
-- Google account, so this is a return rather than a new person, and the ended
-- membership is still what governs.
select is(
  (select count(*) from auth.users where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  0::bigint,
  'unlinking releases the Auth user rather than stranding it'
);

insert into auth.users (
  id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  is_sso_user, is_anonymous
)
values (
  'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1',
  'authenticated', 'authenticated', 'unlink.subject@orbitntnu.no', now(),
  '{"provider":"google","providers":["google"]}'::jsonb,
  '{"full_name":"Unlink Subject","provider_id":"google-unlink-subject","custom_claims":{"hd":"orbitntnu.no"}}'::jsonb,
  now(), now(), false, false
);

select is(
  (
    select person_id
    from public.portal_accounts
    where auth_user_id = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'
  ),
  (select unlink_person_id from identity_people),
  'signing in again after an unlink returns to the same profile'
);

select is(
  (
    select count(*)
    from public.memberships
    where person_id = (select unlink_person_id from identity_people)
      and status = 'active'
  ),
  0::bigint,
  'signing in again does not replace an ended membership with a fresh one'
);

-- A portal administrator repairing a profile its owner cannot reach.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select lives_ok(
  $$ select public.unlink_portal_account('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') $$,
  'a portal administrator can unlink a sign-in account on somebody behalf'
);

select throws_ok(
  $$ select public.remove_person_email(
       (select unlink_person_id from identity_people),
       'unlink.subject@orbitntnu.no'
     ) $$,
  'P0001',
  'email_has_sign_in_account',
  'an address a sign-in account still uses cannot be removed'
);

select lives_ok(
  $$ select public.set_person_primary_email(
       (select unlink_person_id from identity_people),
       'unlink.subject.private@example.com'
     ) $$,
  'a portal administrator can move a contact address'
);

reset role;

select is(
  (
    select email
    from public.person_emails
    where person_id = (select unlink_person_id from identity_people)
      and is_primary
  ),
  'unlink.subject.private@example.com',
  'the chosen address becomes the contact address'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select lives_ok(
  $$ select public.remove_person_email(
       (select unlink_person_id from identity_people),
       'unlink.subject.private@example.com'
     ) $$,
  'an address with no sign-in account behind it can be released'
);

reset role;

select is(
  (
    select email
    from public.person_emails
    where person_id = (select unlink_person_id from identity_people)
      and is_primary
  ),
  'unlink.subject@orbitntnu.no',
  'removing the contact address promotes another rather than leaving none'
);

-- A membership answers the request that was waiting for one.
insert into public.access_requests (person_id, request_type, status)
select unlink_person_id, 'alumni', 'pending' from identity_people;

update public.memberships
set status = 'active', ended_at = null
where person_id = (select unlink_person_id from identity_people);

select is(
  (
    select status
    from public.access_requests
    where person_id = (select unlink_person_id from identity_people)
      and request_type = 'alumni'
  ),
  'cancelled',
  'a membership cancels the alumni request it answers'
);

-- The contact address is an invariant rather than a convention. It is
-- deferred, so a merge can pass through a state with none while addresses move
-- between people; forcing it immediate is how a test sees it.
select throws_ok(
  $$
    update public.person_emails
    set is_primary = false
    where person_id = (select unlink_person_id from identity_people);
    set constraints all immediate;
  $$,
  '23514',
  'person_primary_email_invariant',
  'a person holding addresses cannot be left without a contact one'
);

-- Merging keeps the surviving person's own contact address, including when
-- the duplicate's address is the older of the two.
insert into public.people (full_name, portal_access_status, source)
values ('Contact Keeper', 'active', 'manual');

insert into public.people (full_name, portal_access_status, source)
values ('Contact Duplicate', 'active', 'manual');

insert into public.person_emails (
  person_id, email, email_type, is_primary, source, created_at
)
select id, 'contact.keeper@example.com', 'personal', true, 'manual', now()
from public.people
where full_name = 'Contact Keeper';

insert into public.person_emails (
  person_id, email, email_type, is_primary, source, created_at
)
select id, 'contact.duplicate@example.com', 'personal', true, 'manual',
  now() - interval '5 years'
from public.people
where full_name = 'Contact Duplicate';

create temporary table contact_people as
select
  (select id from public.people where full_name = 'Contact Keeper') as keeper_id,
  (select id from public.people where full_name = 'Contact Duplicate') as duplicate_id;

grant select on contact_people to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select lives_ok(
  $$
    select public.merge_people(
      (select keeper_id from contact_people),
      (select duplicate_id from contact_people),
      null
    )
  $$,
  'a duplicate holding an older address can still be merged in'
);

reset role;

select is(
  (
    select email
    from public.person_emails
    where person_id = (select keeper_id from contact_people)
      and is_primary
  ),
  'contact.keeper@example.com',
  'a merge keeps the surviving contact address even when the duplicate is older'
);

select is(
  (
    select count(*)
    from public.person_emails
    where person_id = (select keeper_id from contact_people)
  ),
  2::bigint,
  'both addresses survive a merge'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select lives_ok(
  $$
    select public.set_person_primary_email(
      (select keeper_id from contact_people),
      'contact.duplicate@example.com'
    )
  $$,
  'the duplicate address can still be chosen deliberately afterwards'
);

reset role;

select is(
  (
    select email
    from public.person_emails
    where person_id = (select keeper_id from contact_people)
      and is_primary
  ),
  'contact.duplicate@example.com',
  'choosing the duplicate address afterwards is what makes it the contact one'
);

-- A name is one fact in three columns. Merging a profile whose parts are
-- filled in — an access request fills them, a Google sign-in does not — used to
-- leave the survivor answering to one name and greeted by another.
insert into public.people (
  full_name, first_name, last_name, portal_access_status, source
)
values ('Named Duplicate', 'Bjorn', 'Duplicate', 'active', 'manual');

insert into public.person_emails (person_id, email, email_type, is_primary, source)
select id, 'named.duplicate@example.com', 'personal', true, 'manual'
from public.people
where full_name = 'Named Duplicate';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select lives_ok(
  $$
    select public.merge_people(
      (select keeper_id from contact_people),
      (select id from public.people where full_name = 'Named Duplicate'),
      null
    )
  $$,
  'a duplicate carrying a full set of name parts can be merged in'
);

reset role;

select is(
  (
    select first_name
    from public.people
    where id = (select keeper_id from contact_people)
  ),
  null,
  'a merge does not fill the survivor first name from the duplicate'
);

select is(
  (
    select full_name
    from public.people
    where id = (select keeper_id from contact_people)
  ),
  'Contact Keeper',
  'the survivor keeps the name it already answered to'
);


-- The Slack sync rewrites the whole inventory for the organization and deletes
-- whatever the snapshot leaves out, so the caller check is the only thing
-- standing between an ordinary member and the contents of that table.
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}',
  true
);

select throws_ok(
  $$ select public.sync_slack_directory('[]'::jsonb) $$,
  '42501',
  'not_authorized',
  'an ordinary member cannot sync the Slack directory'
);

reset role;
set local role anon;

select throws_ok(
  $$ select public.sync_slack_directory('[]'::jsonb) $$,
  '42501',
  'permission denied for function sync_slack_directory',
  'a signed-out visitor cannot sync the Slack directory'
);


-- Hosted domain, domain administration and the join policy. The membership
-- decision has not moved yet: these cover the columns and the operations that
-- the move will read, plus the two guards that make registering a domain
-- survivable — a reserved domain cannot be registered at all, and a domain
-- already answering for one organization cannot be taken by another.

reset role;

insert into public.organizations (slug, name, status)
values ('ignite', 'Ignite', 'active');

insert into public.people (full_name, portal_access_status, source)
values ('Ignite Import', 'unclaimed', 'manual');

insert into public.person_emails (
  person_id, email, email_type, is_primary, source
)
select person.id, 'imported@ignite.no', 'organization', true, 'manual'
from public.people as person
where person.full_name = 'Ignite Import';

-- Google puts `hd` in the ID token only for accounts that belong to the hosted
-- domain, and GoTrue lands it under `custom_claims`. An address suffix proves
-- nothing on its own, so this is the column the membership decision will read.
insert into auth.users (
  id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  is_sso_user, is_anonymous
)
values (
  '77777777-7777-4777-8777-777777777771',
  'authenticated',
  'authenticated',
  'hosted@example.com',
  now(),
  '{"provider":"google","providers":["google"]}'::jsonb,
  '{"full_name":"Hosted Person","custom_claims":{"hd":"example.com"}}'::jsonb,
  now(),
  now(),
  false,
  false
);

select is(
  (
    select hosted_domain
    from public.portal_accounts
    where auth_user_id = '77777777-7777-4777-8777-777777777771'
  ),
  'example.com',
  'provisioning records the hosted domain the Google account proved'
);

insert into auth.users (
  id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  is_sso_user, is_anonymous
)
values (
  '77777777-7777-4777-8777-777777777772',
  'authenticated',
  'authenticated',
  'unhosted@example.com',
  now(),
  '{"provider":"google","providers":["google"]}'::jsonb,
  '{"full_name":"Unhosted Person"}'::jsonb,
  now(),
  now(),
  false,
  false
);

select is(
  (
    select hosted_domain
    from public.portal_accounts
    where auth_user_id = '77777777-7777-4777-8777-777777777772'
  ),
  null,
  'an account that proved no hosted domain records none'
);

-- GoTrue has a legacy path that answers from the userinfo endpoint and drops
-- the claim. A later sign-in arriving without it must not erase what an
-- earlier one established, or the account would silently stop being an
-- organization account.
update auth.users
set raw_user_meta_data = '{"full_name":"Hosted Person"}'::jsonb,
    raw_app_meta_data = '{"provider":"google","providers":["google"]}'::jsonb,
    updated_at = now()
where id = '77777777-7777-4777-8777-777777777771';

select is(
  (
    select hosted_domain
    from public.portal_accounts
    where auth_user_id = '77777777-7777-4777-8777-777777777771'
  ),
  'example.com',
  'a later sign-in without the claim keeps the hosted domain already proven'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}',
  true
);

select throws_ok(
  $$
    select public.add_organization_domain(
      (select id from public.organizations where slug = 'ignite'),
      'ignite.no'
    )
  $$,
  '42501',
  'not_authorized',
  'an ordinary member cannot register an organization domain'
);

select throws_ok(
  $$
    select public.list_organization_domains(
      (select id from public.organizations where slug = 'ignite')
    )
  $$,
  '42501',
  'not_authorized',
  'an ordinary member cannot read which domains an organization answers to'
);

select throws_ok(
  $$
    select public.set_organization_domain_join_policy(
      (select id from public.organizations where slug = 'ignite'),
      'auto'
    )
  $$,
  '42501',
  'not_authorized',
  'an ordinary member cannot change the join policy'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select is(
  (
    select public.preview_organization_domain(
      (select id from public.organizations where slug = 'ignite'),
      'gmail.com'
    ) ->> 'reservedReason'
  ),
  'mailbox_provider',
  'the dry run names why a mailbox provider is refused before anything happens'
);

select is(
  (
    select public.preview_organization_domain(
      (select id from public.organizations where slug = 'ignite'),
      'ignite.no'
    ) ->> 'addressCount'
  ),
  '1',
  'the dry run counts the addresses a registration would capture'
);

-- One typo away from converting every personal address in the portal into an
-- organization address, and under an automatic policy into a membership.
select throws_ok(
  $$
    select public.add_organization_domain(
      (select id from public.organizations where slug = 'ignite'),
      'gmail.com'
    )
  $$,
  'P0001',
  'reserved_domain',
  'a mailbox provider cannot be registered as an organization domain'
);

select throws_ok(
  $$
    select public.add_organization_domain(
      (select id from public.organizations where slug = 'ignite'),
      'ntnu.no'
    )
  $$,
  'P0001',
  'reserved_domain',
  'a shared institution domain cannot be registered either'
);

select throws_ok(
  $$
    select public.add_organization_domain(
      (select id from public.organizations where slug = 'ignite'),
      'norstec.no'
    )
  $$,
  'P0001',
  'domain_registered_elsewhere',
  'a domain already answering for one organization cannot be taken by another'
);

select is(
  (
    select public.add_organization_domain(
      (select id from public.organizations where slug = 'ignite'),
      'ignite.no'
    ) ->> 'addressCount'
  ),
  '1',
  'registering a domain reports how many addresses it captured'
);

select throws_ok(
  $$
    select public.add_organization_domain(
      (select id from public.organizations where slug = 'ignite'),
      'ignite.no'
    )
  $$,
  'P0001',
  'domain_already_registered',
  'the same domain cannot be registered twice'
);

select is(
  (
    select public.list_organization_domains(
      (select id from public.organizations where slug = 'ignite')
    ) -> 0 ->> 'domain'
  ),
  'ignite.no',
  'a portal administrator can read the domains an organization answers to'
);

select throws_ok(
  $$ select public.remove_organization_domain('nothing-here.example') $$,
  'P0001',
  'domain_not_found',
  'removing a domain nobody registered is refused'
);

reset role;

select is(
  (
    select count(*)
    from public.audit_events
    where action = 'organization_domain.added'
      and details ->> 'domain' = 'ignite.no'
  ),
  1::bigint,
  'registering a domain is on the record'
);

select is(
  (
    select domain_join_policy
    from public.organizations
    where slug = 'norstec'
  ),
  'auto',
  'Norstec keeps the automatic join it already had'
);

select is(
  (
    select domain_join_policy
    from public.organizations
    where slug = 'ignite'
  ),
  'request',
  'an organization the portal cannot check against a directory starts by asking'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select throws_ok(
  $$
    select public.set_organization_domain_join_policy(
      (select id from public.organizations where slug = 'ignite'),
      'everyone'
    )
  $$,
  'P0001',
  'invalid_join_policy',
  'a join policy outside the three the product has is refused'
);

select is(
  (
    select public.set_organization_domain_join_policy(
      (select id from public.organizations where slug = 'ignite'),
      'auto'
    ) ->> 'changed'
  ),
  'true',
  'a portal administrator can change the join policy'
);

select is(
  (
    select public.remove_organization_domain('ignite.no') ->> 'retainedMembershipCount'
  ),
  '0',
  'removing a domain reports the memberships it leaves behind rather than ending them'
);

reset role;

select is(
  (
    select count(*)
    from public.audit_events
    where action = 'organization.domain_join_policy_changed'
      and details ->> 'policy' = 'auto'
  ),
  1::bigint,
  'a join policy change is on the record'
);

set local role anon;

select throws_ok(
  $$ select public.add_organization_domain(1, 'example.com') $$,
  '42501',
  'permission denied for function add_organization_domain',
  'a signed-out visitor cannot register an organization domain'
);



-- The membership decision, now that it lives in one function and keys on what
-- the account proved rather than on the text after the `@`.

reset role;

insert into public.organizations (slug, name, status)
values ('joinlab', 'Join Lab', 'active');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select lives_ok(
  $$
    select public.add_organization_domain(
      (select id from public.organizations where slug = 'joinlab'),
      'joinlab.no'
    )
  $$,
  'a portal administrator registers a domain for a member organization'
);

reset role;

insert into public.people (full_name, portal_access_status, source)
values ('Join Applicant', 'unclaimed', 'manual');

insert into public.person_emails (
  person_id, email, email_type, is_primary, source
)
select person.id, 'applicant@joinlab.no', 'organization', true, 'manual'
from public.people as person
where person.full_name = 'Join Applicant';

insert into auth.users (
  id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  is_sso_user, is_anonymous
)
values (
  '77777777-7777-4777-8777-777777777773',
  'authenticated',
  'authenticated',
  'applicant@joinlab.no',
  now(),
  '{"provider":"google","providers":["google"]}'::jsonb,
  '{"full_name":"Join Applicant","custom_claims":{"hd":"joinlab.no"}}'::jsonb,
  now(),
  now(),
  false,
  false
);

-- An organization whose Workspace directory the portal cannot read starts by
-- asking. Proving the domain gets the person recognised, not admitted.
select is(
  (
    select count(*)
    from public.memberships as membership
    join public.people as person on person.id = membership.person_id
    where person.full_name = 'Join Applicant'
  ),
  0::bigint,
  'a proven domain grants nothing while the organization asks for approval'
);

-- The trigger on auth.users does not fire on an ordinary repeat sign-in, so a
-- policy nobody can act on until each person is renamed in the Admin console
-- is a policy that does nothing. The sign-in callback asks on every sign-in.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select lives_ok(
  $$
    select public.set_organization_domain_join_policy(
      (select id from public.organizations where slug = 'joinlab'),
      'auto'
    )
  $$,
  'the organization switches to joining automatically'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"77777777-7777-4777-8777-777777777773","role":"authenticated"}',
  true
);

select is(
  (select public.apply_own_domain_join() ->> 'outcome'),
  'joined',
  'a policy change reaches people already signed up, on their next sign-in'
);

select is(
  (
    select membership.provisioning_method
    from public.memberships as membership
    join public.people as person on person.id = membership.person_id
    where person.full_name = 'Join Applicant'
  ),
  'domain',
  'the membership records that a domain provisioned it'
);

-- A consumer Google account can carry a work address for years after the
-- Workspace account behind it is gone. Without the claim it proves nothing,
-- and the automatic policy is not for it.
reset role;

insert into public.people (full_name, portal_access_status, source)
values ('Unproven Applicant', 'unclaimed', 'manual');

insert into public.person_emails (
  person_id, email, email_type, is_primary, source
)
select person.id, 'unproven@joinlab.no', 'organization', true, 'manual'
from public.people as person
where person.full_name = 'Unproven Applicant';

insert into auth.users (
  id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  is_sso_user, is_anonymous
)
values (
  '77777777-7777-4777-8777-777777777774',
  'authenticated',
  'authenticated',
  'unproven@joinlab.no',
  now(),
  '{"provider":"google","providers":["google"]}'::jsonb,
  '{"full_name":"Unproven Applicant"}'::jsonb,
  now(),
  now(),
  false,
  false
);

select is(
  (
    select count(*)
    from public.memberships as membership
    join public.person_emails as address on address.person_id = membership.person_id
    where address.email = 'unproven@joinlab.no'
  ),
  0::bigint,
  'an address on the domain is not enough without the claim that proves it'
);

-- The imported profile carries the history. Handing it to whoever presents the
-- address is how a conflicting account inherits somebody else's membership.
select isnt(
  (
    select account.person_id
    from public.portal_accounts as account
    where account.auth_user_id = '77777777-7777-4777-8777-777777777774'
  ),
  (
    select address.person_id
    from public.person_emails as address
    where address.email = 'unproven@joinlab.no'
  ),
  'an unproven account does not claim the imported profile holding the address'
);

select is(
  (
    select count(*)
    from public.audit_events
    where action = 'auth.address_claim_unproven'
      and details ->> 'email' = 'unproven@joinlab.no'
  ),
  1::bigint,
  'the refused claim is on the record for somebody to look at'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"77777777-7777-4777-8777-777777777774","role":"authenticated"}',
  true
);

-- A new profile on an organization address is asked first whether it is a new
-- person at all, so the join decision waits for the answer.
select is(
  (select public.apply_own_domain_join() ->> 'outcome'),
  'onboarding',
  'an unproven account is sent through onboarding rather than into the organization'
);

-- The rule a directory would enforce by not listing them. An ended member
-- whose Workspace account outlived the decision does not walk back in.
reset role;

update public.memberships
set status = 'ended',
    ended_at = now()
where person_id = (
  select id from public.people where full_name = 'Join Applicant'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"77777777-7777-4777-8777-777777777773","role":"authenticated"}',
  true
);

select is(
  (select public.apply_own_domain_join() ->> 'outcome'),
  'request',
  'an ended membership outranks the automatic policy'
);

select is(
  (select public.apply_own_domain_join() ->> 'returning'),
  'true',
  'and the answer says they are coming back rather than arriving'
);

reset role;

select is(
  (
    select membership.status
    from public.memberships as membership
    join public.people as person on person.id = membership.person_id
    where person.full_name = 'Join Applicant'
  ),
  'ended',
  'the ended membership is left as it is rather than quietly reactivated'
);

-- Linking used to run its own copy of the domain rule, so every guard on the
-- sign-in path was a door standing open here. Same function, same answer.
insert into auth.users (
  id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  is_sso_user, is_anonymous
)
values
  (
    '77777777-7777-4777-8777-777777777775',
    'authenticated',
    'authenticated',
    'returning.private@example.com',
    now(),
    '{"provider":"google","providers":["google"]}'::jsonb,
    '{"full_name":"Returning Linker"}'::jsonb,
    now(),
    now(),
    false,
    false
  ),
  (
    '77777777-7777-4777-8777-777777777776',
    'authenticated',
    'authenticated',
    'returning.linker@joinlab.no',
    now(),
    '{"provider":"google","providers":["google"]}'::jsonb,
    '{"full_name":"Returning Linker","custom_claims":{"hd":"joinlab.no"}}'::jsonb,
    now(),
    now(),
    false,
    false
  );

insert into public.memberships (
  person_id, organization_id, role, status, provisioning_method, ended_at
)
select
  account.person_id,
  organization.id,
  'member',
  'ended',
  'domain',
  now()
from public.portal_accounts as account
cross join public.organizations as organization
where account.auth_user_id = '77777777-7777-4777-8777-777777777775'
  and organization.slug = 'joinlab';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"77777777-7777-4777-8777-777777777775","role":"authenticated"}',
  true
);

select lives_ok(
  $$ select public.start_portal_account_link(repeat('b', 64), 'add_account') $$,
  'the returning member starts linking the organization account'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"77777777-7777-4777-8777-777777777776","role":"authenticated"}',
  true
);

select is(
  (
    select public.complete_portal_account_link(repeat('b', 64)) -> 'join' ->> 'outcome'
  ),
  'request',
  'linking the organization account does not hand back the membership either'
);

reset role;

select is(
  (
    select membership.status
    from public.memberships as membership
    join public.portal_accounts as account
      on account.person_id = membership.person_id
    where account.auth_user_id = '77777777-7777-4777-8777-777777777775'
  ),
  'ended',
  'the bypass through linking is closed'
);



-- One account per organization domain, plus one that is not on any of them.
-- The old limit was the number two, which refused the ordinary case as soon as
-- a second member organization existed.

reset role;

select throws_ok(
  $$
    select private.assert_account_capacity(
      (
        select account.person_id
        from public.portal_accounts as account
        where account.auth_user_id = '77777777-7777-4777-8777-777777777773'
      ),
      'second@joinlab.no',
      'joinlab.no'
    )
  $$,
  'P0001',
  'too_many_portal_accounts',
  'a second account on the same organization domain is refused'
);

select lives_ok(
  $$
    select private.assert_account_capacity(
      (
        select account.person_id
        from public.portal_accounts as account
        where account.auth_user_id = '77777777-7777-4777-8777-777777777773'
      ),
      'second@example.com',
      null
    )
  $$,
  'a private account alongside the organization account is allowed'
);

select throws_ok(
  $$
    select private.assert_merged_account_capacity(
      (
        select account.person_id
        from public.portal_accounts as account
        where account.auth_user_id = '77777777-7777-4777-8777-777777777773'
      ),
      (
        select account.person_id
        from public.portal_accounts as account
        where account.auth_user_id = '77777777-7777-4777-8777-777777777775'
      )
    )
  $$,
  'P0001',
  'too_many_portal_accounts',
  'two profiles holding an account on the same domain cannot merge until one is unlinked'
);

select lives_ok(
  $$
    select private.assert_merged_account_capacity(
      (
        select account.person_id
        from public.portal_accounts as account
        where account.auth_user_id = '77777777-7777-4777-8777-777777777773'
      ),
      (select id from public.people where full_name = 'Ignite Import')
    )
  $$,
  'a duplicate holding no sign-in account merges regardless of domain'
);

-- The portal administrator requirement had a door beside it: take the address
-- rather than the account, and the role survives with nothing behind it.
insert into public.people (full_name, portal_access_status, source)
values ('Administrator Without Account', 'active', 'manual');

insert into public.person_emails (
  person_id, email, email_type, is_primary, source
)
select person.id, 'admin.only@norstec.no', 'organization', true, 'manual'
from public.people as person
where person.full_name = 'Administrator Without Account';

insert into public.person_emails (
  person_id, email, email_type, is_primary, source
)
select person.id, 'admin.private@example.com', 'personal', false, 'manual'
from public.people as person
where person.full_name = 'Administrator Without Account';

insert into public.portal_administrators (person_id)
select id from public.people where full_name = 'Administrator Without Account';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select throws_ok(
  $$
    select public.remove_person_email(
      (
        select id
        from public.people
        where full_name = 'Administrator Without Account'
      ),
      'admin.only@norstec.no'
    )
  $$,
  'P0001',
  'portal_admin_requires_norstec_account',
  'the last Norstec identity of a portal administrator cannot be removed as an address either'
);

select lives_ok(
  $$
    select public.remove_person_email(
      (
        select id
        from public.people
        where full_name = 'Administrator Without Account'
      ),
      'admin.private@example.com'
    )
  $$,
  'any other address of theirs is ordinary'
);


reset role;
select * from finish();
rollback;
