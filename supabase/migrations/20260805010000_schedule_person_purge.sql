begin;

-- The 30-day retention promise has to keep itself. A portal administrator
-- who never opens Deleted users must not be the reason somebody's data is
-- still there on day 90, so the purge runs in the database rather than in a
-- request the app happens to make.
--
-- pg_cron is not relocatable: it must live in `pg_catalog`, and naming any
-- other schema fails outright. Scheduling is kept separate from the function
-- definitions so a database without the extension fails on this migration
-- alone, with the deletion behavior already in place.
create extension if not exists pg_cron;

-- Re-running the migration must not stack duplicate jobs.
select cron.unschedule(jobid)
from cron.job
where jobname = 'purge-expired-people';

select cron.schedule(
  'purge-expired-people',
  '17 3 * * *',
  $$ select private.purge_expired_people() $$
);

commit;
