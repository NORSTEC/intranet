begin;

-- Memberships and team assignments are authoritative administration data.
-- Profile experience is now stored separately and is the only history that a
-- member edits directly.
revoke update (starts_on, ends_on) on public.memberships from authenticated;
drop policy if exists memberships_self_history_update on public.memberships;

revoke insert, update, delete on public.team_memberships from authenticated;
drop policy if exists team_memberships_self_insert on public.team_memberships;
drop policy if exists team_memberships_self_update on public.team_memberships;
drop policy if exists team_memberships_self_delete on public.team_memberships;

revoke execute on function public.restore_own_team_experience(
  bigint, timestamptz
) from authenticated;

revoke execute on function public.save_own_profile(
  timestamptz,
  text,
  text,
  text,
  smallint,
  text,
  text,
  text,
  jsonb,
  jsonb,
  jsonb
) from authenticated;

commit;
