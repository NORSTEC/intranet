begin;

-- Lets an organization admin (or portal admin) create a team, matching the
-- slug-generation needs of teams created outside the Sanity import.
create or replace function public.create_team(
  p_organization_id bigint,
  p_name text,
  p_description text
)
returns json
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  base_slug text;
  candidate_slug text;
  suffix int := 1;
  new_team_id bigint;
  new_team_slug text;
begin
  if not (select private.is_organization_admin(p_organization_id)) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if char_length(btrim(p_name)) < 1 or char_length(btrim(p_name)) > 160 then
    raise exception using errcode = 'P0001', message = 'invalid_team';
  end if;

  if p_description is not null and char_length(p_description) > 5000 then
    raise exception using errcode = 'P0001', message = 'invalid_team';
  end if;

  base_slug := lower(regexp_replace(btrim(p_name), '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := regexp_replace(base_slug, '(^-+)|(-+$)', '', 'g');
  if base_slug = '' then
    base_slug := 'team';
  end if;

  candidate_slug := base_slug;
  loop
    exit when not exists (
      select 1 from public.teams
      where organization_id = p_organization_id and slug = candidate_slug
    );
    suffix := suffix + 1;
    candidate_slug := base_slug || '-' || suffix;
  end loop;

  insert into public.teams (organization_id, slug, name, description)
  values (p_organization_id, candidate_slug, btrim(p_name), nullif(btrim(p_description), ''))
  returning id, slug into new_team_id, new_team_slug;

  return json_build_object('id', new_team_id, 'slug', new_team_slug);
end;
$$;

revoke all on function public.create_team(bigint, text, text) from public, anon;
grant execute on function public.create_team(bigint, text, text) to authenticated;

-- Deletes a team outright (with its memberships, via the existing cascade).
-- The UI warns the admin about member count before calling this.
create or replace function public.delete_team(p_team_id bigint)
returns void
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  target_organization_id bigint;
begin
  select team.organization_id into target_organization_id
  from public.teams as team
  where team.id = p_team_id;

  if target_organization_id is null then
    raise exception using errcode = 'P0001', message = 'team_not_found';
  end if;

  if not (select private.is_organization_admin(target_organization_id)) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  delete from public.teams where id = p_team_id;
end;
$$;

revoke all on function public.delete_team(bigint) from public, anon;
grant execute on function public.delete_team(bigint) to authenticated;

-- Saves a team's name/description and its full member roster in one trip,
-- matching the concurrency-checked settings pattern used elsewhere. Members
-- no longer selected are archived (not deleted) so team-experience history on
-- their profile is preserved; re-adding a previously archived member restores
-- the same row instead of creating a duplicate.
create or replace function public.save_team_settings(
  p_team_id bigint,
  p_expected_updated_at timestamptz,
  p_name text,
  p_description text,
  p_person_ids bigint[]
)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  target_organization_id bigint;
  saved_at timestamptz;
  caller_person_id bigint;
  member_ids bigint[];
begin
  select team.organization_id into target_organization_id
  from public.teams as team
  where team.id = p_team_id;

  if target_organization_id is null then
    raise exception using errcode = 'P0001', message = 'team_not_found';
  end if;

  if not (select private.is_organization_admin(target_organization_id)) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if char_length(btrim(p_name)) < 1 or char_length(btrim(p_name)) > 160 then
    raise exception using errcode = 'P0001', message = 'invalid_team';
  end if;

  if p_description is not null and char_length(p_description) > 5000 then
    raise exception using errcode = 'P0001', message = 'invalid_team';
  end if;

  member_ids := coalesce(p_person_ids, array[]::bigint[]);

  if exists (
    select 1
    from unnest(member_ids) as person_id
    where not exists (
      select 1 from public.memberships as membership
      where membership.person_id = person_id
        and membership.organization_id = target_organization_id
        and membership.status in ('active', 'ended')
    )
  ) then
    raise exception using errcode = 'P0001', message = 'invalid_team_member';
  end if;

  caller_person_id := (select private.current_person_id());

  update public.teams
  set name = btrim(p_name),
      description = nullif(btrim(p_description), '')
  where id = p_team_id
    and updated_at = p_expected_updated_at
  returning updated_at into saved_at;

  if saved_at is null then
    if exists (select 1 from public.teams where id = p_team_id) then
      raise exception using errcode = 'P0001', message = 'team_conflict';
    end if;
    raise exception using errcode = 'P0001', message = 'team_not_found';
  end if;

  update public.team_memberships
  set archived_at = now(),
      archived_by_person_id = caller_person_id
  where team_id = p_team_id
    and archived_at is null
    and not (person_id = any (member_ids));

  insert into public.team_memberships (team_id, person_id)
  select p_team_id, person_id
  from unnest(member_ids) as person_id
  on conflict (team_id, person_id) do update
    set archived_at = null,
        archived_by_person_id = null
    where public.team_memberships.archived_at is not null;

  return saved_at;
end;
$$;

revoke all on function public.save_team_settings(
  bigint, timestamptz, text, text, bigint[]
) from public, anon;
grant execute on function public.save_team_settings(
  bigint, timestamptz, text, text, bigint[]
) to authenticated;

commit;
