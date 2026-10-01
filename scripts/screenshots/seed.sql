-- Sample training for the README screenshots, around today (Israel date), for the demo account
-- runner@example.test. Run against a local database only:
--   docker exec -i pacebeep-db psql -U postgres -d <db> < scripts/screenshots/seed.sql
with u as (select id from "user" where email = 'runner@example.test'),
d as (select (now() at time zone 'Asia/Jerusalem')::date as today)
insert into workouts (user_id, request_id, source, name, warmup_sec, repeats, work_sec, rest_sec, cooldown_sec, target_pace_sec_per_km, scheduled_for, notes)
select u.id, v.rid, 'assistant', v.name, v.wu, v.reps, v.work, v.rest, v.cd, v.pace, d.today + v.days, v.notes
from u, d, (values
  ('w0', 'Easy 30',          0, 1, 1800,  0,   0, 360, -5, null),
  ('w1', '6 × 2:00 / 1:00', 300, 6,  120, 60, 300, 270, -2, null),
  -- Today's: 13 minutes, the one to run in the simulator.
  ('w2', '5 × 1:00 / 1:00', 120, 5,   60, 60, 120, 255,  0, 'Fast but relaxed. Walk the rests.'),
  ('w3', 'Easy 30',          0, 1, 1800,  0,   0, 360,  2, null),
  ('w4', '6 × 2:00 / 1:00', 300, 6,  120, 60, 300, 265,  5, null)
) as v(rid, name, wu, reps, work, rest, cd, pace, days, notes)
on conflict do nothing;

-- Two past runs: one recorded by the phone, one told to the coach in chat.
with u as (select id from "user" where email = 'runner@example.test')
insert into runs (user_id, request_id, workout_id, source, started_at, ended_at, intervals)
select u.id, 'r1', w.id, 'device', (w.scheduled_for + time '07:12') at time zone 'Asia/Jerusalem', (w.scheduled_for + time '07:39:03') at time zone 'Asia/Jerusalem',
  (select jsonb_agg(iv) from (
     select jsonb_build_object('kind', 'warmup', 'planned_sec', 300, 'actual_sec', 300) as iv
     union all select jsonb_build_object('kind', k, 'planned_sec', s, 'actual_sec', s)
       from generate_series(1, 11) n, lateral (select case when n % 2 = 1 then 'work' else 'rest' end as k,
                                                       case when n % 2 = 1 then 120 else 60 end as s) x
     union all select jsonb_build_object('kind', 'cooldown', 'planned_sec', 300, 'actual_sec', 300)) t)
from u join workouts w on w.user_id = u.id and w.request_id = 'w1'
union all
select u.id, 'r0', w.id, 'manual', (w.scheduled_for + time '18:30') at time zone 'Asia/Jerusalem', (w.scheduled_for + time '19:01:10') at time zone 'Asia/Jerusalem', '[]'
from u join workouts w on w.user_id = u.id and w.request_id = 'w0'
on conflict do nothing;

insert into run_feedback (user_id, request_id, run_id, rpe, notes)
select r.user_id, 'f-' || r.request_id, r.id, case r.request_id when 'r1' then 7 else 4 end,
       case r.request_id when 'r1' then 'Legs heavy on the last two.' end
from runs r join "user" u on u.id = r.user_id
where u.email = 'runner@example.test' and r.request_id in ('r0', 'r1')
on conflict do nothing;
