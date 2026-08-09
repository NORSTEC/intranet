begin;

-- The Auth hook protects new-user decisions. Current Supabase Auth skips the
-- hook after it has chosen automatic account linking, so the identity trigger
-- below is the final guard for recycled Workspace addresses.
create or replace function private.before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
set statement_timeout = '2s'
as $$
declare
  incoming_email text;
  incoming_provider_id text;
  provider_name text;
begin
  provider_name := event -> 'user' -> 'app_metadata' ->> 'provider';

  if provider_name is distinct from 'google' then
    return '{}'::jsonb;
  end if;

  incoming_email := nullif(lower(btrim(event -> 'user' ->> 'email')), '');
  incoming_provider_id := coalesce(
    nullif(btrim(event -> 'user' -> 'user_metadata' ->> 'provider_id'), ''),
    nullif(btrim(event -> 'user' -> 'user_metadata' ->> 'sub'), '')
  );

  if incoming_email is null or incoming_provider_id is null then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Google did not provide a stable account identifier.'
      )
    );
  end if;

  if exists (
    select 1
    from public.portal_accounts as account
    where account.account_email = incoming_email
      and coalesce(
        account.provider_id,
        (
          select identity.provider_id
          from auth.identities as identity
          where identity.user_id = account.auth_user_id
            and identity.provider = 'google'
          order by identity.last_sign_in_at desc nulls last,
                   identity.created_at desc
          limit 1
        )
      ) is not null
      and coalesce(
        account.provider_id,
        (
          select identity.provider_id
          from auth.identities as identity
          where identity.user_id = account.auth_user_id
            and identity.provider = 'google'
          order by identity.last_sign_in_at desc nulls last,
                   identity.created_at desc
          limit 1
        )
      ) is distinct from incoming_provider_id
  ) then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'This email address is already tied to a different Google account. Contact portal@norstec.no.'
      )
    );
  end if;

  return '{}'::jsonb;
end;
$$;

revoke all on function private.before_user_created(jsonb)
  from public, anon, authenticated;
grant usage on schema private to supabase_auth_admin;
grant execute on function private.before_user_created(jsonb)
  to supabase_auth_admin;

drop policy if exists portal_accounts_auth_hook_read on public.portal_accounts;
create policy portal_accounts_auth_hook_read
on public.portal_accounts
for select
to supabase_auth_admin
using (true);

grant select (account_email, auth_user_id, provider_id)
  on public.portal_accounts to supabase_auth_admin;

-- This portal represents additional Google logins as separate auth.users rows
-- connected to one person. A second Google identity on the same Auth user is
-- therefore never legitimate and is the exact shape produced by Supabase's
-- automatic email linking when a Workspace address is reassigned.
--
-- Supabase owns auth.identities, so portal migrations must not add indexes or
-- constraints to it. This private mirror owns the invariant instead. Its
-- primary key serializes concurrent claims for one Auth user, while the
-- foreign key removes the binding only when that Auth user is deleted.
create table private.google_identity_bindings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  provider_id text not null,
  constraint google_identity_bindings_provider_id_not_blank
    check (nullif(btrim(provider_id), '') is not null)
);

revoke all on table private.google_identity_bindings
  from public, anon, authenticated, service_role;

do $$
begin
  if exists (
    select 1
    from auth.identities as identity
    where identity.provider = 'google'
      and nullif(btrim(identity.provider_id), '') is null
  ) then
    raise exception using errcode = 'P0001', message = 'google_subject_missing';
  end if;

  if exists (
    select identity.user_id
    from auth.identities as identity
    where identity.provider = 'google'
    group by identity.user_id
    having count(distinct identity.provider_id) > 1
  ) then
    raise exception using errcode = 'P0001',
      message = 'unsafe_google_identity_link';
  end if;
end;
$$;

insert into private.google_identity_bindings (user_id, provider_id)
select identity.user_id, min(identity.provider_id)
from auth.identities as identity
where identity.provider = 'google'
group by identity.user_id;

create or replace function private.guard_google_identity_subject()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  accepted_provider_id text;
begin
  if new.provider is distinct from 'google' then
    return new;
  end if;

  if nullif(btrim(new.provider_id), '') is null then
    raise exception using errcode = 'P0001',
      message = 'google_subject_missing';
  end if;

  insert into private.google_identity_bindings as binding (
    user_id,
    provider_id
  ) values (
    new.user_id,
    new.provider_id
  )
  on conflict (user_id) do update
  set provider_id = binding.provider_id
  where binding.provider_id = excluded.provider_id
  returning binding.provider_id into accepted_provider_id;

  if accepted_provider_id is null or exists (
    select 1
    from auth.identities as existing_identity
    where existing_identity.user_id = new.user_id
      and existing_identity.provider = 'google'
      and existing_identity.id is distinct from new.id
      and existing_identity.provider_id is distinct from new.provider_id
  ) or exists (
    select 1
    from public.portal_accounts as account
    where account.auth_user_id = new.user_id
      and account.provider_id is not null
      and account.provider_id is distinct from new.provider_id
  ) then
    raise exception using errcode = 'P0001',
      message = 'unsafe_google_identity_link';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_google_identity_subject()
  from public, anon, authenticated;

drop trigger if exists guard_google_identity_subject on auth.identities;
create trigger guard_google_identity_subject
before insert or update of provider, provider_id, user_id
on auth.identities
for each row execute function private.guard_google_identity_subject();

-- raw_user_meta_data is editable by the user. It is trustworthy during the
-- initial OAuth insert because Auth writes it from Google's signed response,
-- but never on a later app-metadata update. Replace authorization-relevant
-- values with auth.identities before the existing provisioning trigger reads
-- them.
create or replace function private.sanitize_google_user_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  trusted_provider_id text;
  trusted_hosted_domain text;
  custom_claims jsonb;
begin
  if not (
    coalesce(new.raw_app_meta_data ->> 'provider', '') = 'google'
    or coalesce(new.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'google'
  ) then
    return new;
  end if;

  select
    nullif(btrim(identity.provider_id), ''),
    nullif(lower(btrim(coalesce(
      identity.identity_data -> 'custom_claims' ->> 'hd',
      identity.identity_data ->> 'hd'
    ))), '')
  into trusted_provider_id, trusted_hosted_domain
  from auth.identities as identity
  where identity.user_id = new.id
    and identity.provider = 'google'
  order by identity.last_sign_in_at desc nulls last,
           identity.created_at desc
  limit 1;

  new.raw_user_meta_data := coalesce(new.raw_user_meta_data, '{}'::jsonb)
    - 'provider_id' - 'sub';

  if trusted_provider_id is not null then
    new.raw_user_meta_data := jsonb_set(
      jsonb_set(
        new.raw_user_meta_data,
        '{provider_id}',
        to_jsonb(trusted_provider_id),
        true
      ),
      '{sub}',
      to_jsonb(trusted_provider_id),
      true
    );
  end if;

  custom_claims := coalesce(
    new.raw_user_meta_data -> 'custom_claims',
    '{}'::jsonb
  ) - 'hd';

  if trusted_hosted_domain is not null then
    custom_claims := jsonb_set(
      custom_claims,
      '{hd}',
      to_jsonb(trusted_hosted_domain),
      true
    );
  end if;

  new.raw_user_meta_data := jsonb_set(
    new.raw_user_meta_data,
    '{custom_claims}',
    custom_claims,
    true
  );

  return new;
end;
$$;

revoke all on function private.sanitize_google_user_metadata()
  from public, anon, authenticated;

drop trigger if exists sanitize_google_user_metadata on auth.users;
create trigger sanitize_google_user_metadata
before update of raw_user_meta_data, raw_app_meta_data on auth.users
for each row execute function private.sanitize_google_user_metadata();

-- Keep the portal copy aligned with Google's immutable subject and hosted
-- domain as soon as the identity row exists. This also repairs first sign-ins,
-- where auth.users is inserted before auth.identities.
create or replace function private.sync_portal_google_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  trusted_hosted_domain text;
begin
  if new.provider is distinct from 'google' then
    return new;
  end if;

  trusted_hosted_domain := nullif(lower(btrim(coalesce(
    new.identity_data -> 'custom_claims' ->> 'hd',
    new.identity_data ->> 'hd'
  ))), '');

  update public.portal_accounts
  set provider_id = nullif(btrim(new.provider_id), ''),
      -- The latest provider identity is authoritative. Retaining an earlier
      -- domain here could let an account that left Workspace prove a domain
      -- it no longer belongs to.
      hosted_domain = trusted_hosted_domain,
      last_seen_at = now()
  where auth_user_id = new.user_id;

  update public.person_emails as address
  set provider_id = nullif(btrim(new.provider_id), ''),
      updated_at = now()
  from public.portal_accounts as account
  where account.auth_user_id = new.user_id
    and address.person_id = account.person_id
    and address.email = account.account_email
    and address.provider_id is distinct from nullif(btrim(new.provider_id), '');

  return new;
end;
$$;

revoke all on function private.sync_portal_google_identity()
  from public, anon, authenticated;

drop trigger if exists sync_portal_google_identity on auth.identities;
create trigger sync_portal_google_identity
after insert or update of provider_id, identity_data, last_sign_in_at
on auth.identities
for each row execute function private.sync_portal_google_identity();

with latest_google_identity as (
  select distinct on (identity.user_id)
    identity.user_id,
    identity.provider_id,
    nullif(lower(btrim(coalesce(
      identity.identity_data -> 'custom_claims' ->> 'hd',
      identity.identity_data ->> 'hd'
    ))), '') as hosted_domain
  from auth.identities as identity
  where identity.provider = 'google'
  order by identity.user_id,
           identity.last_sign_in_at desc nulls last,
           identity.created_at desc
)
update public.portal_accounts as account
set provider_id = identity.provider_id,
    hosted_domain = identity.hosted_domain
from latest_google_identity as identity
where identity.user_id = account.auth_user_id;

update public.person_emails as address
set provider_id = account.provider_id,
    updated_at = now()
from public.portal_accounts as account
where account.person_id = address.person_id
  and account.account_email = address.email
  and account.provider_id is not null
  and address.provider_id is distinct from account.provider_id;

create or replace function private.admin_mfa_satisfied()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2';
$$;

revoke all on function private.admin_mfa_satisfied()
  from public, anon, authenticated;

create or replace function private.is_portal_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select private.admin_mfa_satisfied())
    and exists (
      select 1
      from public.portal_administrators as administrator
      join public.people as person on person.id = administrator.person_id
      where administrator.person_id = (select private.current_person_id())
        and person.portal_access_status = 'active'
        and person.deleted_at is null
    );
$$;

create or replace function private.is_organization_admin(
  target_organization_id bigint
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select private.is_portal_admin())
    or (
      (select private.admin_mfa_satisfied())
      and exists (
        select 1
        from public.memberships as membership
        join public.people as person on person.id = membership.person_id
        where membership.person_id = (select private.current_person_id())
          and membership.organization_id = target_organization_id
          and membership.status = 'active'
          and membership.role = 'organization_admin'
          and person.portal_access_status = 'active'
          and person.deleted_at is null
      )
    );
$$;

revoke all on function private.is_portal_admin() from public, anon;
grant execute on function private.is_portal_admin() to authenticated;
revoke all on function private.is_organization_admin(bigint) from public, anon;
grant execute on function private.is_organization_admin(bigint) to authenticated;

commit;
