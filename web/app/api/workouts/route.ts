import { withBearer } from "@/lib/bearer";
import { today } from "@/lib/db";
import { upcomingWorkouts } from "@/lib/workouts";

// The iPhone app's list: workouts scheduled for today or later, then unscheduled ones.
// `?blocks=1`: the app plays full workouts too (see upcomingWorkouts).
export const GET = withBearer(async (request, { userId }) =>
  Response.json(await upcomingWorkouts(userId, today(), new URL(request.url).searchParams.has("blocks"))),
);
