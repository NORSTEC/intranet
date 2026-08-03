begin;

-- A portal profile may use its primary Google identity and at most one
-- alternative Google identity. The callback removes an accidentally linked
-- third identity; this check prevents any direct RPC caller from copying it
-- into the portal model first.
create or replace function public.sync_linked_google_identities()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  actor_auth_user_id uuid;
  actor_person_id bigint;
  google_identity_count integer;
  identity_row record;
  existing_person_id bigint;
  matched_organization_id bigint;
  email_was_known boolean;
  inserted_memberships integer;
  linked_email_count integer := 0;
  created_membership_count integer := 0;
begin
  actor_auth_user_id := (select auth.uid());

  if actor_auth_user_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;

  select count(distinct lower(identity.email))
  into google_identity_count
  from auth.identities as identity
  where identity.user_id = actor_auth_user_id
    and identity.provider = 'google'
    and identity.email is not null;

  if google_identity_count > 2 then
    raise exception using
      errcode = 'P0001',
      message = 'too_many_linked_google_identities';
  end if;

  select account.person_id
  into actor_person_id
  from public.portal_accounts as account
  join public.people as person on person.id = account.person_id
  where account.auth_user_id = actor_auth_user_id
    and person.portal_access_status = 'active';

  if actor_person_id is null then
    raise exception using errcode = '42501', message = 'portal_access_required';
  end if;

  for identity_row in
    select distinct lower(identity.email) as email
    from auth.identities as identity
    where identity.user_id = actor_auth_user_id
      and identity.provider = 'google'
      and identity.email is not null
    order by lower(identity.email)
  loop
    select person_email.person_id
    into existing_person_id
    from public.person_emails as person_email
    where person_email.email = identity_row.email;

    if existing_person_id is not null and existing_person_id <> actor_person_id then
      raise exception using
        errcode = 'P0001',
        message = 'identity_email_belongs_to_another_profile';
    end if;

    email_was_known := existing_person_id is not null;

    select domain.organization_id
    into matched_organization_id
    from private.organization_domains as domain
    join public.organizations as organization
      on organization.id = domain.organization_id
    where domain.domain = split_part(identity_row.email, '@', 2)
      and organization.status = 'active';

    insert into public.person_emails (
      person_id,
      email,
      email_type,
      is_primary,
      source
    ) values (
      actor_person_id,
      identity_row.email,
      case when matched_organization_id is not null then 'organization' else 'personal' end,
      false,
      'google'
    )
    on conflict (email) do update
    set email_type = case
          when excluded.email_type = 'organization' then 'organization'
          else public.person_emails.email_type
        end,
        updated_at = now()
    where public.person_emails.person_id = actor_person_id;

    if not email_was_known then
      linked_email_count := linked_email_count + 1;

      insert into public.audit_events (
        actor_person_id,
        action,
        target_person_id,
        organization_id,
        details
      ) values (
        actor_person_id,
        'auth.identity_linked',
        actor_person_id,
        matched_organization_id,
        jsonb_build_object(
          'email', identity_row.email,
          'email_type', case
            when matched_organization_id is not null then 'organization'
            else 'personal'
          end,
          'provider', 'google'
        )
      );
    end if;

    if matched_organization_id is not null then
      insert into public.memberships (
        person_id,
        organization_id,
        role,
        status,
        provisioning_method
      ) values (
        actor_person_id,
        matched_organization_id,
        'member',
        'active',
        'domain'
      )
      on conflict (person_id, organization_id) do nothing;

      get diagnostics inserted_memberships = row_count;
      created_membership_count := created_membership_count + inserted_memberships;
    end if;
  end loop;

  return jsonb_build_object(
    'linkedEmailCount', linked_email_count,
    'createdMembershipCount', created_membership_count
  );
end;
$$;

revoke all on function public.sync_linked_google_identities() from public, anon;
grant execute on function public.sync_linked_google_identities() to authenticated;

commit;
