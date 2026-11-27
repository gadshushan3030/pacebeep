import { coachBrief, coachCover, coachLinkUser, coachPlanned, coachWrite } from "@/lib/coach-link";
import { event } from "@/lib/log";
import { ClientError } from "@/lib/workouts";

// A coach link, for an assistant with no connector. No session and no bearer token: the token in
// the path is the key.
// - GET /c/<token>: what this is and where the training is, with no training in it. This is the
//   address the runner pastes, so it is what a chat app fetches to draw a link preview.
// - GET /c/<token>?training: the runs, the plan, and how to plan more.
// - Workouts come back in whichever way the reader's tools allow: a POST, the form at the bottom
//   of the training page (a browser), or GET ?add= (a tool that can only fetch a page).
//
// The outcome is the first line of the answer ("Added 3 workouts." or "Not done: ..."). A GET that
// reaches a real link always answers 200: a page-fetching tool often hides the body of an error
// status, and the reason is what lets the assistant fix its plan and send it again. A POST also
// carries the error status, for a client that looks at nothing else.

const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

const page = (text: string, form: boolean) => `<!doctype html>
<meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>PaceBeep coach link</title>
<pre style="white-space:pre-wrap;font:15px/1.5 ui-monospace,monospace">${esc(text)}</pre>${
  form ? `\n<form method="post"><p><textarea name="add" rows="10" cols="70" aria-label="JSON list of workouts"></textarea></p><p><button>Add workouts</button></p></form>` : ""
}
`;

async function handle(request: Request, ctx: RouteContext<"/c/[token]">) {
  // A browser gets the same text, with a form under it wherever workouts can be added.
  const html = (request.headers.get("accept") ?? "").includes("text/html");
  const answer = (text: string, status = 200, form = false) =>
    new Response(html ? page(text, form) : text, { status, headers: { ...headers, "Content-Type": `text/${html ? "html" : "plain"}; charset=utf-8` } });

  // How far an assistant got, and which one: the request log shows neither (see lib/log.ts).
  const seen = (did: string, more: Record<string, unknown> = {}) =>
    event("coach-link", { did, via: request.method, ...more, ua: (request.headers.get("user-agent") ?? "").slice(0, 120) });

  const url = new URL(request.url);
  let add = url.searchParams.get("add");
  let remove = url.searchParams.get("delete");
  if (request.method === "POST") {
    const body = await request.text();
    // The page's form. Anything else is {"delete": "<id>"}, or a plan in any shape parsePlan reads:
    // curl -d sends a JSON body labelled as a form, so the label alone decides nothing.
    const form = (request.headers.get("content-type") ?? "").includes("x-www-form-urlencoded") ? new URLSearchParams(body) : null;
    if (form?.has("add") || form?.has("delete")) {
      add = form.get("add") ?? add;
      remove = form.get("delete") ?? remove;
    } else {
      let asked: { delete?: unknown } | null = null;
      try { asked = JSON.parse(body); } catch {}
      if (typeof asked?.delete === "string") remove = asked.delete;
      else add = body;
    }
  }

  const reading = url.searchParams.has("training");
  // Reading the training or planning is use, and renews the link; fetching the bare address is not.
  const userId = await coachLinkUser((await ctx.params).token, reading || !!add || !!remove);
  if (!userId) {
    seen("gone");
    return answer("This PaceBeep coach link no longer works: the runner disconnected it, or it went 30 days without use. Ask the runner for a new one: in the PaceBeep app, Connect an assistant.\n", 404);
  }
  const link = url.origin + url.pathname;
  if (!add && !remove) {
    seen(reading ? "training" : "cover");
    return reading ? answer(await coachBrief(userId, link), 200, true) : answer(coachCover(link));
  }

  const did = remove ? "delete" : "add";
  let outcome: string;
  let status = 200;
  try {
    outcome = await coachWrite(userId, { add, remove });
    // An add's first sentence is counts only; a delete's names the workout, so it is left out.
    seen(did, { ok: true, ...(!remove && { note: outcome.split(". ")[0] }) });
  } catch (error) {
    if (!(error instanceof ClientError)) throw error;
    seen(did, { ok: false, note: error.message.slice(0, 200) });
    outcome = `Not done: ${error.message}`;
    if (request.method === "POST") status = error.status;
  }
  return answer(`${outcome}\n\n${await coachPlanned(userId, link)}`, status, true);
}

export { handle as GET, handle as POST };
