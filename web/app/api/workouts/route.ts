import { withBearer } from "@/lib/bearer";
import { today } from "@/lib/db";
import { upcomingWorkouts } from "@/lib/workouts";

// The iPhone app's list: workouts scheduled for today or later, then unscheduled ones.
export const GET = withBearer(async (_request, { userId }) => Response.json(await upcomingWorkouts(userId, today())));
