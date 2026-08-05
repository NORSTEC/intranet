begin;

-- Kept apart from the function for the same reason the purge schedule is: a
-- database without pg_cron then fails on this migration alone, with the
-- deletion behavior already in place.
create extension if not exists pg_cron;

-- Re-running the migration must not stack duplicate jobs.
select cron.unschedule(jobid)
from cron.job
where jobname = 'discard-abandoned-visitors';

-- Half an hour after the purge, so the two never contend for the same rows.
select cron.schedule(
  'discard-abandoned-visitors',
  '47 3 * * *',
  $$ select private.discard_abandoned_visitors() $$
);

commit;
