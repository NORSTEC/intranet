begin;

-- `unclaimed` means the imported member has not connected a Google account
-- yet. It is an identity state, not a suspension and not a directory opt-out.
-- Requiring `active` here hid the imported membership directory until a
-- portal administrator completed MFA and bypassed the ordinary member policy.
create or replace function private.person_is_directory_visible(
  target_person_id bigint
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select person.directory_visible
    from public.people as person
    where person.id = target_person_id
      and person.deleted_at is null
      and person.portal_access_status in ('unclaimed', 'active')
  ), false);
$$;

revoke all on function private.person_is_directory_visible(bigint)
  from public, anon, authenticated;

commit;
