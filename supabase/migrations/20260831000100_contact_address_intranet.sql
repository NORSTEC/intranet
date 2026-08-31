--
-- The support mailbox moved from `portal@norstec.no` to `intranet@norstec.no`
-- along with the rest of the rename.
--
-- This message is the one place that address lives in the database rather than
-- in the application, and it is read at the worst possible moment: the person
-- is being refused a sign-in, and the address is the only thing in the message
-- they can act on. An address that no longer receives is worse here than
-- anywhere else in the product.
--
-- The function below is `20260821030000_production_auth_hardening.sql`'s
-- definition with that one string changed and nothing else. Migrations are
-- append-only, so the correction is a new file rather than an edit to that one.
--

begin;

create or replace function private.before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
set statement_timeout = '2s'
as $$
declare
  incoming_email text;
  incoming_provider_id text;
  provider_name text;
begin
  provider_name := event -> 'user' -> 'app_metadata' ->> 'provider';

  if provider_name is distinct from 'google' then
    return '{}'::jsonb;
  end if;

  incoming_email := nullif(lower(btrim(event -> 'user' ->> 'email')), '');
  incoming_provider_id := coalesce(
    nullif(btrim(event -> 'user' -> 'user_metadata' ->> 'provider_id'), ''),
    nullif(btrim(event -> 'user' -> 'user_metadata' ->> 'sub'), '')
  );

  if incoming_email is null or incoming_provider_id is null then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Google did not provide a stable account identifier.'
      )
    );
  end if;

  if exists (
    select 1
    from public.portal_accounts as account
    where account.account_email = incoming_email
      and coalesce(
        account.provider_id,
        (
          select identity.provider_id
          from auth.identities as identity
          where identity.user_id = account.auth_user_id
            and identity.provider = 'google'
          order by identity.last_sign_in_at desc nulls last,
                   identity.created_at desc
          limit 1
        )
      ) is not null
      and coalesce(
        account.provider_id,
        (
          select identity.provider_id
          from auth.identities as identity
          where identity.user_id = account.auth_user_id
            and identity.provider = 'google'
          order by identity.last_sign_in_at desc nulls last,
                   identity.created_at desc
          limit 1
        )
      ) is distinct from incoming_provider_id
  ) then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'This email address is already tied to a different Google account. Contact intranet@norstec.no.'
      )
    );
  end if;

  return '{}'::jsonb;
end;
$$;

revoke all on function private.before_user_created(jsonb)
  from public, anon, authenticated;
grant execute on function private.before_user_created(jsonb)
  to supabase_auth_admin;

commit;
