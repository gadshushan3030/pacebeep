import * as z from "zod/v4";
import { withBearer } from "@/lib/bearer";
import { approveWorkout, ClientError, workoutFields } from "@/lib/workouts";

// The runner approves a workout the coach planned, optionally moving its time of day:
// POST /api/workouts/approve { "workout_id": "…", "scheduled_time": "18:30" } (scheduled_time optional).
// 404 when the workout is not theirs or is gone; 400 for a time on a workout without a date.
const body = z.object({ workout_id: z.uuid(), scheduled_time: workoutFields.scheduled_time });

export const POST = withBearer(async (request, { userId }) => {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  try {
    const workout_id = await approveWorkout(userId, parsed.data.workout_id, parsed.data.scheduled_time);
    return Response.json({ workout_id, status: "approved" });
  } catch (error) {
    if (error instanceof ClientError) return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
});
