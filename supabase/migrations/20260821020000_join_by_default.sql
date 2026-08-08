begin;

-- Two decisions, made after the first organizations were about to be
-- registered and the shape of the launch became concrete.
--
-- **`off` is gone.** It was meant to be "the domain proves who somebody is and
-- promises nothing about membership", but that is what registering a domain
-- already does: the address becomes the organization's, the account takes its
-- domain's place in the capacity rule, and claiming an address on it needs the
-- proof. The policy never controlled any of that. What `off` actually did,
-- next to `request`, was send somebody to the same approval screen with the
-- organization *not* filled in — and the organization is known either way,
-- because the account proved the domain. A setting whose whole effect is
-- withholding a preselection is not a setting.
--
-- **Joining is the default.** The old default made an organization ask before
-- letting its own Workspace accounts in. That is the right default for a
-- portal with somebody watching the queue, and the wrong one for this portal:
-- every member organization is meant to sign in and register themselves at
-- launch, and nobody has time to sit over access reviews. An approval queue
-- nobody works is not a safeguard, it is a locked door.
--
-- What the default gives up is real and worth naming. For an organization
-- whose Workspace directory the portal cannot read, `auto` means a membership
-- appears without anybody seeing it, and nothing ever tells the portal that
-- somebody left. Their `post@` and `styret@` accounts become members too. The
-- protection that survives either way is the one that matters most: an ended
-- membership is never reinstated by a domain, so removing somebody is still
-- removing them. `Approve each person` stays for an organization that wants
-- the queue.
update public.organizations
set domain_join_policy = 'request'
where domain_join_policy = 'off';

alter table public.organizations
  drop constraint if exists organizations_domain_join_policy_check;

alter table public.organizations
  add constraint organizations_domain_join_policy_check
  check (domain_join_policy in ('auto', 'request'));

alter table public.organizations
  alter column domain_join_policy set default 'auto';

comment on column public.organizations.domain_join_policy is
  'auto: a proven domain grants membership. request: it sends the person to an access request with the organization already chosen.';

-- Organizations that predate the column were given the asking default when it
-- was added. Only Norstec was ever deliberately set to join automatically, and
-- the rest were waiting for this decision rather than expressing one.
update public.organizations
set domain_join_policy = 'auto'
where domain_join_policy = 'request'
  and not exists (
    select 1
    from public.audit_events as event
    where event.action = 'organization.domain_join_policy_changed'
      and event.organization_id = organizations.id
  );

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
  proven_domain text;
  target_organization_id bigint;
  target_organization_slug text;
  join_policy text;
  membership_status text;
begin
  proven_domain := nullif(lower(btrim(coalesce(p_hosted_domain, ''))), '');

  -- No claim means not proven, never proven personal. GoTrue has a legacy
  -- path that drops the claim, and reading its absence as evidence would turn
  -- a Google outage into a portal-wide demotion.
  if proven_domain is null or p_person_id is null then
    return jsonb_build_object('outcome', 'unproven');
  end if;

  select organization.id, organization.slug, organization.domain_join_policy
  into target_organization_id, target_organization_slug, join_policy
  from private.organization_domains as domain
  join public.organizations as organization
    on organization.id = domain.organization_id
  where domain.domain = proven_domain
    and organization.status = 'active';

  if target_organization_id is null then
    return jsonb_build_object('outcome', 'no_organization');
  end if;

  if not exists (
    select 1
    from public.people as person
    where person.id = p_person_id
      and person.portal_access_status = 'active'
      and person.deleted_at is null
  ) then
    return jsonb_build_object(
      'outcome', 'blocked',
      'organizationId', target_organization_id,
      'organizationSlug', target_organization_slug
    );
  end if;

  select membership.status
  into membership_status
  from public.memberships as membership
  where membership.person_id = p_person_id
    and membership.organization_id = target_organization_id;

  if membership_status = 'active' then
    return jsonb_build_object(
      'outcome', 'member',
      'organizationId', target_organization_id,
      'organizationSlug', target_organization_slug
    );
  end if;

  -- Any membership row that already exists outranks the policy. `ended` is the
  -- one that matters most — somebody the organization has already let go does
  -- not walk back in because their Workspace account outlived the decision —
  -- but `planned`, `suspended` and `alumni` are equally not an invitation to
  -- insert. They also cannot be reported as a join: the insert below would do
  -- nothing on conflict while the caller was told a membership had been
  -- created, and would route somebody into a portal they cannot enter.
  if membership_status is not null or join_policy <> 'auto' then
    return jsonb_build_object(
      'outcome', 'request',
      'organizationId', target_organization_id,
      'organizationSlug', target_organization_slug,
      'membershipStatus', membership_status,
      'returning', membership_status = 'ended'
    );
  end if;

  insert into public.memberships (
    person_id,
    organization_id,
    role,
    status,
    provisioning_method
  ) values (
    p_person_id,
    target_organization_id,
    'member',
    'active',
    'domain'
  )
  on conflict (person_id, organization_id) do nothing;

  return jsonb_build_object(
    'outcome', 'joined',
    'organizationId', target_organization_id,
    'organizationSlug', target_organization_slug
  );
end;
$$;

revoke all on function private.apply_domain_join(bigint, text)
  from public, anon, authenticated;

create or replace function public.set_organization_domain_join_policy(
  p_organization_id bigint,
  p_policy text
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
  target_policy text;
  previous_policy text;
begin
  actor_person_id := (select private.current_person_id());

  -- Portal administrators rather than organization administrators. The policy
  -- decides who gets in without anybody looking, which is a question about the
  -- portal's trust in a domain, not about how an organization runs itself.
  if actor_person_id is null or not (select private.is_portal_admin()) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  target_policy := nullif(btrim(lower(coalesce(p_policy, ''))), '');

  if target_policy not in ('auto', 'request') then
    raise exception using errcode = 'P0001', message = 'invalid_join_policy';
  end if;

  select domain_join_policy
  into previous_policy
  from public.organizations
  where id = p_organization_id
  for update;

  if previous_policy is null then
    raise exception using errcode = 'P0001', message = 'organization_not_found';
  end if;

  if previous_policy = target_policy then
    return jsonb_build_object('policy', target_policy, 'changed', false);
  end if;

  update public.organizations
  set domain_join_policy = target_policy,
      updated_at = now()
  where id = p_organization_id;

  insert into public.audit_events (
    actor_person_id, action, organization_id, details
  ) values (
    actor_person_id,
    'organization.domain_join_policy_changed',
    p_organization_id,
    jsonb_build_object(
      'previous_policy', previous_policy,
      'policy', target_policy
    )
  );

  return jsonb_build_object('policy', target_policy, 'changed', true);
end;
$$;

revoke all on function public.set_organization_domain_join_policy(bigint, text)
  from public, anon;
grant execute on function public.set_organization_domain_join_policy(bigint, text)
  to authenticated;

commit;
