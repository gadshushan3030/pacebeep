// A coach link end to end, through the route an assistant calls. Runs against DATABASE_URL (after
// npm run db:migrate); skipped when it is unset. A throwaway user owns every row.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { GET, POST } from "@/app/c/[token]/route";
import { createCoachLink, listCoachLinks, revokeCoachLink } from "@/lib/coach-link";
import { pool, sql } from "@/lib/db";
import { createWorkout, listWorkouts } from "@/lib/workouts";

const skip = !process.env.DATABASE_URL && "DATABASE_URL unset";
const userId = `test-link-${Date.now()}`;
const plan = [
  { name: "L1 D1", scheduled_for: "2099-03-01", warmup_sec: 300, repeats: 8, work_sec: 60, rest_sec: 90, cooldown_sec: 300 },
  { name: "L1 D2", scheduled_for: "2099-03-03", repeats: 1, work_sec: 1200 },
];
let link: string;

// What an assistant does with the link: the URL it was given, plus a query or a body.
async function ask(method: "GET" | "POST" = "GET", { query = "", body, type, accept, url = link }: { query?: string; body?: string; type?: string; accept?: string; url?: string } = {}) {
  const headers: Record<string, string> = { ...(type && { "content-type": type }), ...(accept && { accept }) };
  const res = await (method === "GET" ? GET : POST)(new Request(url + query, { method, body, headers }), { params: Promise.resolve({ token: url.split("/").pop()! }) });
  return { status: res.status, type: res.headers.get("content-type"), text: await res.text() };
}
const mine = async () => (await listWorkouts(userId, 100)).filter((w) => w.name.startsWith("L"));

before(async () => {
  if (skip) return;
  await sql('insert into "user" (id, name, email, "emailVerified") values ($1, $1, $1, false)', [userId]);
  // The address an assistant would use: the server's own origin (BETTER_AUTH_URL) is unset in CI.
  link = `http://pacebeep.test/c/${(await createCoachLink(userId)).split("/").pop()}`;
});
after(async () => {
  if (skip) return;
  await sql('delete from "user" where id = $1', [userId]);
  await pool.end();
});

test("the link opens the runner's training with no sign-in; a wrong token is a 404", { skip }, async () => {
  await createWorkout(userId, "own", { name: "L own", warmup_sec: 0, repeats: 6, work_sec: 60, rest_sec: 60, cooldown_sec: 0, scheduled_for: "2099-03-02" }, "app");
  const page = await ask();
  assert.equal(page.status, 200);
  assert.match(page.type ?? "", /^text\/plain/);
  for (const part of ["# PaceBeep coach link", "None yet", "Mon 2099-03-02 · \"L own\" · 6 × 1:00 / 1:00 rest · the runner's own · id ", `POST the list as the body of a request to ${link}`, `GET ${link}?add=`]) {
    assert.ok(page.text.includes(part), part);
  }
  assert.equal((await ask("GET", { url: link.slice(0, -4) + "0000" })).status, 404);
  assert.ok((await listCoachLinks(userId))[0].last_used_at);
});

test("a plan sent by POST lands pending, once; the same workouts by GET ?add= and by the form add nothing", { skip }, async () => {
  const posted = await ask("POST", { body: JSON.stringify(plan), type: "application/json" });
  assert.ok(posted.text.startsWith("Added 2 workouts."), posted.text.slice(0, 200));
  assert.ok(posted.text.includes("Sun 2099-03-01 · \"L1 D1\" · warm up 5:00, 8 × 1:00 / 1:30 rest, cool down 5:00 · from a coach, waiting for the runner's OK"));
  assert.deepEqual((await mine()).filter((w) => w.name.startsWith("L1")).map((w) => [w.name, w.source, w.status]), [["L1 D1", "assistant", "pending"], ["L1 D2", "assistant", "pending"]]);

  // curl -d: a JSON body that says it is a form.
  const curled = await ask("POST", { body: JSON.stringify(plan), type: "application/x-www-form-urlencoded" });
  assert.ok(curled.text.startsWith("Nothing new: these 2 workouts were added before."), curled.text.slice(0, 200));

  const fetched = await ask("GET", { query: `?add=${encodeURIComponent(JSON.stringify([plan[0]]))}` });
  assert.ok(fetched.text.startsWith("Nothing new: this workout was added before."), fetched.text.slice(0, 200));
  // A browser: the form posts the text of the box, and gets the page back with the form.
  const form = await ask("POST", { body: new URLSearchParams({ add: "Here you go:\n" + JSON.stringify({ workouts: plan }) }).toString(), type: "application/x-www-form-urlencoded", accept: "text/html" });
  assert.match(form.type ?? "", /^text\/html/);
  assert.ok(form.text.includes("Nothing new: these 2 workouts were added before.") && form.text.includes('<textarea name="add"'));
  assert.equal((await mine()).length, 3);
});

test("a plan that cannot be read answers 200 with the reason; a past date is said; delete removes", { skip }, async () => {
  const bad = await ask("GET", { query: `?add=${encodeURIComponent(JSON.stringify([{ ...plan[0], work_sec: 2 }]))}` });
  assert.equal(bad.status, 200);
  assert.ok(bad.text.startsWith("Not done:") && bad.text.includes("work_sec"), bad.text.slice(0, 200));
  // A POST says it with the status too.
  const none = await ask("POST", { body: "I can't do that, sorry." });
  assert.ok(none.status === 400 && none.text.startsWith("Not done: No plan found"), none.text.slice(0, 200));

  const past = await ask("POST", { body: JSON.stringify([{ ...plan[1], name: "L old", scheduled_for: "2001-01-01" }]) });
  assert.ok(past.text.startsWith("Added 1 workout.") && past.text.includes("1 of them is dated before today"), past.text.slice(0, 200));

  const id = (await mine()).find((w) => w.name === "L1 D2")!.id;
  assert.ok((await ask("POST", { body: JSON.stringify({ delete: id }) })).text.startsWith('Removed "L1 D2" (Tue 2099-03-03).'));
  assert.ok((await ask("GET", { query: `?delete=${id}` })).text.startsWith("Not done: workout not found"));
  assert.ok((await ask("GET", { query: "?delete=week-3" })).text.startsWith("Not done: delete takes a workout id"));
  // The runner's own workout is not the link's to remove.
  const own = (await mine()).find((w) => w.name === "L own")!.id;
  assert.ok((await ask("GET", { query: `?delete=${own}` })).text.startsWith("Not done: that workout is the runner's own"));
  assert.equal((await mine()).some((w) => w.name === "L own"), true);
  assert.equal((await mine()).some((w) => w.name === "L1 D2"), false);
});

test("a disconnected link stops working at once", { skip }, async () => {
  const [{ id }] = await listCoachLinks(userId);
  await revokeCoachLink(userId, id);
  const gone = await ask();
  assert.equal(gone.status, 404);
  assert.ok(gone.text.includes("no longer works"));
});
