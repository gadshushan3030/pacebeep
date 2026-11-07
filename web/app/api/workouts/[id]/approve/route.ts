import * as z from "zod/v4";
import { withBearer } from "@/lib/bearer";
import { approveWorkout, workoutFields } from "@/lib/workouts";

// The runner approves a workout the coach planned, optionally moving its time of day:
// POST /api/workouts/{id}/approve with {} or { "scheduled_time": "18:30" }.
const body = z.object({ scheduled_time: workoutFields.scheduled_time });

export const POST = withBearer(async (request, { userId }) => {
  const id = z.uuid().safeParse(new URL(request.url).pathname.split("/").at(-2));
  if (!id.success) return Response.json({ error: "bad workout id" }, { status: 400 });
  const parsed = body.safeParse((await request.json().catch(() => null)) ?? {});
  if (!parsed.success) return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  const workout_id = await approveWorkout(userId, id.data, parsed.data.scheduled_time).catch(() => null);
  if (!workout_id) return Response.json({ error: "workout not found" }, { status: 404 });
  return Response.json({ workout_id, status: "approved" });
});
