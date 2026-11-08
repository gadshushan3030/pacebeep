import * as z from "zod/v4";
import { withBearer } from "@/lib/bearer";
import { registerDevice, removeDevice } from "@/lib/push";

// The iPhone's APNs device token, so the server can push when the coach plans something:
// POST /api/devices { "token": "<hex>", "platform": "ios", "environment": "sandbox" | "production" }
// (Debug builds of the app get sandbox tokens). The app sends it once per token, on launch, and a
// token moves to whoever registers it last. DELETE /api/devices { "token" } on sign-out.
const body = z.object({ token: z.string().regex(/^[0-9a-f]{32,400}$/i), platform: z.literal("ios"), environment: z.enum(["sandbox", "production"]) });

export const POST = withBearer(async (request, { userId }) => {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  await registerDevice(userId, parsed.data.token, parsed.data.environment);
  return new Response(null, { status: 204 });
});

export const DELETE = withBearer(async (request, { userId }) => {
  const parsed = body.pick({ token: true }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  await removeDevice(userId, parsed.data.token);
  return new Response(null, { status: 204 });
});
