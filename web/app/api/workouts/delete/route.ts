import * as z from "zod/v4";
import { withBearer } from "@/lib/bearer";
import { ClientError, deleteWorkout } from "@/lib/workouts";

// The runner deletes a planned workout: POST /api/workouts/delete { "workout_id": "…" }.
// 404 when it is not theirs or already gone (the app treats that as done); 409 when it has a run.
const body = z.object({ workout_id: z.uuid() });

export const POST = withBearer(async (request, { userId }) => {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  try {
    return Response.json({ workout_id: await deleteWorkout(userId, parsed.data.workout_id), deleted: true });
  } catch (error) {
    if (error instanceof ClientError) return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
});
