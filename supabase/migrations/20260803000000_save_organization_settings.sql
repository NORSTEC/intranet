begin;

-- Lets an organization admin (or portal admin) edit their organization's
-- public-facing settings, matching the concurrency-checked update pattern
-- used for member profiles.
create or replace function public.save_organization_settings(
  p_organization_id bigint,
  p_expected_updated_at timestamptz,
  p_name text,
  p_website_url text,
  p_short_description text,
  p_specialization text,
  p_location text
)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  saved_at timestamptz;
begin
  if not (select private.is_organization_admin(p_organization_id)) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if char_length(btrim(p_name)) < 1 or char_length(btrim(p_name)) > 120 then
    raise exception using errcode = 'P0001', message = 'invalid_organization';
  end if;

  if p_website_url is not null and char_length(p_website_url) > 2048 then
    raise exception using errcode = 'P0001', message = 'invalid_organization';
  end if;

  if p_short_description is not null and char_length(p_short_description) > 1000 then
    raise exception using errcode = 'P0001', message = 'invalid_organization';
  end if;

  if p_location is not null and char_length(p_location) > 160 then
    raise exception using errcode = 'P0001', message = 'invalid_organization';
  end if;

  if p_specialization is not null
    and p_specialization not in ('rocketeering', 'satellites', 'satellites-and-rocketeering')
  then
    raise exception using errcode = 'P0001', message = 'invalid_organization';
  end if;

  update public.organizations
  set name = btrim(p_name),
      website_url = p_website_url,
      short_description = p_short_description,
      specialization = p_specialization,
      location = p_location
  where id = p_organization_id
    and updated_at = p_expected_updated_at
  returning updated_at into saved_at;

  if saved_at is null then
    if exists (select 1 from public.organizations where id = p_organization_id) then
      raise exception using errcode = 'P0001', message = 'organization_conflict';
    end if;
    raise exception using errcode = 'P0001', message = 'organization_not_found';
  end if;

  return saved_at;
end;
$$;

revoke all on function public.save_organization_settings(
  bigint, timestamptz, text, text, text, text, text
) from public, anon;
grant execute on function public.save_organization_settings(
  bigint, timestamptz, text, text, text, text, text
) to authenticated;

commit;
