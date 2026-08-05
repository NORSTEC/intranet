begin;

-- Reverses `20260810000000_keep_declined_applicant.sql`. Keeping the profile
-- of someone who was told no meant the portal held a named person, their
-- address, and their Google sign-in for no reason anyone could point at: they
-- are not a member, not an alumnus, and have no relationship with the
-- organization at all. Storing them needs a lawful basis, and a refused
-- request does not supply one. A declined applicant is discarded again.
--
-- What that costs, and how it is paid: the requester can no longer be told
-- in-app that they were declined, because there is no longer an account to
-- tell. The decline notice becomes an email, sent to the address on the
-- request before the profile goes. Sending is not built yet — the audit event
-- below is deliberately written first and carries everything the mail needs
-- (applicant name, applicant address, and the reviewer's note), so the sender
-- reads the record rather than needing the profile back.
--
-- The audit event is the one thing that survives, as it did before: who
-- decided what, about whom, with which note. `audit_events.target_person_id`
-- nulls itself when the profile goes, and the request row cascades away, so
-- the nested applicant snapshot is what the audit log has left to name them
-- by. That is the accountability record, not a profile.
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
      set status = 'active',
          role = 'member',
          provisioning_method = 'access_request',
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
