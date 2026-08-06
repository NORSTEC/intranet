begin;

-- Both places that offer "Remove account" were guessing. They showed the
-- button whenever a second account existed, because that is the only part of
-- the rule a page can see: the rest of it reads organization domains, which
-- live in `private` and are not readable from a browser at all. So somebody
-- whose organization membership rests on the account they are looking at got a
-- button that could only ever fail, and the explanation arrived after they
-- pressed it.
--
-- This asks the same guard the operation runs, and returns the reason instead
-- of raising it. Nothing is authorized here that is not already: the caller
-- gets an answer about their own account, or about anybody's if they
-- administer the portal, and the guard itself is unchanged — the button and the
-- operation cannot drift apart, because they are the same check.
create or replace function public.portal_account_unlink_block(p_auth_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  caller_person_id bigint := (select private.current_person_id());
  target_person_id bigint;
  target_email text;
begin
  if caller_person_id is null then
    return 'not_authenticated';
  end if;

  select account.person_id, account.account_email
  into target_person_id, target_email
  from public.portal_accounts as account
  where account.auth_user_id = p_auth_user_id;

  if target_person_id is null then
    return 'portal_account_not_found';
  end if;

  if target_person_id <> caller_person_id
    and not (select private.is_portal_admin())
  then
    return 'not_authorized';
  end if;

  perform private.assert_can_unlink_account(target_person_id, target_email);
  return null;
exception
  when others then
    return sqlerrm;
end;
$$;

revoke all on function public.portal_account_unlink_block(uuid) from public, anon;
grant execute on function public.portal_account_unlink_block(uuid) to authenticated;

commit;
