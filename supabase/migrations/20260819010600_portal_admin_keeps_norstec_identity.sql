begin;

-- `set_portal_administrator` requires a Norstec identity before it grants the
-- role, and `assert_can_unlink_account` refuses to remove the last Norstec
-- sign-in account of somebody who holds it. Removing an address was never
-- taught the same thing, so the guard had a door beside it: take the address
-- rather than the account, and the portal keeps an administrator the
-- requirement says should not exist.
--
-- Enforcing the requirement inside `is_portal_admin()` was considered and
-- rejected when the unlink half was written — a Workspace sync could then lock
-- every administrator out at once, with no way back in. The same reasoning
-- holds here: what is enforced is the half that cannot fail closed, and Portal
-- management keeps reporting the half that can.
--
-- Either half of the identity satisfies it, matching what the grant accepts: a
-- Norstec address or a Norstec sign-in account.
create or replace function public.remove_person_email(
  p_person_id bigint,
  p_email text
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
  target_email text;
  was_primary boolean;
begin
  actor_person_id := (select private.current_person_id());

  if actor_person_id is null or not (select private.is_portal_admin()) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  target_email := nullif(btrim(lower(coalesce(p_email, ''))), '');

  select address.is_primary
  into was_primary
  from public.person_emails as address
  where address.person_id = p_person_id
    and address.email = target_email
  for update;

  if was_primary is null then
    raise exception using errcode = 'P0001', message = 'person_email_not_found';
  end if;

  -- The address behind a working sign-in is not the portal's to drop. Unlink
  -- the account first; that is the operation that decides the account no
  -- longer belongs here, and this one only records the address.
  if exists (
    select 1
    from public.portal_accounts as account
    where account.person_id = p_person_id
      and account.account_email = target_email
  ) then
    raise exception using errcode = 'P0001', message = 'email_has_sign_in_account';
  end if;

  if exists (
    select 1
    from public.memberships as membership
    where membership.person_id = p_person_id
      and membership.status = 'active'
  ) and not exists (
    select 1
    from public.person_emails as remaining
    where remaining.person_id = p_person_id
      and remaining.email <> target_email
  ) then
    raise exception using errcode = 'P0001', message = 'member_must_keep_email';
  end if;

  -- The role was granted against a Norstec identity and checked once. Unlink
  -- learned to protect the last one; this did not, so the same administrator
  -- could be left standing on nothing by removing an address instead of an
  -- account. Either half of the identity counts, because either half is what
  -- the grant accepts.
  if exists (
    select 1
    from public.portal_administrators as administrator
    where administrator.person_id = p_person_id
  )
    and split_part(target_email, '@', 2) in (
      select domain.domain
      from private.organization_domains as domain
      join public.organizations as organization
        on organization.id = domain.organization_id
      where organization.slug = 'norstec'
    )
    and not exists (
      select 1
      from public.person_emails as remaining
      where remaining.person_id = p_person_id
        and remaining.email <> target_email
        and split_part(remaining.email, '@', 2) in (
          select domain.domain
          from private.organization_domains as domain
          join public.organizations as organization
            on organization.id = domain.organization_id
          where organization.slug = 'norstec'
        )
    )
    and not exists (
      select 1
      from public.portal_accounts as account
      where account.person_id = p_person_id
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

  delete from public.person_emails
  where person_id = p_person_id
    and email = target_email;

  if was_primary then
    perform private.set_primary_email(p_person_id, null);
  end if;

  insert into public.audit_events (
    actor_person_id, action, target_person_id, details
  ) values (
    actor_person_id,
    'person_email.removed',
    p_person_id,
    jsonb_build_object(
      'email', target_email,
      'was_primary', was_primary,
      'source', 'portal_management'
    )
  );

  return jsonb_build_object('email', target_email);
end;
$$;

revoke all on function public.remove_person_email(bigint, text) from public, anon;
grant execute on function public.remove_person_email(bigint, text) to authenticated;

commit;
