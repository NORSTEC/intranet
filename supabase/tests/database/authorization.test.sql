begin;

create extension if not exists pgtap with schema extensions;

select plan(79);

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
  'the authoritative membership created one default profile experience'
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
  13::bigint,
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
