-- A full workout: an ordered list of blocks (strength exercises, interval runs) in `blocks`,
-- played in order by the app. A plain interval run keeps using the flat columns, so those
-- become optional:
-- [{ "type": "strength", "exercise": "Lat pulldown", "sets": [{ "reps": 10, "weight_kg": 50 }], "rest_sec": 90 },
--  { "type": "run", "warmup_sec": 300, "repeats": 6, "work_sec": 60, "rest_sec": 60, "cooldown_sec": 300 }]
alter table workouts
  add column blocks jsonb check (jsonb_typeof(blocks) = 'array'),
  alter column repeats drop not null,
  alter column work_sec drop not null,
  add constraint workouts_shape check (blocks is not null or (repeats is not null and work_sec is not null));
