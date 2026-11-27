import { withBearer } from "@/lib/bearer";
import { coachInvite, createCoachLink } from "@/lib/coach-link";

// The iPhone app's "Connect an assistant": a new coach link, and the sentence the runner pastes
// into a chat with it. Links made before keep working until disconnected on the dashboard.
export const POST = withBearer(async (_request, { userId }) => {
  const url = await createCoachLink(userId);
  return Response.json({ url, invite: coachInvite(url) });
});
