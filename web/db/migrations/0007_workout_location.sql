-- Where a workout's runs happen (issue #18): the Watch records an indoor run (a treadmill) without
-- GPS, estimating distance from the wrist. Null = outdoor, as before.
alter table workouts
  add column location text check (location in ('outdoor', 'indoor'));
