import { createHash } from "node:crypto";
import * as z from "zod/v4";
import { sql, today } from "@/lib/db";

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
  location: z.enum(["outdoor", "indoor"]).optional().describe("Where the runs happen; default outdoor. indoor = treadmill: the Watch estimates distance without GPS"),
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

// Beats per minute, from a watch. Measured, never estimated.
const bpm = z.number().int().min(30).max(250);

export const intervalInput = z.object({
  kind: z.enum(["warmup", "work", "rest", "cooldown", "set"]),
  planned_sec: z.number().int().min(0).max(7200).optional(),
  actual_sec: z.number().int().min(0).max(7200),
  distance_m: z.number().int().min(0).max(100000).optional(),
  avg_pace_sec_per_km: z.number().int().min(60).max(3600).optional(),
  avg_hr: bpm.optional(),
  max_hr: bpm.optional(),
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
  avg_hr: bpm.optional().describe("Average heart rate over the run, from a watch"),
  max_hr: bpm.optional().describe("Highest heart rate in the run, from a watch"),
  intervals: z.array(intervalInput).max(200).default([]),
});
export type RunInput = z.infer<typeof runInput>;

// An error the caller caused, with the HTTP status an API route answers.
export class ClientError extends Error {
  status: 400 | 404 | 409;
  constructor(message: string, status: 400 | 404 | 409) {
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

// A workout is one kind: blocks (a full workout), or repeats and work_sec (an interval run).
const oneKind = (w: WorkoutInput) => !w.blocks !== (w.repeats == null || w.work_sec == null);
const oneKindMessage = "give either blocks (a full workout) or repeats and work_sec (an interval run)";

export function createWorkout(userId: string, requestId: string, input: WorkoutInput, source: "app" | "assistant") {
  if (!oneKind(input)) throw new Error(oneKindMessage);
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

// The shape of a plan and its limits, as told to a chat (planPrompt) and to the reader of a coach
// link (lib/coach-link.ts). The example is one line on purpose: an assistant copies its style, and
// a 27-workout plan written this way fits in one or two chat messages.
export const planShape = (today: string) => `[{"name":"W1 D1 · Run 1:00 / Walk 1:30","scheduled_for":"${today}","warmup_sec":300,"repeats":8,"work_sec":60,"rest_sec":90,"cooldown_sec":300,"notes":"Easy pace: you should be able to talk."}]

Rules:
- Every workout is: warmup, then repeats × (work, then rest), then cooldown. All times are whole seconds.
- Run-walk: work is the run, rest is the walk. A steady run is "repeats": 1 with "rest_sec": 0.
- Limits: repeats 1-50, work_sec 5-3600, rest_sec 0-3600, warmup_sec and cooldown_sec 0-7200. At most 60 workouts.
- name: short, at most 100 characters. notes: optional, at most 1000 characters.
- scheduled_for: the day, YYYY-MM-DD, today or later. Give one to every workout. Optional "scheduled_time": "HH:MM" for a reminder at that time.
- Optional: "target_pace_sec_per_km" (120-1200), and "location": "indoor" for a treadmill.
- Plain JSON only: no comments, no trailing commas. Compact is best; line breaks do not matter.`;

// A plan without MCP: the runner gives this prompt to any chat, and pastes the answer into the app
// or the dashboard (importPlan). It lives on the server so it can improve without an app release.
const promptStart = "You are writing a training plan for PaceBeep";
export const planPrompt = (today: string) => `${promptStart}, an iPhone interval timer that beeps at every change.
Today is ${today}. If I haven't told you my goal yet, first ask me: my goal, how many days a week, which weekdays, and when to start.

Then answer with ONE JSON code block: a list of workouts in exactly this shape.

${planShape(today)}

I will copy the code block and paste it into PaceBeep.`;

const planInput = z.array(workoutInput.refine(oneKind, oneKindMessage)).min(1).max(60);

// What the chat answered, as the runner copied it: a JSON list of workouts (or { workouts: [...] },
// or one workout), with or without the chat's words and code fence around it.
export function parsePlan(text: string) {
  // The prompt's own example would pass as a one-workout plan (Copy, then Paste, without a chat in between).
  if (text.includes(promptStart)) throw new ClientError("That is the prompt itself. Send it to a chat, then copy only the chat's answer and paste it.", 400);
  let data: unknown;
  try {
    data = JSON.parse(text.slice(text.search(/[[{]/), Math.max(text.lastIndexOf("]"), text.lastIndexOf("}")) + 1));
  } catch {
    throw new ClientError("No plan found. Copy the whole code block your chat wrote and paste it again.", 400);
  }
  const parsed = planInput.safeParse(Array.isArray(data) ? data : ((data as { workouts?: unknown }).workouts ?? [data]));
  // Readable by the runner, and by the chat when they paste it back to have the plan fixed.
  if (!parsed.success) throw new ClientError(z.prettifyError(parsed.error), 400);
  return parsed.data;
}

// Stores a plan. Pasted by the runner ("app") it is approved: they chose it themselves. Sent over a
// coach link ("assistant") it waits for their approval, like any coach's. Each request id comes
// from that workout's content, so a workout sent twice (a double tap, a retry, a plan re-sent with
// one week changed) is stored once.
// - Workouts dated before today are left out (`past` counts them) and a plan with nothing else is
//   refused: stored, they would show nowhere in the app, next to "Added 27 workouts".
// - `created`: the ids this call stored, which is what Undo removes.
// - `earlier`: workouts from a plan pasted before that are still ahead and not run. Next to a new
//   plan they are usually leftovers ("make week 3 easier"), and the runner can drop them in one go.
export async function importPlan(userId: string, text: string, source: "app" | "assistant" = "app") {
  const all = parsePlan(text);
  // Yesterday still passes: the server's day is Israel's, and a runner west of it is a day behind.
  const from = today(new Date(Date.now() - 86_400_000));
  const plan = all.filter((w) => !w.scheduled_for || w.scheduled_for >= from);
  if (!plan.length) throw new ClientError(`Every workout in this plan is dated before today (${today()}). Ask for the plan again, starting today or later.`, 400);
  const ids: string[] = [];
  const created: string[] = [];
  for (const workout of plan) {
    const key = createHash("sha256").update(JSON.stringify(workout)).digest("hex").slice(0, 24);
    const w = await createWorkout(userId, `plan-${key}`, workout, source);
    ids.push(w.id);
    if (w.created) created.push(w.id);
  }
  const earlier =
    source === "app" && created.length
      ? await sql<{ id: string }>(
          `select id from workouts w where user_id = $1 and source = 'app' and request_id like 'plan-%'
             and (scheduled_for >= $2 or scheduled_for is null) and id <> all($3::uuid[])
             and not exists (select 1 from runs where workout_id = w.id)`,
          [userId, from, ids],
        )
      : [];
  return { workouts: plan.length, past: all.length - plan.length, created, earlier: earlier.map((w) => w.id) };
}

// Undo of a pasted plan, or dropping an earlier one: each workout as a single delete would, so one
// with a run stays. Returns how many went.
export async function deleteWorkouts(userId: string, ids: string[]) {
  let removed = 0;
  for (const id of ids) {
    removed += await deleteWorkout(userId, id).then(() => 1, (e) => { if (e instanceof ClientError) return 0; throw e; });
  }
  return removed;
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

// Deletes a planned workout. A workout with a run stays: runs are history and keep its name (409).
export async function deleteWorkout(userId: string, workoutId: string) {
  const [row] = await sql<{ id: string }>(
    `delete from workouts w where id = $1 and user_id = $2
       and not exists (select 1 from runs where workout_id = w.id) returning id`,
    [workoutId, userId],
  );
  if (row) return row.id;
  await assertOwned("workouts", userId, workoutId).catch(() => {
    throw new ClientError("workout not found", 404);
  });
  throw new ClientError("workout has a run; runs are never deleted", 409);
}

export async function recordRun(userId: string, requestId: string, input: RunInput) {
  // Checked here, not in runInput: zod 4 cannot .omit() (the app's route) a refined schema.
  if (input.avg_hr != null && input.max_hr != null && input.max_hr < input.avg_hr) throw new ClientError("max_hr is below avg_hr", 400);
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
            target_pace_sec_per_km, blocks, location, scheduled_for, scheduled_time, status, created_at
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
    `select w.id, w.source, w.name, w.notes, w.warmup_sec, w.repeats, w.work_sec, w.rest_sec, w.cooldown_sec,
            w.target_pace_sec_per_km, w.blocks, w.location, w.scheduled_for, w.scheduled_time, w.status,
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
  avg_hr: number | null;
  max_hr: number | null;
  intervals: z.infer<typeof intervalInput>[];
};

// With the latest RPE the runner gave each run.
export function listRuns(userId: string, limit = 20) {
  return sql<Run & { rpe: number | null }>(
    `select r.id, r.workout_id, w.name as workout_name, r.source, r.started_at, r.ended_at, r.distance_m, r.avg_hr, r.max_hr, r.intervals,
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
    `select r.id, r.workout_id, w.name as workout_name, r.source, r.started_at, r.ended_at, r.distance_m, r.avg_hr, r.max_hr, r.intervals
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
      `select id, name, scheduled_for, scheduled_time, status, repeats, work_sec, rest_sec, blocks, location from workouts
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
