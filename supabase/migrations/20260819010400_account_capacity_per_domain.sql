begin;

-- The account limit was the number two, chosen when the portal knew one
-- domain. It counted sign-in accounts and refused a third, which read as "one
-- work account and one private one" because that was the only shape that
-- existed.
--
-- With more than one member organization the same number says something else:
-- somebody active in Norstec and in Orbit, who also wants to keep the private
-- account that carries them past either, is asking for three and is refused.
-- The limit meant to stop an account collector now stops the ordinary case
-- multi-organization membership is for.
--
-- What the limit was actually protecting is that one person should not hoard
-- sign-ins onto one profile, and in particular not two accounts on the same
-- organization domain — an alias account is the shape that makes a directory
-- sync ambiguous about who somebody is. So the rule becomes what it always
-- meant: **one account per organization domain, plus one that is not on any
-- of them.** It grows with the number of member organizations by itself, and
-- it never needs revisiting when the fourth one joins.
--
-- Bucketing falls back to the address when an account carries no hosted
-- domain. Accounts that predate the claim being recorded are real Workspace
-- accounts, and grouping two of them as "personal" would let exactly the alias
-- pair through that this refuses.
create or replace function private.account_domain_bucket(
  p_hosted_domain text,
  p_account_email text
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select domain.domain
      from private.organization_domains as domain
      where domain.domain = coalesce(
        nullif(lower(btrim(coalesce(p_hosted_domain, ''))), ''),
        split_part(lower(btrim(coalesce(p_account_email, ''))), '@', 2)
      )
    ),
    'personal'
  );
$$;

revoke all on function private.account_domain_bucket(text, text)
  from public, anon, authenticated;

create or replace function private.assert_account_capacity(
  p_person_id bigint,
  p_candidate_account_email text,
  p_candidate_hosted_domain text
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  candidate_bucket text;
begin
  candidate_bucket := private.account_domain_bucket(
    p_candidate_hosted_domain,
    p_candidate_account_email
  );

  if exists (
    select 1
    from public.portal_accounts as account
    where account.person_id = p_person_id
      and private.account_domain_bucket(
        account.hosted_domain,
        account.account_email
      ) = candidate_bucket
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'too_many_portal_accounts';
  end if;
end;
$$;

revoke all on function private.assert_account_capacity(bigint, text, text)
  from public, anon, authenticated;

-- Merging two profiles produces one set of accounts, so the same rule has to
-- hold for the union. A duplicate holding a second account on a domain the
-- survivor already answers for is exactly the repair a portal administrator
-- has to make first, by unlinking one of them.
create or replace function private.assert_merged_account_capacity(
  p_target_person_id bigint,
  p_source_person_id bigint
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.portal_accounts as account
    where account.person_id in (p_target_person_id, p_source_person_id)
    group by private.account_domain_bucket(
      account.hosted_domain,
      account.account_email
    )
    having count(*) > 1
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'too_many_portal_accounts';
  end if;
end;
$$;

revoke all on function private.assert_merged_account_capacity(bigint, bigint)
  from public, anon, authenticated;

create or replace function public.complete_portal_account_link(p_token_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '10s'
as $$
declare
  selected_auth_user_id uuid := (select auth.uid());
  link_intent record;
  source_auth_user_id uuid;
  source_person_id bigint;
  destination_person_id bigint;
  source_account_email text;
  source_hosted_domain text;
  join_result jsonb;
  matched_organization_id bigint;
  inserted_memberships integer := 0;
begin
  if selected_auth_user_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;

  select intent.*
  into link_intent
  from private.portal_account_link_intents as intent
  where intent.token_hash = p_token_hash
    and intent.expires_at > now()
  for update;

  if link_intent.token_hash is null then
    raise exception using errcode = 'P0001', message = 'link_intent_expired';
  end if;

  if selected_auth_user_id = link_intent.initiator_auth_user_id then
    raise exception using errcode = 'P0001', message = 'same_portal_account';
  end if;

  if link_intent.mode = 'add_account' then
    source_auth_user_id := selected_auth_user_id;
    destination_person_id := link_intent.initiator_person_id;
  else
    source_auth_user_id := link_intent.initiator_auth_user_id;

    select account.person_id
    into destination_person_id
    from public.portal_accounts as account
    where account.auth_user_id = selected_auth_user_id
      and account.onboarding_status = 'complete';
  end if;

  select account.person_id, account.account_email
  into source_person_id, source_account_email
  from public.portal_accounts as account
  where account.auth_user_id = source_auth_user_id;

  if source_person_id is null or destination_person_id is null then
    raise exception using errcode = 'P0001', message = 'portal_account_not_found';
  end if;

  if source_person_id = destination_person_id then
    raise exception using errcode = 'P0001', message = 'portal_account_already_linked';
  end if;

  perform 1
  from public.people as person
  where person.id = destination_person_id
    and person.portal_access_status = 'active'
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'target_portal_access_required';
  end if;

  perform 1
  from public.people as person
  where person.id = source_person_id
    and person.portal_access_status = 'active'
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'source_portal_access_required';
  end if;

  perform private.assert_account_capacity(
    destination_person_id,
    source_account_email,
    (
      select account.hosted_domain
      from public.portal_accounts as account
      where account.auth_user_id = source_auth_user_id
    )
  );

  if (
    select count(*)
    from public.portal_accounts as account
    where account.person_id = source_person_id
  ) <> 1
    or (
      select count(*)
      from public.person_emails as email
      where email.person_id = source_person_id
    ) <> 1
    or exists (
      select 1
      from public.people as source_person
      where source_person.id = source_person_id
        and source_person.alumni_access_granted_at is not null
    )
    or exists (select 1 from public.memberships where person_id = source_person_id)
    or exists (select 1 from public.access_requests where person_id = source_person_id)
    or exists (select 1 from public.historical_membership_requests where person_id = source_person_id)
    or exists (select 1 from public.profile_experiences where person_id = source_person_id)
    or exists (select 1 from public.team_memberships where person_id = source_person_id)
    or exists (select 1 from public.external_accounts where person_id = source_person_id)
    or exists (select 1 from public.portal_administrators where person_id = source_person_id)
  then
    raise exception using errcode = 'P0001', message = 'source_profile_has_data';
  end if;

  select account.hosted_domain
  into source_hosted_domain
  from public.portal_accounts as account
  where account.auth_user_id = source_auth_user_id;

  update public.person_emails
  set person_id = destination_person_id,
      is_primary = not exists (
        select 1
        from public.person_emails as target_email
        where target_email.person_id = destination_person_id
          and target_email.is_primary
      ),
      updated_at = now()
  where person_id = source_person_id;

  update public.portal_accounts
  set person_id = destination_person_id,
      onboarding_status = 'complete',
      linked_at = now(),
      last_seen_at = now()
  where auth_user_id = source_auth_user_id;

  -- Linking used to run its own copy of the domain rule, which meant every
  -- guard added to the sign-in path was a door left open here. One function
  -- decides now, and this is simply its second caller.
  join_result := private.apply_domain_join(
    destination_person_id,
    source_hosted_domain
  );

  matched_organization_id := nullif(join_result ->> 'organizationId', '')::bigint;
  inserted_memberships := case
    when join_result ->> 'outcome' = 'joined' then 1
    else 0
  end;

  update public.audit_events
  set actor_person_id = destination_person_id
  where actor_person_id = source_person_id;

  update public.audit_events
  set target_person_id = destination_person_id
  where target_person_id = source_person_id;

  delete from public.people where id = source_person_id;
  delete from private.portal_account_link_intents where token_hash = p_token_hash;

  insert into public.audit_events (
    actor_person_id,
    action,
    target_person_id,
    organization_id,
    details
  ) values (
    destination_person_id,
    'auth.portal_account_linked',
    destination_person_id,
    matched_organization_id,
    jsonb_build_object(
      'account_email', source_account_email,
      'mode', link_intent.mode,
      'membership_created', inserted_memberships = 1
    )
  );

  return jsonb_build_object(
    'accountEmail', source_account_email,
    'membershipCreated', inserted_memberships = 1,
    'join', join_result
  );
end;
$$;

create or replace function public.merge_people(
  p_target_person_id bigint,
  p_source_person_id bigint,
  p_primary_email text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '30s'
as $$
declare
  actor_person_id bigint;
  target_row public.people%rowtype;
  source_row public.people%rowtype;
  source_membership public.memberships%rowtype;
  target_membership public.memberships%rowtype;
  source_team_membership public.team_memberships%rowtype;
  target_team_membership public.team_memberships%rowtype;
  source_external_account public.external_accounts%rowtype;
  target_external_account public.external_accounts%rowtype;
  merged_status text;
  primary_email text;
  target_primary_email text;
  target_has_name boolean;
  target_has_avatar boolean;
begin
  actor_person_id := (select private.current_person_id());

  if actor_person_id is null or not (select private.is_portal_admin()) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if p_target_person_id = p_source_person_id then
    raise exception using errcode = 'P0001', message = 'same_person';
  end if;

  if p_source_person_id = actor_person_id then
    raise exception using errcode = 'P0001', message = 'self_action_blocked';
  end if;

  perform 1
  from public.people
  where id in (p_target_person_id, p_source_person_id)
  order by id
  for update;

  select * into target_row from public.people where id = p_target_person_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'target_not_found';
  end if;

  select * into source_row from public.people where id = p_source_person_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'source_not_found';
  end if;

  if target_row.deleted_at is not null or source_row.deleted_at is not null then
    raise exception using errcode = 'P0001', message = 'person_deleted';
  end if;

  -- A portal administrator is never the profile that disappears. Folding one
  -- into another person would end a portal-wide role as a side effect of a
  -- duplicate repair, and leave the administrator's own profile as the one
  -- that no longer exists. Merging the other way — an ordinary duplicate into
  -- an administrator — is unaffected: the administrator is the target, keeps
  -- their role, and is the profile that survives.
  if exists (
    select 1
    from public.portal_administrators as administrator
    where administrator.person_id = p_source_person_id
  ) then
    raise exception using errcode = 'P0001',
      message = 'source_is_portal_administrator';
  end if;

  -- Neither is a Norstec account, for the reason above: it is the identity a
  -- future Google Workspace integration keys off, and it must keep its own
  -- row rather than disappear into someone else's.
  if exists (
    select 1
    from public.person_emails as person_email
    where person_email.person_id = p_source_person_id
      and person_email.is_primary
      and split_part(person_email.email, '@', 2) in (
        select domain.domain
        from private.organization_domains as domain
        join public.organizations as organization
          on organization.id = domain.organization_id
        where organization.slug = 'norstec'
      )
  ) or exists (
    select 1
    from public.portal_accounts as account
    where account.person_id = p_source_person_id
      and split_part(account.account_email, '@', 2) in (
        select domain.domain
        from private.organization_domains as domain
        join public.organizations as organization
          on organization.id = domain.organization_id
        where organization.slug = 'norstec'
      )
  ) then
    raise exception using errcode = 'P0001',
      message = 'source_is_norstec_account';
  end if;

  perform private.assert_merged_account_capacity(
    p_target_person_id,
    p_source_person_id
  );

  primary_email := nullif(btrim(lower(coalesce(p_primary_email, ''))), '');

  -- A name is one fact spread over three columns, and a picture is one fact
  -- spread over two. Filling them in column by column is what let a merge
  -- leave a profile called Eirik Engen Kvam whose first name was Bjørn.
  target_has_name := target_row.full_name is not null
    or target_row.first_name is not null
    or target_row.last_name is not null;
  target_has_avatar := target_row.avatar_path is not null;

  -- Read before anything moves. Once the source's addresses have been folded
  -- in, there is no way left to tell which of them the surviving person was
  -- actually reachable at.
  select address.email
  into target_primary_email
  from public.person_emails as address
  where address.person_id = p_target_person_id
    and address.is_primary;

  -- Memberships move first. Everything downstream — the email guard, the
  -- alumni derivation — reads membership state, and the source must look
  -- empty by the time those run.
  for source_membership in
    select * from public.memberships where person_id = p_source_person_id
  loop
    select * into target_membership
    from public.memberships
    where person_id = p_target_person_id
      and organization_id = source_membership.organization_id;

    if not found then
      update public.memberships
      set person_id = p_target_person_id
      where id = source_membership.id;
      continue;
    end if;

    merged_status := case
      when 'active' in (target_membership.status, source_membership.status)
        then 'active'
      else target_membership.status
    end;

    -- The surviving role is the target's. A merge never promotes anyone.
    update public.memberships
    set status = merged_status,
        joined_at = least(target_membership.joined_at, source_membership.joined_at),
        starts_on = least(target_membership.starts_on, source_membership.starts_on),
        ends_on = case when merged_status = 'active' then null
          else greatest(target_membership.ends_on, source_membership.ends_on)
        end,
        ended_at = case when merged_status = 'active' then null
          else greatest(target_membership.ended_at, source_membership.ended_at)
        end
    where id = target_membership.id;

    -- Two open periods would be the same real interval counted twice, and
    -- the one-open-period index rejects them anyway.
    if exists (
      select 1
      from public.membership_periods
      where membership_id = target_membership.id
        and ends_on is null
    ) and exists (
      select 1
      from public.membership_periods
      where membership_id = source_membership.id
        and ends_on is null
    ) then
      update public.membership_periods as target_period
      set starts_on = least(target_period.starts_on, source_period.starts_on),
          started_at = least(target_period.started_at, source_period.started_at)
      from public.membership_periods as source_period
      where target_period.membership_id = target_membership.id
        and target_period.ends_on is null
        and source_period.membership_id = source_membership.id
        and source_period.ends_on is null;

      delete from public.membership_periods
      where membership_id = source_membership.id
        and ends_on is null;
    end if;

    update public.membership_periods
    set membership_id = target_membership.id
    where membership_id = source_membership.id;

    delete from public.memberships where id = source_membership.id;
  end loop;

  for source_team_membership in
    select * from public.team_memberships where person_id = p_source_person_id
  loop
    select * into target_team_membership
    from public.team_memberships
    where person_id = p_target_person_id
      and team_id = source_team_membership.team_id;

    if not found then
      update public.team_memberships
      set person_id = p_target_person_id
      where id = source_team_membership.id;
      continue;
    end if;

    update public.team_memberships
    set role_title = coalesce(
          target_team_membership.role_title,
          source_team_membership.role_title
        )
    where id = target_team_membership.id;

    delete from public.team_memberships where id = source_team_membership.id;
  end loop;

  for source_external_account in
    select * from public.external_accounts where person_id = p_source_person_id
  loop
    select * into target_external_account
    from public.external_accounts
    where person_id = p_target_person_id
      and organization_id = source_external_account.organization_id
      and provider = source_external_account.provider;

    if not found then
      update public.external_accounts
      set person_id = p_target_person_id
      where id = source_external_account.id;
      continue;
    end if;

    if target_external_account.status = 'not_started'
      and source_external_account.status <> 'not_started'
    then
      update public.external_accounts
      set status = source_external_account.status,
          external_id = source_external_account.external_id,
          account_email = source_external_account.account_email,
          provisioned_at = source_external_account.provisioned_at,
          deprovisioned_at = source_external_account.deprovisioned_at
      where id = target_external_account.id;
    end if;

    delete from public.external_accounts where id = source_external_account.id;
  end loop;

  -- A duplicate pending request for the same organization is the same
  -- request twice; the surviving one is the target's.
  update public.access_requests as source_request
  set status = 'cancelled'
  where source_request.person_id = p_source_person_id
    and source_request.status = 'pending'
    and exists (
      select 1
      from public.access_requests as target_request
      where target_request.person_id = p_target_person_id
        and target_request.status = 'pending'
        and target_request.organization_id is not distinct from
          source_request.organization_id
    );

  update public.access_requests
  set person_id = p_target_person_id
  where person_id = p_source_person_id;

  update public.access_requests
  set reviewed_by_person_id = p_target_person_id
  where reviewed_by_person_id = p_source_person_id;

  update public.historical_membership_requests
  set person_id = p_target_person_id
  where person_id = p_source_person_id;

  update public.historical_membership_requests
  set reviewed_by_person_id = p_target_person_id
  where reviewed_by_person_id = p_source_person_id;

  update public.profile_experiences
  set person_id = p_target_person_id
  where person_id = p_source_person_id;

  update public.team_memberships
  set archived_by_person_id = p_target_person_id
  where archived_by_person_id = p_source_person_id;

  -- Email addresses are globally unique, so the two sets can never collide.
  -- Only the one-primary-per-person index has to be respected, and it is
  -- resolved after everything has moved — by restoring the address the
  -- surviving person already answered on, not by re-deriving one.
  update public.person_emails
  set person_id = p_target_person_id,
      is_primary = false
  where person_id = p_source_person_id;

  update public.person_emails
  set is_primary = false
  where person_id = p_target_person_id
    and is_primary;

  if primary_email is not null then
    update public.person_emails
    set is_primary = true
    where person_id = p_target_person_id
      and email = primary_email;

    if not found then
      raise exception using errcode = 'P0001', message = 'primary_email_not_found';
    end if;
  elsif target_primary_email is not null then
    update public.person_emails
    set is_primary = true
    where person_id = p_target_person_id
      and email = target_primary_email;
  else
    -- Only reachable when the surviving person had no address at all, which
    -- is the one case where the duplicate's oldest address is an improvement
    -- rather than a substitution.
    update public.person_emails
    set is_primary = true
    where id = (
      select candidate.id
      from public.person_emails as candidate
      where candidate.person_id = p_target_person_id
      order by candidate.created_at, candidate.id
      limit 1
    );
  end if;

  update public.portal_accounts
  set person_id = p_target_person_id
  where person_id = p_source_person_id;

  update public.audit_events as event
  set actor_person_id = p_target_person_id
  where event.actor_person_id = p_source_person_id;

  update public.audit_events as event
  set target_person_id = p_target_person_id
  where event.target_person_id = p_source_person_id;

  update public.portal_administrators
  set granted_by_person_id = p_target_person_id
  where granted_by_person_id = p_source_person_id;

  delete from private.portal_account_link_intents
  where initiator_person_id = p_source_person_id;

  -- The target keeps every field it already has; the source only fills the
  -- blanks. Portal access is the exception: a suspended or deactivated target
  -- stays that way, because that state was set deliberately. Only a profile
  -- nobody had ever signed in to is opened by the account arriving with the
  -- source.
  update public.people
  -- Taken as a set or not at all: a profile that knows any part of its own
  -- name keeps every part of it, including the parts it does not know. Only a
  -- profile with no name whatsoever takes the duplicate's.
  set full_name = case when target_has_name
        then target_row.full_name else source_row.full_name end,
      first_name = case when target_has_name
        then target_row.first_name else source_row.first_name end,
      last_name = case when target_has_name
        then target_row.last_name else source_row.last_name end,
      field_of_study = coalesce(target_row.field_of_study, source_row.field_of_study),
      study_year = coalesce(target_row.study_year, source_row.study_year),
      phone_number = coalesce(target_row.phone_number, source_row.phone_number),
      linkedin_url = coalesce(target_row.linkedin_url, source_row.linkedin_url),
      -- The alternative text describes the picture, so it travels with it or
      -- not at all. Coalescing them apart put a description of one person's
      -- face on another person's photograph.
      avatar_path = case when target_has_avatar
        then target_row.avatar_path else source_row.avatar_path end,
      avatar_alt = case when target_has_avatar
        then target_row.avatar_alt else source_row.avatar_alt end,
      alumni_access_granted_at = least(
        target_row.alumni_access_granted_at,
        source_row.alumni_access_granted_at
      ),
      portal_access_status = case
        when target_row.portal_access_status = 'unclaimed'
          and source_row.portal_access_status = 'active'
          then 'active'
        else target_row.portal_access_status
      end
  where id = p_target_person_id;

  delete from public.people where id = p_source_person_id;

  perform private.assert_person_invariants(p_target_person_id);

  insert into public.audit_events (
    actor_person_id, action, target_person_id, details
  ) values (
    actor_person_id,
    'person.merged',
    p_target_person_id,
    jsonb_build_object('source_person_id', p_source_person_id)
  );
end;
$$;

revoke all on function public.complete_portal_account_link(text) from public, anon;
grant execute on function public.complete_portal_account_link(text) to authenticated;

revoke all on function public.merge_people(bigint, bigint, text) from public, anon;
grant execute on function public.merge_people(bigint, bigint, text) to authenticated;

commit;
