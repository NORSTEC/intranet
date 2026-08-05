begin;

-- A deletion event recorded only `previous_access_status`, which is
-- `people.portal_access_status` — whether the person could sign in at all. The
-- audit log printed it under "Access before deletion", where it read as the
-- person's access level and said "Active", a word the access level vocabulary
-- (member, organization administrator, portal administrator) does not even
-- contain.
--
-- Three separate facts are involved, and a deletion is now recorded with all
-- three:
--   * status        — active, alumni, or no membership
--   * access level  — member or organization administrator
--   * portal access — active, suspended, or never signed in
--
-- The first two have to be captured before `private.end_person_memberships`
-- runs: it ends every active membership and resets the role to 'member', so
-- after the deletion the rows no longer say what the person was. Events
-- written before this migration carry only the portal access value, and the
-- audit log leaves the other two headings out for them rather than guessing.
create or replace function private.soft_delete_person_row(
  p_person_id bigint,
  p_actor_person_id bigint,
  p_reason text,
  p_source text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  person_row public.people%rowtype;
  person_primary_email text;
  active_membership_count integer;
  ended_membership_count integer;
  had_organization_admin boolean;
  previous_status text;
  previous_access_level text;
begin
  select * into person_row
  from public.people
  where id = p_person_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'person_not_found';
  end if;

  if person_row.deleted_at is not null then
    raise exception using errcode = 'P0001', message = 'person_already_deleted';
  end if;

  if exists (
    select 1
    from public.portal_administrators as administrator
    where administrator.person_id = p_person_id
  ) then
    raise exception using errcode = 'P0001', message = 'portal_admin_role_first';
  end if;

  select person_email.email
  into person_primary_email
  from public.person_emails as person_email
  where person_email.person_id = p_person_id
    and person_email.is_primary
  limit 1;

  select
    count(*) filter (where membership.status = 'active'),
    count(*) filter (where membership.status = 'ended'),
    coalesce(
      bool_or(
        membership.status = 'active'
        and membership.role = 'organization_admin'
      ),
      false
    )
  into active_membership_count, ended_membership_count, had_organization_admin
  from public.memberships as membership
  where membership.person_id = p_person_id;

  -- The same three rules Manage people reads a person's status by, including
  -- alumni access granted without any membership row ever existing.
  previous_status := case
    when active_membership_count > 0 then 'active'
    when ended_membership_count > 0
      or person_row.alumni_access_granted_at is not null then 'alumni'
    else 'none'
  end;

  -- A portal administrator cannot reach this point — the guard above refuses
  -- to delete one — so the level is only ever one of the other two. Suspension
  -- is deliberately not folded in here: it is portal access, recorded on its
  -- own below, and folding it in is what confused the two in the first place.
  previous_access_level := case
    when had_organization_admin then 'organization_admin'
    else 'member'
  end;

  perform private.end_person_memberships(p_person_id);

  update public.people
  set deleted_at = now(),
      deleted_by_person_id = p_actor_person_id,
      deletion_reason = p_reason,
      access_status_before_deletion = person_row.portal_access_status,
      portal_access_status = 'suspended'
  where id = p_person_id;

  perform private.revoke_person_sessions(p_person_id);

  -- Outstanding requests would otherwise keep the person in front of every
  -- organization administrator's review queue.
  update public.access_requests
  set status = 'cancelled'
  where person_id = p_person_id
    and status = 'pending';

  update public.historical_membership_requests
  set status = 'cancelled'
  where person_id = p_person_id
    and status = 'pending';

  insert into public.audit_events (
    actor_person_id, action, target_person_id, details
  ) values (
    p_actor_person_id,
    case when p_source = 'self_service'
      then 'person.self_deleted'
      else 'person.soft_deleted'
    end,
    p_person_id,
    jsonb_build_object(
      'previous_status', previous_status,
      'previous_access_level', previous_access_level,
      'previous_access_status', person_row.portal_access_status,
      'has_reason', p_reason is not null,
      'source', p_source,
      'deleted_person', jsonb_build_object(
        'name', person_row.full_name,
        'email', person_primary_email
      )
    )
  );
end;
$$;

revoke all on function private.soft_delete_person_row(bigint, bigint, text, text)
  from public, anon, authenticated;

commit;
