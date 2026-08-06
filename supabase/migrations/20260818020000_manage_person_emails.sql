begin;

-- Nobody could change which address a person is reachable at. The only writer
-- was a `merge_people` parameter that portal management never passes, so the
-- address chosen by whichever sign-in happened to come first was permanent.
-- That falls hardest on exactly the people it should fall lightest on: an
-- alumnus keeps an organization address they have lost access to as the
-- address the member directory shows, with no way to replace it.
--
-- The primary address is a contact address. Nothing is authorized by it —
-- authorization reads `memberships` and `portal_accounts` — so the person can
-- own it, and a portal administrator can fix it for somebody who cannot.
--
-- Removing an address stays administrative. An address is how the portal
-- recognises a returning person, so dropping one is how somebody's history
-- gets orphaned; it is also the repair for an address the Admin console has
-- reassigned to a new employee, which is why it has to exist at all.

-- One primary per person, always, whenever a person has any address. The
-- partial unique index has only ever rejected the second one; zero primaries
-- renders a member with no address anywhere in the portal, and every writer
-- added here has a path to it. Deferred, because a merge legitimately passes
-- through a state with none while it moves addresses between people.
create or replace function private.assert_one_primary_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  subject_person_id bigint;
  address_count integer;
  primary_count integer;
begin
  subject_person_id := coalesce(new.person_id, old.person_id);

  -- Deleting a person cascades into their addresses, and by the time this
  -- runs the person is already gone. There is nobody left to be unreachable.
  if not exists (
    select 1 from public.people as person where person.id = subject_person_id
  ) then
    return coalesce(new, old);
  end if;

  select count(*), count(*) filter (where address.is_primary)
  into address_count, primary_count
  from public.person_emails as address
  where address.person_id = subject_person_id;

  if address_count > 0 and primary_count <> 1 then
    raise exception using
      errcode = '23514',
      message = 'person_primary_email_invariant';
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function private.assert_one_primary_email()
  from public, anon, authenticated;

drop trigger if exists person_emails_one_primary on public.person_emails;
create constraint trigger person_emails_one_primary
after insert or update or delete on public.person_emails
deferrable initially deferred
for each row execute function private.assert_one_primary_email();

-- Shared by all three entry points below so the promotion rule is written
-- once: when the address that was primary goes away, the oldest remaining one
-- takes over rather than the person being left with none.
create or replace function private.set_primary_email(
  p_person_id bigint,
  p_email text
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  chosen_email text;
begin
  chosen_email := nullif(btrim(lower(coalesce(p_email, ''))), '');

  if chosen_email is null then
    select address.email
    into chosen_email
    from public.person_emails as address
    where address.person_id = p_person_id
    order by address.created_at, address.id
    limit 1;
  end if;

  if chosen_email is null then
    return null;
  end if;

  if not exists (
    select 1
    from public.person_emails as address
    where address.person_id = p_person_id
      and address.email = chosen_email
  ) then
    raise exception using errcode = 'P0001', message = 'primary_email_not_found';
  end if;

  update public.person_emails
  set is_primary = false,
      updated_at = now()
  where person_id = p_person_id
    and is_primary
    and email <> chosen_email;

  update public.person_emails
  set is_primary = true,
      updated_at = now()
  where person_id = p_person_id
    and email = chosen_email
    and not is_primary;

  return chosen_email;
end;
$$;

revoke all on function private.set_primary_email(bigint, text)
  from public, anon, authenticated;

create or replace function public.set_own_primary_email(p_email text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  caller_person_id bigint;
  chosen_email text;
begin
  caller_person_id := (select private.current_person_id());

  if caller_person_id is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;

  if not exists (
    select 1
    from public.people as person
    where person.id = caller_person_id
      and person.portal_access_status = 'active'
      and person.deleted_at is null
  ) then
    raise exception using errcode = '42501', message = 'portal_access_required';
  end if;

  if nullif(btrim(coalesce(p_email, '')), '') is null then
    raise exception using errcode = 'P0001', message = 'primary_email_not_found';
  end if;

  chosen_email := private.set_primary_email(caller_person_id, p_email);

  insert into public.audit_events (
    actor_person_id, action, target_person_id, details
  ) values (
    caller_person_id,
    'person_email.primary_changed',
    caller_person_id,
    jsonb_build_object('email', chosen_email, 'source', 'profile')
  );

  return jsonb_build_object('email', chosen_email);
end;
$$;

revoke all on function public.set_own_primary_email(text) from public, anon;
grant execute on function public.set_own_primary_email(text) to authenticated;

create or replace function public.set_person_primary_email(
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
  chosen_email text;
begin
  actor_person_id := (select private.current_person_id());

  if actor_person_id is null or not (select private.is_portal_admin()) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if not exists (
    select 1
    from public.people as person
    where person.id = p_person_id
      and person.deleted_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'person_not_found';
  end if;

  if nullif(btrim(coalesce(p_email, '')), '') is null then
    raise exception using errcode = 'P0001', message = 'primary_email_not_found';
  end if;

  chosen_email := private.set_primary_email(p_person_id, p_email);

  insert into public.audit_events (
    actor_person_id, action, target_person_id, details
  ) values (
    actor_person_id,
    'person_email.primary_changed',
    p_person_id,
    jsonb_build_object('email', chosen_email, 'source', 'portal_management')
  );

  return jsonb_build_object('email', chosen_email);
end;
$$;

revoke all on function public.set_person_primary_email(bigint, text)
  from public, anon;
grant execute on function public.set_person_primary_email(bigint, text)
  to authenticated;

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
