import * as z from "zod/v4";
import { withBearer } from "@/lib/bearer";
import { addRunFeedback, recordRun, runInput } from "@/lib/workouts";

const requestId = z.string().min(8).max(100);

// A run recorded by the iPhone app, optionally with the runner's RPE. Both writes are idempotent,
// so the app's offline outbox resends the same body until it gets a 2xx. Sending the same run
// again with feedback attached adds the feedback to the run stored the first time.
const body = z.object({
  request_id: requestId,
  run: runInput.omit({ source: true }),
  feedback: z
    .object({ request_id: requestId, rpe: z.number().int().min(1).max(10).optional(), notes: z.string().max(1000).optional() })
    .optional(),
});

export const POST = withBearer(async (request, { userId }) => {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const { request_id, run, feedback } = parsed.data;
  const save = (workout_id?: string) => recordRun(userId, request_id, { ...run, workout_id, source: "device" });
  // A workout deleted since the app fetched it must not lose the run.
  const { id } = await save(run.workout_id).catch(() => save(undefined));
  if (feedback) await addRunFeedback(userId, feedback.request_id, id, feedback.rpe, feedback.notes);
  return Response.json({ run_id: id });
});
