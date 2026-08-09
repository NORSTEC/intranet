begin;

-- Directory visibility is its own privacy decision. Keep it out of the broad
-- profile writer and expose no target person id: an authenticated caller can
-- only change the person linked to the current Supabase identity.
create or replace function public.set_own_directory_visibility(
  p_directory_visible boolean
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  caller_person_id bigint;
  previous_visibility boolean;
begin
  if p_directory_visible is null then
    raise exception using errcode = 'P0001', message = 'invalid_visibility';
  end if;

  caller_person_id := (select private.current_person_id());

  select person.directory_visible
  into previous_visibility
  from public.people as person
  where person.id = caller_person_id
    and person.portal_access_status = 'active'
    and person.deleted_at is null
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'portal_access_required';
  end if;

  if previous_visibility is distinct from p_directory_visible then
    update public.people
    set directory_visible = p_directory_visible
    where id = caller_person_id;

    insert into public.audit_events (
      actor_person_id, action, target_person_id, details
    ) values (
      caller_person_id,
      'profile.directory_visibility_changed',
      caller_person_id,
      jsonb_build_object(
        'from', previous_visibility,
        'to', p_directory_visible,
        'source', 'self_service'
      )
    );
  end if;

  return p_directory_visible;
end;
$$;

comment on function public.set_own_directory_visibility(boolean) is
  'Sets only the signed-in person directory visibility and records an audit event when it changes.';

revoke all on function public.set_own_directory_visibility(boolean)
  from public, anon, authenticated;
grant execute on function public.set_own_directory_visibility(boolean)
  to authenticated;

commit;
