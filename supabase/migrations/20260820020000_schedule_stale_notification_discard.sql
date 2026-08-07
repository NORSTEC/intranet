begin;

-- Kept apart from the function for the same reason the purge and the
-- abandoned-visitor schedules are: a database without pg_cron then fails on
-- this migration alone, with the queue itself already in place.
create extension if not exists pg_cron;

-- Re-running the migration must not stack duplicate jobs.
select cron.unschedule(jobid)
from cron.job
where jobname = 'discard-stale-notifications';

-- After the other two nightly jobs, so none of them contend.
select cron.schedule(
  'discard-stale-notifications',
  '17 4 * * *',
  $$ select private.discard_stale_notifications() $$
);

commit;
