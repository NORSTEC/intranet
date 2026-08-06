begin;

-- Two guards that were each half-right.
--
-- Approving an access request rewrote `provisioning_method` on a membership
-- that already existed. That column is the only record of *how* a membership
-- came to exist, and `assert_can_unlink_account` reads it to decide whether
-- the Google account behind a membership may be removed. A domain membership
-- that was ended and later reinstated by request therefore came back marked
-- `access_request`, and the organization account it rested on became
-- removable while the membership ran. Reactivation is not re-provisioning;
-- the column keeps what it says.
--
-- And the portal-administrator role required a norstec.no identity when it
-- was granted and never again. `is_portal_admin()` reads the table alone, so
-- an administrator who left Norstec kept portal-wide authority with nothing
-- but a private address behind it. Enforcing the requirement inside
-- `is_portal_admin()` was considered and rejected: it would make the
-- Workspace sync a single point that can lock every administrator out at
-- once, with no way back in. What is enforced is the half that is safe — an
-- administrator cannot remove the last Norstec account themselves — and
-- Portal management reports the half that is not, for a human to decide.
--
-- Note that the grant-time check accepts either a norstec.no primary address
-- or a norstec.no sign-in account, while this one only protects the account.
-- That is deliberate: the account is the identity an administrator actually
-- administers with, and an address alone cannot sign anybody in.
create or replace function private.assert_can_unlink_account(
  p_person_id bigint,
  p_account_email text
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (
    select count(*)
    from public.portal_accounts as account
    where account.person_id = p_person_id
  ) < 2 then
    raise exception using errcode = 'P0001', message = 'last_portal_account';
  end if;

  if exists (
    select 1
    from public.portal_administrators as administrator
    where administrator.person_id = p_person_id
  )
    and split_part(p_account_email, '@', 2) in (
      select domain.domain
      from private.organization_domains as domain
      join public.organizations as organization
        on organization.id = domain.organization_id
      where organization.slug = 'norstec'
    )
    and not exists (
      select 1
      from public.portal_accounts as account
      where account.person_id = p_person_id
        and account.account_email <> p_account_email
        and split_part(account.account_email, '@', 2) in (
          select domain.domain
          from private.organization_domains as domain
          join public.organizations as organization
            on organization.id = domain.organization_id
          where organization.slug = 'norstec'
        )
    )
  then
    raise exception using
      errcode = 'P0001',
      message = 'portal_admin_requires_norstec_account';
  end if;

  -- A domain-provisioned membership rests on the account that proved the
  -- domain. Removing the proof while the membership runs is how an
  -- organization account gets borrowed, cashed in for membership and handed
  -- back with nothing left to show for it.
  if exists (
    select 1
    from public.memberships as membership
    join private.organization_domains as membership_domain
      on membership_domain.organization_id = membership.organization_id
      and membership_domain.domain = split_part(p_account_email, '@', 2)
    where membership.person_id = p_person_id
      and membership.status = 'active'
      and membership.provisioning_method = 'domain'
      and not exists (
        select 1
        from public.person_emails as remaining_email
        join private.organization_domains as remaining_domain
          on remaining_domain.domain = split_part(remaining_email.email, '@', 2)
        where remaining_email.person_id = p_person_id
          and remaining_email.email <> p_account_email
          and remaining_domain.organization_id = membership.organization_id
      )
  ) then
    raise exception using errcode = 'P0001', message = 'membership_requires_account';
  end if;
end;
$$;

revoke all on function private.assert_can_unlink_account(bigint, text)
  from public, anon, authenticated;

create or replace function public.review_access_request(
  p_request_id bigint,
  p_decision text,
  p_decision_note text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '10s'
as $$
declare
  request_row public.access_requests%rowtype;
  reviewer_person_id bigint;
  reviewer_authorized boolean;
  applicant_name text;
  applicant_email text;
begin
  reviewer_person_id := (select private.current_person_id());
  if p_decision not in ('approved', 'rejected') then
    raise exception using errcode = 'P0001', message = 'invalid_decision';
  end if;
  if p_decision_note is not null and char_length(p_decision_note) > 1000 then
    raise exception using errcode = 'P0001', message = 'invalid_decision_note';
  end if;

  select * into request_row
  from public.access_requests
  where id = p_request_id
  for update;

  if not found or request_row.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'request_not_pending';
  end if;

  -- Alumni requests belong to no organization, so only portal administrators
  -- can decide them.
  reviewer_authorized := case
    when request_row.request_type = 'alumni'
      then (select private.is_portal_admin())
    else (select private.is_organization_admin(request_row.organization_id))
  end;

  if reviewer_person_id is null or not reviewer_authorized then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  select person.full_name into applicant_name
  from public.people as person
  where person.id = request_row.person_id;

  select address.email into applicant_email
  from public.person_emails as address
  where address.person_id = request_row.person_id
  order by address.is_primary desc, address.created_at, address.id
  limit 1;

  if p_decision = 'approved' then
    if request_row.request_type = 'alumni' then
      update public.people
      set alumni_access_granted_at = coalesce(alumni_access_granted_at, now())
      where id = request_row.person_id;
    else
      insert into public.memberships (
        person_id, organization_id, role, status, provisioning_method, starts_on
      ) values (
        request_row.person_id, request_row.organization_id, 'member', 'active',
        'access_request', current_date
      )
      on conflict (person_id, organization_id) do update
      -- `provisioning_method` records how the membership came to exist, and
      -- reactivating one does not rewrite that. Overwriting it erased the
      -- fact that a membership had been granted by an organization domain,
      -- which is the only thing `assert_can_unlink_account` has to go on when
      -- it decides whether the account behind a membership may be removed. A
      -- domain membership that had been ended and later reinstated by request
      -- came back looking as though no account had ever proved it.
      set status = 'active',
          role = 'member',
          ends_on = null,
          ended_at = null;
    end if;
  end if;

  update public.access_requests
  set status = p_decision,
      reviewed_by_person_id = reviewer_person_id,
      reviewed_at = now(),
      decision_note = nullif(btrim(p_decision_note), '')
  where id = request_row.id;

  insert into public.audit_events (
    actor_person_id, action, target_person_id, organization_id, details
  ) values (
    reviewer_person_id,
    'access_request_' || p_decision,
    request_row.person_id,
    request_row.organization_id,
    jsonb_build_object(
      'request_id', request_row.id,
      'request_type', request_row.request_type,
      'decision_note', nullif(btrim(p_decision_note), ''),
      'applicant', jsonb_build_object(
        'name', applicant_name,
        'email', applicant_email
      )
    )
  );

  -- `private.discard_declined_applicant` refuses to touch anyone who is more
  -- than an applicant — a membership past or present, alumni access, the
  -- administrator role, or another request still waiting all keep the profile.
  -- Declining one of several requests therefore removes nothing.
  if p_decision = 'rejected' then
    perform private.discard_declined_applicant(request_row.person_id);
  end if;
end;
$$;

revoke all on function public.review_access_request(bigint, text, text) from public, anon;
grant execute on function public.review_access_request(bigint, text, text) to authenticated;

commit;
