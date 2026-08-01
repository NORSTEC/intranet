begin;

create extension if not exists pgtap with schema extensions;

select plan(21);

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
  );

select ok(
  exists (
    select 1 from public.profiles
    where user_id = '11111111-1111-4111-8111-111111111111'
  ),
  'a verified Norstec Google user receives a profile'
);

select ok(
  exists (
    select 1 from public.memberships
    where user_id = '11111111-1111-4111-8111-111111111111'
      and status = 'active'
  ),
  'a verified Norstec Google user receives active membership'
);

select is(
  (
    select role from public.memberships
    where user_id = '11111111-1111-4111-8111-111111111111'
  ),
  'member',
  'domain provisioning grants only the member role'
);

select ok(
  exists (
    select 1 from public.profiles
    where user_id = '22222222-2222-4222-8222-222222222222'
  ),
  'a verified personal Google user receives a profile'
);

select is(
  (
    select count(*) from public.memberships
    where user_id = '22222222-2222-4222-8222-222222222222'
  ),
  0::bigint,
  'a personal Google user receives no automatic membership'
);

select is(
  (
    select count(*) from public.profiles
    where user_id = '33333333-3333-4333-8333-333333333333'
  ),
  0::bigint,
  'a non-Google user is not provisioned'
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
    select count(*) from public.access_requests
    where user_id = '22222222-2222-4222-8222-222222222222'
      and status = 'pending'
  ),
  1::bigint,
  'a submitted request is visible to its owner'
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
    select count(*) from public.profiles
    where user_id = '11111111-1111-4111-8111-111111111111'
  ),
  1::bigint,
  'a member can read their own profile'
);

select is(
  (
    select count(*) from public.profiles
    where user_id = '22222222-2222-4222-8222-222222222222'
  ),
  0::bigint,
  'a member cannot read another profile'
);

select is(
  (
    select count(*) from public.access_requests
    where user_id = '22222222-2222-4222-8222-222222222222'
  ),
  0::bigint,
  'a member cannot read another user access request'
);

reset role;

select is(
  private.assign_norstec_admin('member@norstec.no'),
  '11111111-1111-4111-8111-111111111111'::uuid,
  'the controlled bootstrap function returns the promoted user'
);

select is(
  (
    select role from public.memberships
    where user_id = '11111111-1111-4111-8111-111111111111'
  ),
  'norstec_admin',
  'the bootstrap function grants the Norstec admin role'
);

select is(
  (
    select count(*) from public.audit_events
    where target_user_id = '11111111-1111-4111-8111-111111111111'
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
    select count(*) from public.profiles
    where user_id = '22222222-2222-4222-8222-222222222222'
  ),
  1::bigint,
  'a Norstec admin can read a user profile'
);

select is(
  (
    select count(*) from public.access_requests
    where user_id = '22222222-2222-4222-8222-222222222222'
  ),
  1::bigint,
  'a Norstec admin can read pending access requests'
);

select is(
  (
    select count(*) from public.audit_events
    where action = 'membership.role_assigned'
  ),
  1::bigint,
  'a Norstec admin can read audit events'
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
        'profiles',
        'memberships',
        'access_requests',
        'audit_events'
      )
      and pg_class.relrowsecurity
  ),
  5::bigint,
  'RLS is enabled on every public portal table'
);

select is(
  has_table_privilege('anon', 'public.profiles', 'select'),
  false,
  'anonymous users have no profile table privileges'
);

select is(
  has_column_privilege('authenticated', 'public.profiles', 'email', 'update'),
  false,
  'authenticated users cannot change their authoritative email'
);

select * from finish();
rollback;
