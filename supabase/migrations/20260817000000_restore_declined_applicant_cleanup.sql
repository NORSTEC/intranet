-- `20260815000000_workspace_directory_sync.sql` rewrote this function to add a
-- guard against discarding somebody who owns a Workspace account, and in doing
-- so dropped three statements the original body ended with:
--
--   * deleting the `auth.users` row behind the applicant's sign-in, which is
--     what removes `portal_accounts` by cascade. Without it the final
--     `delete from public.people` violates `portal_accounts_person_id_fkey`
--     and the whole decision is rolled back — declining any access request
--     from somebody who had signed in raised a foreign key error instead.
--   * deleting the applicant's avatar object, which lives in storage and so
--     survives the cascade, leaving a file nothing points at.
--   * (the link-intent delete did survive, and is kept below.)
--
-- The guards are unchanged from that migration, including the Workspace one it
-- was written to add. Only the ending is restored.
create or replace function private.discard_declined_applicant(p_person_id bigint)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  person_row public.people%rowtype;
begin
  select * into person_row
  from public.people
  where id = p_person_id
  for update;

  if not found or person_row.deleted_at is not null then
    return false;
  end if;

  if person_row.alumni_access_granted_at is not null then
    return false;
  end if;

  if exists (
    select 1 from public.memberships where person_id = p_person_id
  ) then
    return false;
  end if;

  if exists (
    select 1 from public.portal_administrators where person_id = p_person_id
  ) then
    return false;
  end if;

  -- An applicant who already owns an account in the norstec.no Workspace is
  -- not a stray profile to clean up: the account outlives the portal row, and
  -- the next directory sync would recreate the row as unmatched anyway.
  if exists (
    select 1 from public.external_accounts where person_id = p_person_id
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.access_requests
    where person_id = p_person_id
      and status = 'pending'
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.historical_membership_requests
    where person_id = p_person_id
      and status = 'pending'
  ) then
    return false;
  end if;

  delete from auth.users
  where id in (
    select account.auth_user_id
    from public.portal_accounts as account
    where account.person_id = p_person_id
  );

  delete from private.portal_account_link_intents
  where initiator_person_id = p_person_id;

  if person_row.avatar_path is not null then
    delete from storage.objects
    where bucket_id = 'member-avatars'
      and name = person_row.avatar_path;
  end if;

  delete from public.people where id = p_person_id;

  return true;
end;
$$;

revoke all on function private.discard_declined_applicant(bigint)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
