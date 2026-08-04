begin;

-- The first query to embed membership_periods under memberships failed on the
-- deployed project with "Could not find a relationship between 'memberships'
-- and 'membership_periods' in the schema cache", while the same query resolved
-- against a freshly reset local database. The foreign key and the grants are
-- identical in both, so the deployed PostgREST was holding a schema cache from
-- before membership_periods existed. This tells it to rebuild.
notify pgrst, 'reload schema';

commit;
