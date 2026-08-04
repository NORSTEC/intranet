begin;

-- Reviewers could read an access request but not the person behind it once the
-- request stopped being pending: can_manage_person only covers pending
-- requests, and a requester holds no membership and no alumni access, so
-- can_view_person rejected them. The review list showed "Unnamed member" with
-- no email for every decided request. Anyone allowed to decide a request is
-- allowed to see who filed it, for as long as the request exists. Alumni
-- requests carry no organization, and is_organization_admin(null) reduces to
-- is_portal_admin(), which is exactly who may decide them.
create or replace function private.can_view_person(target_person_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_person_id = (select private.current_person_id())
    or (select private.can_manage_person(target_person_id))
    or exists (
      select 1
      from public.access_requests as request
      where request.person_id = target_person_id
        and (select private.is_organization_admin(request.organization_id))
    )
    or (
      (select private.is_portal_member())
      and (
        exists (
          select 1
          from public.memberships as target_membership
          where target_membership.person_id = target_person_id
            and target_membership.status in ('active', 'ended')
        )
        or exists (
          select 1
          from public.people as target_person
          where target_person.id = target_person_id
            and target_person.alumni_access_granted_at is not null
            and target_person.portal_access_status = 'active'
        )
      )
    );
$$;

revoke all on function private.can_view_person(bigint) from public, anon;
grant execute on function private.can_view_person(bigint) to authenticated;

-- A pending request blocked the requester from filing any other one: the
-- request form is hidden while a decision is outstanding, and the partial
-- unique indexes reject a second pending request. Withdrawing is the way out
-- for someone who picked the wrong access type or the wrong organization.
create or replace function public.cancel_own_access_request(p_request_id bigint)
returns void
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  caller_person_id bigint;
  request_row public.access_requests%rowtype;
begin
  caller_person_id := (select private.current_person_id());

  if caller_person_id is null then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  select * into request_row
  from public.access_requests
  where id = p_request_id
  for update;

  if not found or request_row.person_id <> caller_person_id then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if request_row.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'request_not_pending';
  end if;

  update public.access_requests
  set status = 'cancelled'
  where id = request_row.id;

  insert into public.audit_events (
    actor_person_id, action, target_person_id, organization_id, details
  ) values (
    caller_person_id,
    'access_request_cancelled',
    caller_person_id,
    request_row.organization_id,
    jsonb_build_object(
      'request_id', request_row.id,
      'request_type', request_row.request_type
    )
  );
end;
$$;

revoke all on function public.cancel_own_access_request(bigint) from public, anon;
grant execute on function public.cancel_own_access_request(bigint) to authenticated;

-- The review list reads every request an administrator may decide, not just
-- the pending ones, newest first.
create index if not exists access_requests_status_created_idx
  on public.access_requests (status, created_at desc);

commit;
