import * as z from "zod/v4";
import { withBearer } from "@/lib/bearer";
import { today } from "@/lib/db";
import { event } from "@/lib/log";
import { ClientError, importPlan, planPrompt } from "@/lib/workouts";

// A plan from any chat, without MCP.
// GET ?today=YYYY-MM-DD (the phone's date): { prompt }, the text the runner gives the chat.
// POST { "text": "…" }: what the chat answered, as copied. Its workouts are stored approved;
// { workouts, created } counts them (created < workouts: some were pasted before). 400 with a
// readable `error` when no plan is found or a workout is out of range.
export const GET = withBearer((request) => {
  const day = z.iso.date().safeParse(new URL(request.url).searchParams.get("today"));
  return Response.json({ prompt: planPrompt(day.success ? day.data : today()) });
});

const body = z.object({ text: z.string().max(200_000) });

export const POST = withBearer(async (request, { userId }) => {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  try {
    const result = await importPlan(userId, parsed.data.text);
    event("paste", { via: "app", ok: true, created: result.created.length, past: result.past, earlier: result.earlier.length });
    return Response.json(result);
  } catch (error) {
    if (!(error instanceof ClientError)) throw error;
    // Why pastes fail is the one thing nobody could see: the runner only sees it on their screen.
    event("paste", { via: "app", ok: false, note: error.message.slice(0, 200) });
    return Response.json({ error: error.message }, { status: error.status });
  }
});
