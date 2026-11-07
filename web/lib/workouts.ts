import * as z from "zod/v4";
import { sql } from "@/lib/db";

// Shared by the web UI (server actions) and the MCP tools. Every function takes the
// caller's user id and never touches another user's rows.

// An interval run: warmup, then `repeats` × (work, rest), then cooldown.
const runFields = {
  warmup_sec: z.number().int().min(0).max(7200).default(0),
  repeats: z.number().int().min(1).max(50),
  work_sec: z.number().int().min(5).max(3600),
  rest_sec: z.number().int().min(0).max(3600).default(0),
  cooldown_sec: z.number().int().min(0).max(7200).default(0),
  target_pace_sec_per_km: z.number().int().min(120).max(1200).optional().describe("Target pace for work intervals, seconds per km"),
};

const setInput = z
  .object({
    reps: z.number().int().min(1).max(100).optional(),
    seconds: z.number().int().min(5).max(3600).optional().describe("A timed set (plank, hang): counted down with beeps instead of reps"),
    weight_kg: z.number().min(0).max(500).optional().describe("Leave out for bodyweight"),
  })
  .refine((s) => (s.reps == null) !== (s.seconds == null), "a set has reps or seconds");
export type SetInput = z.infer<typeof setInput>;

export const blockInput = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("strength"),
    exercise: z.string().trim().min(1).max(100).describe('Use the same name every time ("Lat pulldown"), so runs can be compared'),
    sets: z.array(setInput).min(1).max(20).describe("In order; each set can have its own reps and weight (a pyramid)"),
    rest_sec: z.number().int().min(0).max(600).default(90).describe("Rest after each set, also before the next block"),
    notes: z.string().max(300).optional(),
  }),
  z.object({ type: z.literal("run"), ...runFields }),
]);
export type Block = z.infer<typeof blockInput>;

export const workoutFields = {
  name: z.string().trim().min(1).max(100),
  notes: z.string().max(1000).optional(),
  ...runFields,
  repeats: runFields.repeats.optional().describe("Interval run only; leave out when giving blocks"),
  work_sec: runFields.work_sec.optional().describe("Interval run only; leave out when giving blocks"),
  blocks: z.array(blockInput).min(1).max(30).optional().describe("A full workout, played in order: strength exercises and runs"),
  scheduled_for: z.iso.date().optional().describe("YYYY-MM-DD"),
  scheduled_time: z.iso.time({ precision: -1 }).optional().describe("HH:MM, the runner's local time of day; the phone reminds them then"),
};
// The time check is repeated by the migration's workouts_time_needs_date, which also covers updates.
export const workoutInput = z
  .object(workoutFields)
  .refine((w) => !w.scheduled_time || w.scheduled_for, { path: ["scheduled_time"], message: "scheduled_time needs a scheduled_for date" });
export type WorkoutInput = z.infer<typeof workoutInput>;
// For updates. Without the defaults: zod 4 applies them inside .partial() too, so changing only
// the date would have reset the warmup, rest and cooldown to 0.
export const workoutChanges = z
  .object({
    ...workoutFields,
    warmup_sec: runFields.warmup_sec.unwrap(),
    rest_sec: runFields.rest_sec.unwrap(),
    cooldown_sec: runFields.cooldown_sec.unwrap(),
  })
  .partial();

export const intervalInput = z.object({
  kind: z.enum(["warmup", "work", "rest", "cooldown", "set"]),
  planned_sec: z.number().int().min(0).max(7200).optional(),
  actual_sec: z.number().int().min(0).max(7200),
  distance_m: z.number().int().min(0).max(100000).optional(),
  avg_pace_sec_per_km: z.number().int().min(60).max(3600).optional(),
  // A strength set: what was planned and what was done.
  exercise: z.string().max(100).optional(),
  planned_reps: z.number().int().min(0).max(1000).optional(),
  reps: z.number().int().min(0).max(1000).optional(),
  planned_weight_kg: z.number().min(0).max(1000).optional(),
  weight_kg: z.number().min(0).max(1000).optional(),
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

// An error the caller caused, with the HTTP status an API route answers.
export class ClientError extends Error {
  status: 400 | 404;
  constructor(message: string, status: 400 | 404) {
    super(message);
    this.status = status;
  }
}

// The migration's check: a time of day only makes sense on a day.
function timeNeedsDate(error: unknown): never {
  if ((error as { constraint?: string }).constraint === "workouts_time_needs_date") {
    throw new ClientError("scheduled_time needs a scheduled_for date", 400);
  }
  throw error;
}

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
  if (!input.blocks === (input.repeats == null || input.work_sec == null)) {
    throw new Error("give either blocks (a full workout) or repeats and work_sec (an interval run)");
  }
  // pg sends a JS array as a Postgres array, not JSON. The coach's workouts wait for the runner's
  // approval in the app; the runner's own are approved as they are.
  const status = source === "assistant" ? "pending" : "approved";
  return insertOnce("workouts", userId, requestId, { ...input, blocks: input.blocks && JSON.stringify(input.blocks), source, status }).catch(timeNeedsDate);
}

// A new account starts with these, so the app has something to play before an assistant is
// connected (an App Store reviewer included). Unscheduled, so they never fall off the app's list;
// created oldest first because the app shows unscheduled workouts newest first.
const starterWorkouts: WorkoutInput[] = [
  { name: "Easy 20", warmup_sec: 0, repeats: 1, work_sec: 1200, rest_sec: 0, cooldown_sec: 0 },
  { name: "6 × 1:00 / 1:00", warmup_sec: 300, repeats: 6, work_sec: 60, rest_sec: 60, cooldown_sec: 300 },
  {
    name: "First intervals", warmup_sec: 60, repeats: 3, work_sec: 30, rest_sec: 30, cooldown_sec: 60,
    notes: "A short one to try: a beep at every change, also with the screen locked.",
  },
];

export async function addStarterWorkouts(userId: string) {
  for (const [i, workout] of starterWorkouts.entries()) await createWorkout(userId, `starter-${i}`, workout, "app");
}

// Returns the id and the columns whose value actually changed. A change by the coach ("assistant")
// goes back to the runner for approval; the same values again change nothing and leave the status.
export async function updateWorkout(userId: string, workoutId: string, changes: Partial<WorkoutInput>, source: "app" | "assistant") {
  // Blocks turn a workout into a full workout and repeats/work_sec back into an interval run;
  // whichever was given clears the other.
  const values: Record<string, unknown> = changes.blocks
    ? { ...changes, repeats: null, work_sec: null, blocks: JSON.stringify(changes.blocks) }
    : changes.repeats != null || changes.work_sec != null
      ? { ...changes, blocks: null }
      : changes;
  const cols = Object.keys(values).filter((c) => values[c] !== undefined);
  if (!cols.length) throw new Error("nothing to update");
  // The self-join keeps the old row in reach: SET and the status comparison see w (old values),
  // RETURNING sees the new ones and compares them with old.
  const params = cols.map((_, i) => `$${i + 3}`);
  const [row] = await sql<{ id: string; changed: string[] }>(
    `update workouts w set ${cols.map((c, i) => `${c} = ${params[i]}`).join(", ")}, updated_at = now(),
       status = case when $${cols.length + 3} = 'assistant' and (${cols.map((c) => `w.${c}`).join(", ")}) is distinct from (${params.join(", ")})
                     then 'pending' else w.status end
     from workouts old where old.id = w.id and w.id = $1 and w.user_id = $2
     returning w.id, array_remove(array[${cols.map((c) => `case when w.${c} is distinct from old.${c} then '${c}' end`).join(", ")}], null) as changed`,
    [workoutId, userId, ...cols.map((c) => values[c]), source],
  ).catch(timeNeedsDate);
  if (!row) throw new ClientError("workout not found", 404);
  return row;
}

// The runner approves a workout the coach planned, optionally moving it to another time of day.
export async function approveWorkout(userId: string, workoutId: string, scheduledTime?: string) {
  const [row] = await sql<{ id: string }>(
    `update workouts set status = 'approved', scheduled_time = coalesce($3, scheduled_time), updated_at = now()
     where id = $1 and user_id = $2 returning id`,
    [workoutId, userId, scheduledTime],
  ).catch(timeNeedsDate);
  if (!row) throw new ClientError("workout not found", 404);
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

export type Workout = WorkoutInput & { id: string; source: string; status: "pending" | "approved"; created_at: Date };

export function listWorkouts(userId: string, limit = 50) {
  return sql<Workout>(
    `select id, source, name, notes, warmup_sec, repeats, work_sec, rest_sec, cooldown_sec,
            target_pace_sec_per_km, blocks, scheduled_for, scheduled_time, status, created_at
     from workouts where user_id = $1
     order by scheduled_for nulls last, created_at desc limit $2`,
    [userId, limit],
  );
}

// From `fromDate` (YYYY-MM-DD) on, then unscheduled ones; `done` = a run was recorded for it.
// Full workouts only when asked for: an app from before them decodes the whole list as interval
// runs, and one workout without `repeats` would empty it.
export function upcomingWorkouts(userId: string, fromDate: string, withBlocks: boolean, limit = 30) {
  return sql<Workout & { done: boolean }>(
    `select w.id, w.name, w.notes, w.warmup_sec, w.repeats, w.work_sec, w.rest_sec, w.cooldown_sec,
            w.target_pace_sec_per_km, w.blocks, w.scheduled_for, w.scheduled_time, w.status,
            exists (select 1 from runs r where r.workout_id = w.id) as done
     from workouts w where w.user_id = $1 and (w.scheduled_for >= $2 or w.scheduled_for is null)
       and ($3 or w.blocks is null)
     order by w.scheduled_for nulls last, w.created_at desc limit $4`,
    [userId, fromDate, withBlocks, limit],
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
      `select id, name, scheduled_for, scheduled_time, status, repeats, work_sec, rest_sec, blocks from workouts
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

type IntervalRun = Pick<Workout, "warmup_sec" | "repeats" | "work_sec" | "rest_sec" | "cooldown_sec">;
const runSec = (w: IntervalRun) => w.warmup_sec + (w.repeats ?? 0) * (w.work_sec ?? 0) + ((w.repeats ?? 1) - 1) * w.rest_sec + w.cooldown_sec;
// A set done by reps has no planned time; 45 s is only a guess, for a rough total.
const blockSec = (b: Block) => (b.type === "run" ? runSec(b) : b.sets.reduce((t, s) => t + (s.seconds ?? 45) + b.rest_sec, 0));

export const totalSec = (w: IntervalRun & { blocks?: Block[] | null }) => (w.blocks ? w.blocks.reduce((t, b) => t + blockSec(b), 0) : runSec(w));

// "4:30 /km · 13.3 km/h": the speed is what a treadmill takes.
export const fmtPace = (secPerKm: number) => `${fmtDuration(secPerKm)} /km · ${(3600 / secPerKm).toFixed(1)} km/h`;

export const describeWorkout = (w: Pick<Workout, "repeats" | "work_sec" | "rest_sec">) =>
  `${w.repeats} × ${fmtDuration(w.work_sec ?? 0)} / ${fmtDuration(w.rest_sec)} rest`;

// "10 @ 50 kg", "0:45"
export const fmtSet = (s: { reps?: number; seconds?: number; weight_kg?: number }) =>
  (s.seconds != null ? fmtDuration(s.seconds) : `${s.reps ?? 0}`) + (s.weight_kg != null ? ` @ ${s.weight_kg} kg` : "");

// "Lat pulldown 4 × 10 @ 50 kg", "Bench press 12 @ 40 kg, 10 @ 45 kg", "Run 6 × 1:00 / 1:00 rest"
export function describeBlock(b: Block) {
  if (b.type === "run") return `Run ${describeWorkout(b)}`;
  const sets = b.sets.map(fmtSet);
  return `${b.exercise} ${sets.every((s) => s === sets[0]) ? `${sets.length} × ${sets[0]}` : sets.join(", ")}`;
}
