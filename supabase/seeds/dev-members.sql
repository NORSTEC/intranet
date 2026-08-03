-- Development seed: synthetic members so the statistics page has something to
-- chart. Adds between 3 and 9 members to every active organization, with at
-- least one active member each, memberships spread over the last 30 months and
-- roughly a fifth of them ended so alumni figures are non-zero.
--
-- Every seeded person is identified by an @statistics-seed.invalid email
-- address (.invalid is reserved by RFC 2606 and can never be a real domain).
-- Remove them again with dev-members-cleanup.sql in this directory.
--
-- Seeded members are always created with role 'member'; the script never grants
-- organization_admin, so it cannot widen anyone's permissions.

begin;

-- The memberships trigger writes a row into public.membership_periods. If that
-- table is missing while the trigger is present, every insert below would fail
-- halfway through, so stop with a message that names the actual problem.
do $$
begin
  if to_regclass('public.membership_periods') is null
    and exists (
      select 1 from pg_trigger
      where tgname = 'memberships_create_period' and not tgisinternal
    )
  then
    raise exception
      'Trigger memberships_create_period is installed but table public.membership_periods does not exist. Reconcile that before seeding.';
  end if;
end $$;

do $$
declare
  given_names text[] := array[
    'Ada', 'Bjørn', 'Cecilie', 'Daniel', 'Eira', 'Fredrik', 'Guro', 'Håkon',
    'Ingrid', 'Jonas', 'Kaja', 'Lars', 'Maren', 'Nils', 'Oda', 'Petter',
    'Ronja', 'Sindre', 'Tuva', 'Vetle'
  ];
  family_names text[] := array[
    'Aasen', 'Berg', 'Dahl', 'Eide', 'Fossum', 'Gundersen', 'Haugen', 'Iversen',
    'Johansen', 'Kristiansen', 'Lunde', 'Moen', 'Nygård', 'Olsen', 'Pedersen',
    'Ruud', 'Solberg', 'Tangen', 'Vik', 'Wold'
  ];
  -- Must match src/lib/profile/study-fields.ts (STUDY_FIELDS) — that list is
  -- the only thing the profile form lets a real member pick, so seed data
  -- using anything else (e.g. NTNU program codes) wouldn't reflect real data.
  -- Repeated entries weight the draw, so a few fields dominate the ranking
  -- the way they do in reality instead of every bar coming out the same length.
  study_fields text[] := array[
    'Technology, Engineering and Architecture',
    'Technology, Engineering and Architecture',
    'Technology, Engineering and Architecture',
    'Technology, Engineering and Architecture',
    'Technology, Engineering and Architecture',
    'Information Technology and Informatics',
    'Information Technology and Informatics',
    'Information Technology and Informatics',
    'Information Technology and Informatics',
    'Mathematics and Natural Sciences',
    'Mathematics and Natural Sciences',
    'Mathematics and Natural Sciences',
    'Economics, Management and Administration',
    'Economics, Management and Administration',
    'Social Sciences and Psychology',
    'Social Sciences and Psychology',
    'Media Studies and Communication',
    'Health and Life Sciences',
    'Teacher Education and Pedagogy',
    'Humanities, Languages and Arts',
    'Law',
    'Other'
  ];
  -- Likewise weighted towards the later years of a five-year programme.
  study_year_pool integer[] := array[1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 5, 5, 5, 5, 5];
  organization record;
  ordinal integer := 0;
  member_count integer;
  member_index integer;
  counter integer := 0;
  new_person_id bigint;
  given_name text;
  family_name text;
  joined_on date;
  is_ended boolean;
  finished_on date;
  seeded_total integer := 0;
begin
  for organization in
    select id from public.organizations where status = 'active' order by id
  loop
    ordinal := ordinal + 1;
    member_count := 3 + (ordinal * 2) % 7;

    for member_index in 1..member_count loop
      counter := counter + 1;
      given_name := given_names[1 + (counter % array_length(given_names, 1))];
      family_name := family_names[1 + ((counter * 7) % array_length(family_names, 1))];

      -- Spread joins across the last 30 months so the growth chart has a shape.
      joined_on := (
        date_trunc('month', current_date)
        - make_interval(months => 29 - ((counter * 7) % 30))
      )::date;

      -- The first member of each organization always stays active.
      is_ended := member_index > 1 and (counter % 5) = 0;
      finished_on := least(
        (joined_on + make_interval(months => 6 + (counter % 12)))::date,
        current_date
      );

      insert into public.people (
        full_name, first_name, last_name, field_of_study, study_year, source
      ) values (
        given_name || ' ' || family_name,
        given_name,
        family_name,
        study_fields[1 + ((counter * 5) % array_length(study_fields, 1))],
        study_year_pool[1 + ((counter * 3) % array_length(study_year_pool, 1))],
        'manual'
      )
      returning id into new_person_id;

      -- Must exist before the membership insert: the memberships_require_email
      -- trigger rejects an active membership for a person with no email.
      insert into public.person_emails (
        person_id, email, email_type, is_primary, source
      ) values (
        new_person_id,
        format('member%s@statistics-seed.invalid', counter),
        'organization',
        true,
        'manual'
      );

      insert into public.memberships (
        person_id, organization_id, status, role, provisioning_method,
        joined_at, starts_on, ends_on, ended_at
      ) values (
        new_person_id,
        organization.id,
        case when is_ended then 'ended' else 'active' end,
        'member',
        'manual',
        joined_on::timestamptz,
        joined_on,
        case when is_ended then finished_on else null end,
        case when is_ended then finished_on::timestamptz else null end
      );

      seeded_total := seeded_total + 1;
    end loop;
  end loop;

  if ordinal = 0 then
    raise exception 'No active organizations found, so there is nothing to seed.';
  end if;

  raise notice 'Seeded % members across % organizations.', seeded_total, ordinal;
end $$;

commit;
