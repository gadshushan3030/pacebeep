-- PaceBeep data. Every row belongs to one user; every query filters by user_id.
--
-- Measured data and self-reports are kept apart on purpose:
--   runs         = what was recorded (by the phone, or entered manually)
--   run_feedback = how it felt (RPE, notes) – a self-report
--
-- Every write carries a caller-chosen request_id; replaying the same request
-- returns the existing row instead of creating a duplicate.

-- An interval workout plan: warmup, then `repeats` × (work, rest), then cooldown.
create table workouts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user" (id) on delete cascade,
  request_id text not null check (char_length(request_id) between 1 and 100),
  source text not null default 'app' check (source in ('app', 'assistant')),
  name text not null check (char_length(name) between 1 and 100),
  notes text check (char_length(notes) <= 1000),
  warmup_sec integer not null default 0 check (warmup_sec between 0 and 7200),
  repeats integer not null check (repeats between 1 and 50),
  work_sec integer not null check (work_sec between 5 and 3600),
  rest_sec integer not null default 0 check (rest_sec between 0 and 3600),
  cooldown_sec integer not null default 0 check (cooldown_sec between 0 and 7200),
  -- Optional target pace for the work intervals, seconds per km.
  target_pace_sec_per_km integer check (target_pace_sec_per_km between 120 and 1200),
  scheduled_for date,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default now(),
  unique (user_id, request_id)
);
create index workouts_user_idx on workouts (user_id, scheduled_for, created_at desc);

-- A run that happened. `intervals` holds planned vs. actual per segment:
-- [{ "kind": "warmup|work|rest|cooldown", "planned_sec": 60, "actual_sec": 62,
--    "distance_m": 250, "avg_pace_sec_per_km": 248 }]
create table runs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user" (id) on delete cascade,
  request_id text not null check (char_length(request_id) between 1 and 100),
  workout_id uuid references workouts on delete set null,
  source text not null check (source in ('device', 'manual')),
  started_at timestamptz not null,
  ended_at timestamptz not null check (ended_at >= started_at),
  distance_m integer check (distance_m between 0 and 1000000),
  intervals jsonb not null default '[]' check (jsonb_typeof(intervals) = 'array'),
  created_at timestamptz not null default clock_timestamp(),
  unique (user_id, request_id)
);
create index runs_user_time_idx on runs (user_id, started_at desc);

create table run_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references "user" (id) on delete cascade,
  request_id text not null check (char_length(request_id) between 1 and 100),
  run_id uuid not null references runs on delete cascade,
  -- Rate of perceived exertion, 1 (very easy) … 10 (max effort).
  rpe smallint check (rpe between 1 and 10),
  notes text check (char_length(notes) <= 1000),
  created_at timestamptz not null default clock_timestamp(),
  unique (user_id, request_id)
);
create index run_feedback_run_idx on run_feedback (run_id);
