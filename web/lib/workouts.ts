import * as z from "zod/v4";
import { sql } from "@/lib/db";

// Shared by the web UI (server actions) and the MCP tools. Every function takes the
// caller's user id and never touches another user's rows.

export const workoutFields = {
  name: z.string().trim().min(1).max(100),
  notes: z.string().max(1000).optional(),
  warmup_sec: z.number().int().min(0).max(7200).default(0),
  repeats: z.number().int().min(1).max(50),
  work_sec: z.number().int().min(5).max(3600),
  rest_sec: z.number().int().min(0).max(3600).default(0),
  cooldown_sec: z.number().int().min(0).max(7200).default(0),
  target_pace_sec_per_km: z.number().int().min(120).max(1200).optional().describe("Target pace for work intervals, seconds per km"),
  scheduled_for: z.iso.date().optional().describe("YYYY-MM-DD"),
};
export const workoutInput = z.object(workoutFields);
export type WorkoutInput = z.infer<typeof workoutInput>;

export const intervalInput = z.object({
  kind: z.enum(["warmup", "work", "rest", "cooldown"]),
  planned_sec: z.number().int().min(0).max(7200).optional(),
  actual_sec: z.number().int().min(0).max(7200),
  distance_m: z.number().int().min(0).max(100000).optional(),
  avg_pace_sec_per_km: z.number().int().min(60).max(3600).optional(),
});

export const runInput = z.object({
  workout_id: z.uuid().optional(),
  source: z.enum(["device", "manual"]).describe("device = recorded by the phone; manual = entered by hand or reported in chat"),
  started_at: z.iso.datetime({ offset: true }),
  ended_at: z.iso.datetime({ offset: true }),
  distance_m: z.number().int().min(0).max(1000000).optional(),
  intervals: z.array(intervalInput).max(200).default([]),
});
export type RunInput = z.infer<typeof runInput>;

type Table = "workouts" | "runs" | "run_feedback";

// Inserts once per (user, request_id). A replay returns the original id and changes nothing.
// Column names come from the zod schemas above, never from raw input.
async function insertOnce(table: Table, userId: string, requestId: string, values: Record<string, unknown>) {
  const cols = Object.keys(values).filter((c) => values[c] !== undefined);
  const [row] = await sql<{ id: string }>(
    `insert into ${table} (user_id, request_id, ${cols.join(", ")})
     values ($1, $2, ${cols.map((_, i) => `$${i + 3}`).join(", ")})
     on conflict (user_id, request_id) do nothing returning id`,
    [userId, requestId, ...cols.map((c) => values[c])],
  );
  if (row) return { id: row.id, created: true };
  const [existing] = await sql<{ id: string }>(`select id from ${table} where user_id = $1 and request_id = $2`, [userId, requestId]);
  return { id: existing.id, created: false };
}

async function assertOwned(table: "workouts" | "runs", userId: string, id: string) {
  const [row] = await sql(`select 1 from ${table} where id = $1 and user_id = $2`, [id, userId]);
  if (!row) throw new Error(`${table === "workouts" ? "workout" : "run"} not found`);
}

export function createWorkout(userId: string, requestId: string, input: WorkoutInput, source: "app" | "assistant") {
  return insertOnce("workouts", userId, requestId, { ...input, source });
}

export async function updateWorkout(userId: string, workoutId: string, patch: Partial<WorkoutInput>) {
  const cols = Object.keys(patch).filter((c) => patch[c as keyof WorkoutInput] !== undefined);
  if (!cols.length) throw new Error("nothing to update");
  const [row] = await sql<{ id: string }>(
    `update workouts set ${cols.map((c, i) => `${c} = $${i + 3}`).join(", ")}, updated_at = now()
     where id = $1 and user_id = $2 returning id`,
    [workoutId, userId, ...cols.map((c) => patch[c as keyof WorkoutInput])],
  );
  if (!row) throw new Error("workout not found");
  return row.id;
}

export async function deleteWorkout(userId: string, workoutId: string) {
  await sql("delete from workouts where id = $1 and user_id = $2", [workoutId, userId]);
}

export async function recordRun(userId: string, requestId: string, input: RunInput) {
  if (input.workout_id) await assertOwned("workouts", userId, input.workout_id);
  return insertOnce("runs", userId, requestId, { ...input, intervals: JSON.stringify(input.intervals) });
}

export async function addRunFeedback(userId: string, requestId: string, runId: string, rpe?: number, notes?: string) {
  await assertOwned("runs", userId, runId);
  return insertOnce("run_feedback", userId, requestId, { run_id: runId, rpe, notes });
}

export type Workout = WorkoutInput & { id: string; source: string; created_at: Date };

export function listWorkouts(userId: string, limit = 50) {
  return sql<Workout>(
    `select id, source, name, notes, warmup_sec, repeats, work_sec, rest_sec, cooldown_sec,
            target_pace_sec_per_km, scheduled_for, created_at
     from workouts where user_id = $1
     order by scheduled_for nulls last, created_at desc limit $2`,
    [userId, limit],
  );
}

// From `fromDate` (YYYY-MM-DD) on, then unscheduled ones; `done` = a run was recorded for it.
export function upcomingWorkouts(userId: string, fromDate: string, limit = 30) {
  return sql<Workout & { done: boolean }>(
    `select w.id, w.name, w.notes, w.warmup_sec, w.repeats, w.work_sec, w.rest_sec, w.cooldown_sec,
            w.target_pace_sec_per_km, w.scheduled_for,
            exists (select 1 from runs r where r.workout_id = w.id) as done
     from workouts w where w.user_id = $1 and (w.scheduled_for >= $2 or w.scheduled_for is null)
     order by w.scheduled_for nulls last, w.created_at desc limit $3`,
    [userId, fromDate, limit],
  );
}

export async function getWorkout(userId: string, workoutId: string) {
  const [w] = await sql<Workout>("select * from workouts where id = $1 and user_id = $2", [workoutId, userId]);
  if (!w) throw new Error("workout not found");
  return w;
}

export type Run = {
  id: string;
  workout_id: string | null;
  workout_name: string | null;
  source: string;
  started_at: Date;
  ended_at: Date;
  distance_m: number | null;
  intervals: z.infer<typeof intervalInput>[];
};

// With the latest RPE the runner gave each run.
export function listRuns(userId: string, limit = 20) {
  return sql<Run & { rpe: number | null }>(
    `select r.id, r.workout_id, w.name as workout_name, r.source, r.started_at, r.ended_at, r.distance_m, r.intervals,
            (select f.rpe from run_feedback f where f.run_id = r.id and f.rpe is not null order by f.created_at desc limit 1) as rpe
     from runs r left join workouts w on w.id = r.workout_id
     where r.user_id = $1 order by r.started_at desc limit $2`,
    [userId, limit],
  );
}

// Workouts scheduled from `from` to `to` (YYYY-MM-DD), each with its latest run's RPE when done.
export function weekWorkouts(userId: string, from: string, to: string) {
  return sql<Workout & { done: boolean; rpe: number | null }>(
    `select w.*, r.id is not null as done, f.rpe
     from workouts w
     left join lateral (select id from runs where workout_id = w.id order by started_at desc limit 1) r on true
     left join lateral (select rpe from run_feedback where run_id = r.id and rpe is not null order by created_at desc limit 1) f on true
     where w.user_id = $1 and w.scheduled_for between $2 and $3
     order by w.scheduled_for, w.created_at`,
    [userId, from, to],
  );
}

export async function getRun(userId: string, runId: string) {
  const [run] = await sql<Run>(
    `select r.id, r.workout_id, w.name as workout_name, r.source, r.started_at, r.ended_at, r.distance_m, r.intervals
     from runs r left join workouts w on w.id = r.workout_id
     where r.id = $1 and r.user_id = $2`,
    [runId, userId],
  );
  if (!run) throw new Error("run not found");
  const feedback = await sql<{ id: string; rpe: number | null; notes: string | null; created_at: Date }>(
    "select id, rpe, notes, created_at from run_feedback where run_id = $1 and user_id = $2 order by created_at",
    [runId, userId],
  );
  return { ...run, feedback };
}

export async function summary(userId: string) {
  const [[stats], upcoming] = await Promise.all([
    sql<{ workouts: number; runs_7d: number; runs_30d: number; distance_30d_m: number; seconds_30d: number; last_run_at: Date | null }>(
      `select (select count(*)::int from workouts where user_id = $1) as workouts,
              count(*) filter (where started_at > now() - interval '7 days')::int as runs_7d,
              count(*) filter (where started_at > now() - interval '30 days')::int as runs_30d,
              coalesce(sum(distance_m) filter (where started_at > now() - interval '30 days'), 0)::int as distance_30d_m,
              coalesce(sum(extract(epoch from ended_at - started_at)) filter (where started_at > now() - interval '30 days'), 0)::int as seconds_30d,
              max(started_at) as last_run_at
       from runs where user_id = $1`,
      [userId],
    ),
    sql<Workout>(
      `select id, name, scheduled_for, repeats, work_sec, rest_sec from workouts
       where user_id = $1 and scheduled_for >= current_date order by scheduled_for limit 7`,
      [userId],
    ),
  ]);
  return { ...stats, upcoming };
}

export const fmtDuration = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

// Day first, like the design: "Tue 29 Sep". en-GB's data spells September "Sept" (every other
// month has three letters), so it is shortened to match.
export const formatDate = (d: Date | string, opts: Intl.DateTimeFormatOptions) =>
  new Date(d).toLocaleDateString("en-GB", opts).replace("Sept", "Sep");

// 7080 → "1:58" (hours:minutes)
export const fmtHours = (sec: number) => `${Math.floor(sec / 3600)}:${String(Math.floor((sec % 3600) / 60)).padStart(2, "0")}`;

export const totalSec = (w: Pick<Workout, "warmup_sec" | "repeats" | "work_sec" | "rest_sec" | "cooldown_sec">) =>
  w.warmup_sec + w.repeats * w.work_sec + (w.repeats - 1) * w.rest_sec + w.cooldown_sec;

// "4:30 /km · 13.3 km/h": the speed is what a treadmill takes.
export const fmtPace = (secPerKm: number) => `${fmtDuration(secPerKm)} /km · ${(3600 / secPerKm).toFixed(1)} km/h`;

export const describeWorkout = (w: Pick<Workout, "repeats" | "work_sec" | "rest_sec">) =>
  `${w.repeats} × ${fmtDuration(w.work_sec)} / ${fmtDuration(w.rest_sec)} rest`;
