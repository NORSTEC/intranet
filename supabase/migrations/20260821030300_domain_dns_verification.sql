begin;

alter table private.organization_domains
  add column verification_method text not null
    default 'legacy_admin_attestation';

alter table private.organization_domains
  add constraint organization_domains_verification_method_check
  check (verification_method in ('legacy_admin_attestation', 'dns_txt'));

comment on column private.organization_domains.verified_at is
  'Time ownership was proven through the method in verification_method. Null means the domain cannot grant membership.';

-- The earlier placeholder stored no usable proof and is replaced by a
-- short-lived, hashed verification claim.
alter table private.organization_domains
  drop column if exists verification_token;

create table private.organization_domain_verification_claims (
  domain text primary key,
  organization_id bigint not null
    references public.organizations (id) on delete cascade,
  token_hash text not null,
  initiated_by_person_id bigint not null
    references public.people (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  constraint organization_domain_claims_domain_lowercase_check
    check (domain = lower(domain)),
  constraint organization_domain_claims_domain_format_check
    check (domain ~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$'),
  constraint organization_domain_claims_token_hash_check
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint organization_domain_claims_expiry_check
    check (expires_at > created_at)
);

revoke all on private.organization_domain_verification_claims
  from public, anon, authenticated;
alter table private.organization_domain_verification_claims
  enable row level security;

create index organization_domain_claims_organization_idx
  on private.organization_domain_verification_claims (organization_id);
create index organization_domain_claims_initiator_idx
  on private.organization_domain_verification_claims (
    initiated_by_person_id
  );
create index organization_domain_claims_expiry_idx
  on private.organization_domain_verification_claims (expires_at);

-- No pre-existing domain has DNS proof. Existing memberships are retained,
-- but the domain cannot grant new ones until an administrator verifies it.
update private.organization_domains
set verified_at = null,
    verification_method = 'legacy_admin_attestation';

create or replace function public.start_organization_domain_verification(
  p_organization_id bigint,
  p_domain text,
  p_token_hash text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  actor_person_id bigint := (select private.current_person_id());
  target_domain text := nullif(btrim(lower(coalesce(p_domain, ''))), '');
  existing_organization_id bigint;
  existing_verified_at timestamptz;
  address_count integer;
begin
  if actor_person_id is null or not (select private.is_portal_admin()) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if target_domain is null
    or target_domain !~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$'
    or p_token_hash is null
    or p_token_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = 'P0001', message = 'invalid_domain';
  end if;

  if exists (
    select 1 from private.reserved_email_domains as reserved
    where reserved.domain = target_domain
  ) then
    raise exception using errcode = 'P0001', message = 'reserved_domain';
  end if;

  if not exists (
    select 1 from public.organizations as organization
    where organization.id = p_organization_id
      and organization.status = 'active'
  ) then
    raise exception using errcode = 'P0001',
      message = 'organization_not_found';
  end if;

  select domain.organization_id, domain.verified_at
  into existing_organization_id, existing_verified_at
  from private.organization_domains as domain
  where domain.domain = target_domain
  for update;

  if existing_organization_id is not null
    and existing_organization_id <> p_organization_id
  then
    raise exception using errcode = 'P0001',
      message = 'domain_registered_elsewhere';
  end if;

  if existing_verified_at is not null then
    raise exception using errcode = 'P0001',
      message = 'domain_already_verified';
  end if;

  delete from private.organization_domain_verification_claims
  where expires_at <= now();

  insert into private.organization_domain_verification_claims (
    domain,
    organization_id,
    token_hash,
    initiated_by_person_id
  ) values (
    target_domain,
    p_organization_id,
    p_token_hash,
    actor_person_id
  )
  on conflict (domain) do update
  set organization_id = excluded.organization_id,
      token_hash = excluded.token_hash,
      initiated_by_person_id = excluded.initiated_by_person_id,
      created_at = now(),
      expires_at = now() + interval '24 hours';

  select count(*) into address_count
  from public.person_emails as address
  where split_part(address.email, '@', 2) = target_domain;

  insert into public.audit_events (
    actor_person_id, action, organization_id, details
  ) values (
    actor_person_id,
    'organization_domain.verification_started',
    p_organization_id,
    jsonb_build_object(
      'domain', target_domain,
      'address_count', address_count
    )
  );

  return jsonb_build_object(
    'domain', target_domain,
    'addressCount', address_count,
    'expiresAt', now() + interval '24 hours'
  );
end;
$$;

revoke all on function public.start_organization_domain_verification(
  bigint, text, text
) from public, anon;
grant execute on function public.start_organization_domain_verification(
  bigint, text, text
) to authenticated;

create or replace function public.complete_organization_domain_verification(
  p_organization_id bigint,
  p_domain text,
  p_token_hash text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  actor_person_id bigint := (select private.current_person_id());
  target_domain text := nullif(btrim(lower(coalesce(p_domain, ''))), '');
  claim record;
  existing_organization_id bigint;
  address_count integer;
  reclassified_address_count integer;
begin
  if actor_person_id is null or not (select private.is_portal_admin()) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  select verification_claim.* into claim
  from private.organization_domain_verification_claims as verification_claim
  where verification_claim.domain = target_domain
    and verification_claim.organization_id = p_organization_id
    and verification_claim.token_hash = p_token_hash
    and verification_claim.expires_at > now()
  for update;

  if claim.domain is null then
    raise exception using errcode = 'P0001',
      message = 'domain_verification_expired';
  end if;

  select domain.organization_id into existing_organization_id
  from private.organization_domains as domain
  where domain.domain = target_domain
  for update;

  if existing_organization_id is not null
    and existing_organization_id <> p_organization_id
  then
    raise exception using errcode = 'P0001',
      message = 'domain_registered_elsewhere';
  end if;

  insert into private.organization_domains (
    domain,
    organization_id,
    verified_at,
    verification_method,
    added_by_person_id
  ) values (
    target_domain,
    p_organization_id,
    now(),
    'dns_txt',
    actor_person_id
  )
  on conflict (domain) do update
  set verified_at = now(),
      verification_method = 'dns_txt',
      added_by_person_id = excluded.added_by_person_id;

  update public.person_emails
  set email_type = 'organization',
      updated_at = now()
  where split_part(email, '@', 2) = target_domain
    and email_type <> 'organization';

  get diagnostics reclassified_address_count = row_count;

  select count(*) into address_count
  from public.person_emails as address
  where split_part(address.email, '@', 2) = target_domain;

  delete from private.organization_domain_verification_claims
  where domain = target_domain;

  insert into public.audit_events (
    actor_person_id, action, organization_id, details
  ) values (
    actor_person_id,
    'organization_domain.verified',
    p_organization_id,
    jsonb_build_object(
      'domain', target_domain,
      'verification_method', 'dns_txt',
      'reclassified_address_count', reclassified_address_count
    )
  );

  return jsonb_build_object(
    'domain', target_domain,
    'verifiedAt', now(),
    'addressCount', address_count
  );
end;
$$;

revoke all on function public.complete_organization_domain_verification(
  bigint, text, text
) from public, anon;
grant execute on function public.complete_organization_domain_verification(
  bigint, text, text
) to authenticated;

-- Retire the function that treated an administrator click as domain proof.
revoke execute on function public.add_organization_domain(bigint, text)
  from authenticated;

create or replace function public.list_organization_domains(
  p_organization_id bigint
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
begin
  if (select private.current_person_id()) is null
    or not (select private.is_portal_admin())
  then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'domain', domain.domain,
          'verifiedAt', domain.verified_at,
          'verificationMethod', domain.verification_method,
          'createdAt', domain.created_at
        )
        order by domain.domain
      )
      from private.organization_domains as domain
      where domain.organization_id = p_organization_id
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.list_organization_domains(bigint)
  from public, anon;
grant execute on function public.list_organization_domains(bigint)
  to authenticated;

-- A hosted-domain claim can grant membership only after the portal has DNS
-- proof that the organization controls the registered domain.
alter function private.apply_domain_join(bigint, text)
  rename to apply_domain_join_without_dns_guard;

revoke all on function private.apply_domain_join_without_dns_guard(
  bigint, text
) from public, anon, authenticated;

create or replace function private.apply_domain_join(
  p_person_id bigint,
  p_hosted_domain text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  proven_domain text := nullif(
    lower(btrim(coalesce(p_hosted_domain, ''))),
    ''
  );
begin
  if proven_domain is null then
    return jsonb_build_object('outcome', 'unproven');
  end if;

  if not exists (
    select 1
    from private.organization_domains as domain
    where domain.domain = proven_domain
      and domain.verified_at is not null
      and domain.verification_method = 'dns_txt'
  ) then
    return jsonb_build_object('outcome', 'domain_not_verified');
  end if;

  return private.apply_domain_join_without_dns_guard(
    p_person_id,
    proven_domain
  );
end;
$$;

revoke all on function private.apply_domain_join(bigint, text)
  from public, anon, authenticated;

commit;
