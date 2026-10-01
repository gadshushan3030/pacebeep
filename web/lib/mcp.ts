import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import {
  addRunFeedback,
  createWorkout,
  getRun,
  getWorkout,
  listRuns,
  listWorkouts,
  recordRun,
  runInput,
  summary,
  updateWorkout,
  workoutFields,
  workoutInput,
} from "@/lib/workouts";

const INSTRUCTIONS = `PaceBeep: interval running. You coach the signed-in runner.

- get_summary first: recent runs and upcoming workouts.
- Workouts are plans: warmup, repeats × (work, rest), cooldown, optional target pace (seconds per km) and date.
- The runner's iPhone app shows workouts scheduled for today or later (and unscheduled ones) and plays them as timed intervals with beeps, so plan by time: warmup_sec, work_sec, rest_sec, cooldown_sec. It works on a treadmill too.
- Runs are what happened. source "device" = recorded by the phone; "manual" = the runner told you. Never invent measurements.
- run feedback (RPE 1-10, notes) is the runner's self-report; keep it separate from measured data.
- Every write takes request_id: generate a new UUID per logical save and reuse it when retrying; replays never duplicate.
- Every write returns an id; read it back with get_workout / get_run to confirm.`;

const requestId = z
  .string()
  .min(8)
  .max(100)
  .describe("A UUID you generate for this save. Reuse the same value on retry so nothing is stored twice.");

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });

// One server per request, bound to the user behind the verified OAuth token.
// Errors thrown here reach the assistant as tool errors.
export function buildServer(userId: string) {
  const server = new McpServer({ name: "pacebeep", version: "0.1.0" }, { instructions: INSTRUCTIONS });

  server.registerTool(
    "get_summary",
    {
      title: "Training summary",
      description: "Run counts and distance for the last 7/30 days, last run time, and upcoming scheduled workouts.",
      inputSchema: z.object({}),
      annotations: READ,
    },
    async () => json(await summary(userId)),
  );

  server.registerTool(
    "list_workouts",
    {
      title: "List workouts",
      description: "Workout plans, scheduled ones first by date.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(100).default(20) }),
      annotations: READ,
    },
    async ({ limit }) => json(await listWorkouts(userId, limit)),
  );

  server.registerTool(
    "get_workout",
    { title: "Read a workout", description: "One workout plan by id.", inputSchema: z.object({ workout_id: z.uuid() }), annotations: READ },
    async ({ workout_id }) => json(await getWorkout(userId, workout_id)),
  );

  server.registerTool(
    "create_workout",
    {
      title: "Create a workout",
      description: "Creates an interval workout plan and returns workout_id.",
      inputSchema: workoutInput.extend({ request_id: requestId }),
      annotations: WRITE,
    },
    async ({ request_id, ...input }) => {
      const { id, created } = await createWorkout(userId, request_id, input, "assistant");
      return json({ workout_id: id, already_existed: !created, verify_with: "get_workout" });
    },
  );

  server.registerTool(
    "plan_week",
    {
      title: "Plan several workouts",
      description: "Creates several scheduled workouts at once (each with its own request_id and scheduled_for). Returns their ids.",
      inputSchema: z.object({
        workouts: z.array(workoutInput.extend({ request_id: requestId, scheduled_for: workoutFields.scheduled_for.unwrap() })).min(1).max(14),
      }),
      annotations: WRITE,
    },
    async ({ workouts }) => {
      const ids = [];
      for (const { request_id, ...input } of workouts) ids.push((await createWorkout(userId, request_id, input, "assistant")).id);
      return json({ workout_ids: ids, verify_with: "get_workout" });
    },
  );

  server.registerTool(
    "update_workout",
    {
      title: "Update a workout",
      description: "Changes fields of an existing workout plan. Setting the same values again is harmless.",
      inputSchema: z.object({ workout_id: z.uuid(), changes: workoutInput.partial() }),
      annotations: WRITE,
    },
    async ({ workout_id, changes }) => json({ workout_id: await updateWorkout(userId, workout_id, changes), verify_with: "get_workout" }),
  );

  server.registerTool(
    "list_runs",
    {
      title: "List runs",
      description: "Recent runs, newest first, with planned vs. actual per interval.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(100).default(10) }),
      annotations: READ,
    },
    async ({ limit }) => json(await listRuns(userId, limit)),
  );

  server.registerTool(
    "get_run",
    { title: "Read a run", description: "One run with its intervals and feedback.", inputSchema: z.object({ run_id: z.uuid() }), annotations: READ },
    async ({ run_id }) => json(await getRun(userId, run_id)),
  );

  server.registerTool(
    "record_run",
    {
      title: "Record a run",
      description: "Stores a run. Use source \"manual\" for a run the runner describes in chat; never invent numbers they did not give.",
      inputSchema: runInput.extend({ request_id: requestId }),
      annotations: WRITE,
    },
    async ({ request_id, ...input }) => {
      const { id, created } = await recordRun(userId, request_id, input);
      return json({ run_id: id, already_existed: !created, verify_with: "get_run" });
    },
  );

  server.registerTool(
    "add_run_feedback",
    {
      title: "Add run feedback",
      description: "Stores the runner's self-report for a run: RPE 1-10 and/or notes.",
      inputSchema: z.object({
        request_id: requestId,
        run_id: z.uuid(),
        rpe: z.number().int().min(1).max(10).optional(),
        notes: z.string().max(1000).optional(),
      }),
      annotations: WRITE,
    },
    async ({ request_id, run_id, rpe, notes }) => {
      const { id } = await addRunFeedback(userId, request_id, run_id, rpe, notes);
      return json({ feedback_id: id, run_id, verify_with: "get_run" });
    },
  );

  return server;
}
