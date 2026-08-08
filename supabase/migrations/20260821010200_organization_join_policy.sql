begin;

-- A matching email domain currently grants an active membership on the spot,
-- everywhere, with no way to say otherwise. That was a reasonable constant
-- while exactly one domain existed and the portal could see its Workspace
-- directory. It stops being reasonable the moment a member organization whose
-- directory the portal cannot read wants the same convenience.
--
-- Slack and Notion both make this a setting per workspace rather than a
-- property of the product: a domain match either joins you, or lets you ask.
-- The default there is to ask, and it is the default here for the same reason
-- — an organization the portal cannot verify against a directory should have a
-- human in the loop.
--
-- Nothing reads this column yet. The migration that moves the membership
-- decision does, and Norstec is set to `auto` here so that migration changes
-- nothing about how Norstec behaves today.
alter table public.organizations
  add column if not exists domain_join_policy text not null default 'request';

alter table public.organizations
  drop constraint if exists organizations_domain_join_policy_check;

alter table public.organizations
  add constraint organizations_domain_join_policy_check
  check (domain_join_policy in ('auto', 'request', 'off'));

comment on column public.organizations.domain_join_policy is
  'auto: a proven domain grants membership. request: it preselects an access request. off: it proves identity only.';

update public.organizations
set domain_join_policy = 'auto'
where slug = 'norstec';

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

  if target_policy not in ('auto', 'request', 'off') then
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
