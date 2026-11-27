import { coachBrief, coachLinkUser, coachWrite } from "@/lib/coach-link";
import { ClientError } from "@/lib/workouts";

// A coach link, for an assistant with no connector. It reads this page and sends workouts back in
// whichever way its tools allow: a POST, the form at the bottom (a browser), or GET ?add= (a tool
// that can only fetch a page). No session and no bearer token: the token in the path is the key.
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
  const userId = await coachLinkUser((await ctx.params).token);
  // A browser gets the same text with a form under it.
  const html = (request.headers.get("accept") ?? "").includes("text/html");
  const answer = (text: string, status = 200) =>
    new Response(html ? page(text, status !== 404) : text, { status, headers: { ...headers, "Content-Type": `text/${html ? "html" : "plain"}; charset=utf-8` } });
  if (!userId) return answer("This PaceBeep coach link no longer works. Ask the runner for a new one: in the PaceBeep app, Connect an assistant.\n", 404);

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

  let outcome = "";
  let status = 200;
  if (add || remove) {
    try {
      outcome = await coachWrite(userId, { add, remove });
    } catch (error) {
      if (!(error instanceof ClientError)) throw error;
      outcome = `Not done: ${error.message}`;
      if (request.method === "POST") status = error.status;
    }
  }
  return answer(`${outcome && `${outcome}\n\n`}${await coachBrief(userId, url.origin + url.pathname)}`, status);
}

export { handle as GET, handle as POST };
