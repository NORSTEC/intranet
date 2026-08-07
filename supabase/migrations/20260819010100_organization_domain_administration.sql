begin;

-- `private.organization_domains` holds one row, written by a migration in
-- August. Adding orbitntnu.com therefore means shipping code, which is the
-- wrong shape for a table that is going to grow every time a member
-- organization gets its own Workspace.
--
-- Registering a domain is also the most destructive operation in this product.
-- Every address on a registered domain becomes an organization address: it
-- stops being the person's own to remove, and under an automatic join policy it
-- is a membership. One typo — gmail.com — converts every personal address in
-- the portal at once. So the operation gets two guards and a dry run, and the
-- dry run is the important one: a domain that captures two hundred addresses is
-- either exactly right or catastrophically wrong, and only the number tells
-- them apart.
alter table private.organization_domains
  add column if not exists verified_at timestamptz;

alter table private.organization_domains
  add column if not exists verification_token text;

alter table private.organization_domains
  add column if not exists added_by_person_id bigint
  references public.people (id) on delete set null;

-- Unused until a domain has to be registered on behalf of an organization
-- nobody here can vouch for in person. Slack, Notion and Vercel all require a
-- DNS TXT record before a domain grants anything; the columns exist now so
-- that day is a function change rather than a table rewrite. Domains added
-- today are trusted because a portal administrator vouched for them, and
-- `verified_at` records that as a fact rather than an assumption.
comment on column private.organization_domains.verified_at is
  'When ownership was proven. Null means trusted on a portal administrator''s word.';

-- Domains where the address says nothing about which organization somebody
-- belongs to. Mailbox providers are the obvious half. The university is the
-- half that would actually have been typed: everybody at NTNU holds an
-- ntnu.no address, so registering it would hand the portal to a university
-- rather than to a member organization.
create table if not exists private.reserved_email_domains (
  domain text primary key,
  reason text not null,
  constraint reserved_email_domains_lowercase_check
    check (domain = lower(domain))
);

insert into private.reserved_email_domains (domain, reason) values
  ('gmail.com', 'mailbox_provider'),
  ('googlemail.com', 'mailbox_provider'),
  ('outlook.com', 'mailbox_provider'),
  ('hotmail.com', 'mailbox_provider'),
  ('hotmail.no', 'mailbox_provider'),
  ('live.com', 'mailbox_provider'),
  ('live.no', 'mailbox_provider'),
  ('msn.com', 'mailbox_provider'),
  ('yahoo.com', 'mailbox_provider'),
  ('aol.com', 'mailbox_provider'),
  ('icloud.com', 'mailbox_provider'),
  ('me.com', 'mailbox_provider'),
  ('mac.com', 'mailbox_provider'),
  ('proton.me', 'mailbox_provider'),
  ('protonmail.com', 'mailbox_provider'),
  ('pm.me', 'mailbox_provider'),
  ('gmx.com', 'mailbox_provider'),
  ('mail.com', 'mailbox_provider'),
  ('zoho.com', 'mailbox_provider'),
  ('yandex.com', 'mailbox_provider'),
  ('fastmail.com', 'mailbox_provider'),
  ('hey.com', 'mailbox_provider'),
  ('online.no', 'mailbox_provider'),
  ('start.no', 'mailbox_provider'),
  ('ntnu.no', 'shared_institution'),
  ('student.ntnu.no', 'shared_institution'),
  ('uio.no', 'shared_institution'),
  ('student.uio.no', 'shared_institution')
on conflict (domain) do update set reason = excluded.reason;

alter table private.reserved_email_domains enable row level security;
revoke all on private.reserved_email_domains from public, anon, authenticated;

-- What a domain would capture if it were registered right now. Read-only, and
-- the only thing the confirmation step in the interface needs.
create or replace function public.preview_organization_domain(
  p_organization_id bigint,
  p_domain text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  target_domain text;
  reserved_reason text;
  existing_organization_id bigint;
  address_count integer;
  membership_count integer;
begin
  if (select private.current_person_id()) is null
    or not (select private.is_portal_admin())
  then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  target_domain := nullif(btrim(lower(coalesce(p_domain, ''))), '');

  if target_domain is null then
    raise exception using errcode = 'P0001', message = 'domain_required';
  end if;

  select reason
  into reserved_reason
  from private.reserved_email_domains
  where domain = target_domain;

  select organization_id
  into existing_organization_id
  from private.organization_domains
  where domain = target_domain;

  select count(*)
  into address_count
  from public.person_emails as address
  where split_part(address.email, '@', 2) = target_domain;

  -- People who hold an address on the domain and are not already members of
  -- the organization. Under an automatic join policy this is how many
  -- memberships the registration eventually produces, one per sign-in.
  select count(distinct address.person_id)
  into membership_count
  from public.person_emails as address
  where split_part(address.email, '@', 2) = target_domain
    and not exists (
      select 1
      from public.memberships as membership
      where membership.person_id = address.person_id
        and membership.organization_id = p_organization_id
        and membership.status = 'active'
    );

  return jsonb_build_object(
    'domain', target_domain,
    'reservedReason', reserved_reason,
    'registeredToOrganizationId', existing_organization_id,
    'addressCount', address_count,
    'wouldJoinCount', membership_count
  );
end;
$$;

revoke all on function public.preview_organization_domain(bigint, text)
  from public, anon;
grant execute on function public.preview_organization_domain(bigint, text)
  to authenticated;

create or replace function public.add_organization_domain(
  p_organization_id bigint,
  p_domain text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  actor_person_id bigint;
  target_domain text;
  reserved_reason text;
  existing_organization_id bigint;
  address_count integer;
begin
  actor_person_id := (select private.current_person_id());

  if actor_person_id is null or not (select private.is_portal_admin()) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  target_domain := nullif(btrim(lower(coalesce(p_domain, ''))), '');

  if target_domain is null
    or target_domain !~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$'
  then
    raise exception using errcode = 'P0001', message = 'invalid_domain';
  end if;

  select reason
  into reserved_reason
  from private.reserved_email_domains
  where domain = target_domain;

  if reserved_reason is not null then
    raise exception using errcode = 'P0001', message = 'reserved_domain';
  end if;

  if not exists (
    select 1
    from public.organizations
    where id = p_organization_id
      and status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'organization_not_found';
  end if;

  select organization_id
  into existing_organization_id
  from private.organization_domains
  where domain = target_domain
  for update;

  if existing_organization_id is not null then
    if existing_organization_id = p_organization_id then
      raise exception using errcode = 'P0001', message = 'domain_already_registered';
    end if;

    raise exception using errcode = 'P0001', message = 'domain_registered_elsewhere';
  end if;

  select count(*)
  into address_count
  from public.person_emails as address
  where split_part(address.email, '@', 2) = target_domain;

  insert into private.organization_domains (
    domain,
    organization_id,
    added_by_person_id,
    verified_at
  ) values (
    target_domain,
    p_organization_id,
    actor_person_id,
    now()
  );

  insert into public.audit_events (
    actor_person_id, action, organization_id, details
  ) values (
    actor_person_id,
    'organization_domain.added',
    p_organization_id,
    jsonb_build_object(
      'domain', target_domain,
      'address_count', address_count
    )
  );

  return jsonb_build_object(
    'domain', target_domain,
    'addressCount', address_count
  );
end;
$$;

revoke all on function public.add_organization_domain(bigint, text)
  from public, anon;
grant execute on function public.add_organization_domain(bigint, text)
  to authenticated;

-- Removing a domain does not touch the memberships it produced. Those are
-- somebody's actual standing in an organization, and a registration mistake is
-- not a reason to end them silently — an administrator ends the ones that
-- should not have existed. What the removal does change is that the addresses
-- become ordinary personal addresses again, which their owners may then remove
-- themselves.
create or replace function public.remove_organization_domain(p_domain text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  actor_person_id bigint;
  target_domain text;
  target_organization_id bigint;
  membership_count integer;
begin
  actor_person_id := (select private.current_person_id());

  if actor_person_id is null or not (select private.is_portal_admin()) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  target_domain := nullif(btrim(lower(coalesce(p_domain, ''))), '');

  select organization_id
  into target_organization_id
  from private.organization_domains
  where domain = target_domain
  for update;

  if target_organization_id is null then
    raise exception using errcode = 'P0001', message = 'domain_not_found';
  end if;

  select count(*)
  into membership_count
  from public.memberships as membership
  where membership.organization_id = target_organization_id
    and membership.status = 'active'
    and membership.provisioning_method = 'domain';

  delete from private.organization_domains
  where domain = target_domain;

  insert into public.audit_events (
    actor_person_id, action, organization_id, details
  ) values (
    actor_person_id,
    'organization_domain.removed',
    target_organization_id,
    jsonb_build_object(
      'domain', target_domain,
      'retained_membership_count', membership_count
    )
  );

  return jsonb_build_object(
    'domain', target_domain,
    'retainedMembershipCount', membership_count
  );
end;
$$;

revoke all on function public.remove_organization_domain(text)
  from public, anon;
grant execute on function public.remove_organization_domain(text)
  to authenticated;

-- The table is private, so listing is a function rather than a select. Portal
-- administrators only: which domains an organization answers to is the shape
-- of the trust boundary, and it does not belong on a page anybody can read.
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

commit;
