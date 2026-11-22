-- Heart rate for a run, measured by a watch (issue #18). Per-interval heart rate lives in the
-- `intervals` jsonb next to pace (avg_hr, max_hr), so only the run's totals need columns.
-- Measured data, like distance: never filled in from a self-report.
alter table runs
  add column avg_hr smallint check (avg_hr between 30 and 250),
  add column max_hr smallint check (max_hr between 30 and 250),
  add constraint runs_max_hr_at_least_avg check (max_hr is null or avg_hr is null or max_hr >= avg_hr);
