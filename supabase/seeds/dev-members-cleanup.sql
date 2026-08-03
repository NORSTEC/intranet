-- Removes everything dev-members.sql created, identified by the reserved
-- @statistics-seed.invalid email domain. Real members are never touched,
-- because a real address can never end in .invalid (RFC 2606).

begin;

create temporary table seeded_people on commit drop as
select distinct person_id as id
from public.person_emails
where email like '%@statistics-seed.invalid';

create temporary table seeded_memberships on commit drop as
select id from public.memberships where person_id in (select id from seeded_people);

delete from public.profile_experience_roles
where experience_id in (
  select id from public.profile_experiences
  where membership_id in (select id from seeded_memberships)
);

delete from public.profile_experiences
where membership_id in (select id from seeded_memberships);

-- public.membership_periods is created by a migration that some deployed
-- databases never actually applied, so only touch it when it is really there.
-- EXECUTE keeps the statement unparsed when the table is missing; a plain
-- DELETE would fail at parse time with 42P01 even inside a false branch.
do $$
begin
  if to_regclass('public.membership_periods') is not null then
    execute '
      delete from public.membership_periods
      where membership_id in (select id from seeded_memberships)
    ';
  end if;
end $$;

delete from public.team_memberships where person_id in (select id from seeded_people);

delete from public.memberships where id in (select id from seeded_memberships);

delete from public.person_emails where person_id in (select id from seeded_people);

delete from public.people where id in (select id from seeded_people);

do $$
begin
  raise notice 'Seeded members removed.';
end $$;

commit;
