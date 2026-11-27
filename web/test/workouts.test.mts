// Runs against DATABASE_URL (after npm run db:migrate); skipped when it is unset.
// A throwaway user owns every row and is deleted at the end (workouts cascade).
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { pool, sql } from "@/lib/db";
import { approveWorkout, ClientError, createWorkout, deleteWorkout, deleteWorkouts, getRun, getWorkout, importPlan, parsePlan, planPrompt, recordRun, summary, updateWorkout, upcomingWorkouts, workoutInput, type WorkoutInput } from "@/lib/workouts";

const skip = !process.env.DATABASE_URL && "DATABASE_URL unset";
const userId = `test-${Date.now()}`;
const run: WorkoutInput = { name: "Tue 18:00", warmup_sec: 0, repeats: 6, work_sec: 60, rest_sec: 60, cooldown_sec: 0, scheduled_for: "2099-01-05", scheduled_time: "18:00" };
const blocks = [{ type: "strength" as const, exercise: "Squat", sets: [{ reps: 5, weight_kg: 60 }], rest_sec: 90 }];
let id: string;
const status = async () => (await getWorkout(userId, id)).status;

before(async () => {
  if (skip) return;
  await sql('insert into "user" (id, name, email, "emailVerified") values ($1, $1, $1, false)', [userId]);
  id = (await createWorkout(userId, "w", run, "assistant")).id;
});
after(async () => {
  if (skip) return;
  await sql('delete from "user" where id = $1', [userId]);
  await pool.end();
});

test("coach creates pending with date and HH:MM; the app's list and the summary show both", { skip }, async () => {
  const w = await getWorkout(userId, id);
  assert.deepEqual([w.status, w.scheduled_for, w.scheduled_time], ["pending", "2099-01-05", "18:00"]);
  const up = (await upcomingWorkouts(userId, "2099-01-01", false)).find((x) => x.id === id);
  assert.deepEqual([up?.status, up?.scheduled_time], ["pending", "18:00"]);
  const s = (await summary(userId)).upcoming.find((x) => x.id === id);
  assert.deepEqual([s?.status, s?.scheduled_time], ["pending", "18:00"]);
});

test("the runner's own workout is approved; old rows default to approved", { skip }, async () => {
  const mine = await createWorkout(userId, "mine", { ...run, name: "mine" }, "app");
  assert.equal((await getWorkout(userId, mine.id)).status, "approved");
});

test("approve moves the time, approve without a time keeps it", { skip }, async () => {
  await approveWorkout(userId, id, "19:00");
  assert.deepEqual([await status(), (await getWorkout(userId, id)).scheduled_time], ["approved", "19:00"]);
  await approveWorkout(userId, id);
  assert.equal((await getWorkout(userId, id)).scheduled_time, "19:00");
});

test("identical update keeps approved and reports nothing changed", { skip }, async () => {
  const { changed } = await updateWorkout(userId, id, { ...run, scheduled_time: "19:00" }, "assistant");
  assert.deepEqual(changed, []);
  assert.equal(await status(), "approved");
});

test("one changed value sets pending and is reported", { skip }, async () => {
  const { changed } = await updateWorkout(userId, id, { work_sec: 90 }, "assistant");
  assert.deepEqual(changed, ["work_sec"]);
  assert.equal(await status(), "pending");
});

test("the same change by the app does not touch the status", { skip }, async () => {
  await approveWorkout(userId, id);
  await updateWorkout(userId, id, { work_sec: 120 }, "app");
  assert.equal(await status(), "approved");
});

test("blocks round-trip as jsonb: same blocks stay approved, changed blocks go pending", { skip }, async () => {
  await updateWorkout(userId, id, { blocks }, "assistant");
  await approveWorkout(userId, id);
  assert.deepEqual((await updateWorkout(userId, id, { blocks }, "assistant")).changed, []);
  assert.equal(await status(), "approved");
  assert.deepEqual((await updateWorkout(userId, id, { blocks: [{ ...blocks[0], rest_sec: 60 }] }, "assistant")).changed, ["blocks"]);
  assert.equal(await status(), "pending");
  const w = await getWorkout(userId, id);
  assert.deepEqual([w.repeats, w.work_sec, w.blocks?.[0].type], [null, null, "strength"]);
});

test("a time needs a date: create, update and approve answer 400", { skip }, async () => {
  const noDate = { ...run, name: "no date", scheduled_for: undefined, scheduled_time: undefined };
  // Rejected by the input schema first (the web form and the MCP tools parse with it), and by the DB behind it.
  assert.deepEqual(workoutInput.safeParse({ ...noDate, scheduled_time: "07:00" }).error?.issues.map((i) => i.path), [["scheduled_time"]]);
  await assert.rejects(createWorkout(userId, "t1", { ...noDate, scheduled_time: "07:00" }, "app"), (e) => e instanceof ClientError && e.status === 400);
  const { id: bare } = await createWorkout(userId, "t2", noDate, "app");
  await assert.rejects(updateWorkout(userId, bare, { scheduled_time: "07:00" }, "assistant"), (e) => e instanceof ClientError && e.status === 400);
  await assert.rejects(approveWorkout(userId, bare, "07:00"), (e) => e instanceof ClientError && e.status === 400);
  await assert.rejects(approveWorkout(userId, "00000000-0000-0000-0000-000000000000"), (e) => e instanceof ClientError && e.status === 404);
});

test("delete removes a planned workout; a workout with a run stays (409); gone is 404", { skip }, async () => {
  const { id: plan } = await createWorkout(userId, "d1", { ...run, name: "test" }, "assistant");
  assert.equal(await deleteWorkout(userId, plan), plan);
  assert.ok(!(await upcomingWorkouts(userId, "2099-01-01", false)).some((x) => x.id === plan));
  await assert.rejects(deleteWorkout(userId, plan), (e) => e instanceof ClientError && e.status === 404);
  const { id: done } = await createWorkout(userId, "d2", { ...run, name: "done" }, "app");
  await recordRun(userId, "r1", { workout_id: done, source: "device", started_at: "2099-01-05T18:00:00Z", ended_at: "2099-01-05T18:30:00Z", intervals: [] });
  await assert.rejects(deleteWorkout(userId, done), (e) => e instanceof ClientError && e.status === 409);
});

test("location: indoor (treadmill) reaches the app's list; left out, it stays null (outdoor)", { skip }, async () => {
  const indoor = (await createWorkout(userId, "loc1", { ...run, location: "indoor" }, "assistant")).id;
  const outdoor = (await createWorkout(userId, "loc2", run, "assistant")).id;
  const up = await upcomingWorkouts(userId, "2099-01-01", false);
  assert.equal(up.find((x) => x.id === indoor)?.location, "indoor");
  assert.equal(up.find((x) => x.id === outdoor)?.location, null);
  assert.equal(workoutInput.safeParse({ ...run, location: "moon" }).success, false);
});

test("a run keeps the watch's heart rate, per run and per interval; max below avg is a 400", { skip }, async () => {
  const at = { source: "device" as const, started_at: "2099-01-06T18:00:00Z", ended_at: "2099-01-06T18:30:00Z" };
  const { id } = await recordRun(userId, "hr1", { ...at, distance_m: 5000, avg_hr: 148, max_hr: 171, intervals: [{ kind: "work", actual_sec: 60, avg_hr: 160, max_hr: 171 }] });
  const run = await getRun(userId, id);
  assert.equal(run.avg_hr, 148);
  assert.equal(run.max_hr, 171);
  assert.equal(run.intervals[0].avg_hr, 160);
  await assert.rejects(recordRun(userId, "hr2", { ...at, avg_hr: 150, max_hr: 140, intervals: [] }), (e) => e instanceof ClientError && e.status === 400);
});

const plan = [
  { name: "W1 D1", scheduled_for: "2099-02-01", warmup_sec: 300, repeats: 8, work_sec: 60, rest_sec: 90, cooldown_sec: 300, week: 1 },
  { name: "W1 D2", scheduled_for: "2099-02-03", repeats: 1, work_sec: 1200 },
];

test("a pasted plan is read from a chat's answer: fenced, wrapped, or one workout; bad ones say why", () => {
  const fenced = parsePlan("Here is your plan:\n```json\n" + JSON.stringify(plan, null, 2) + "\n```\nGood luck!");
  assert.deepEqual(fenced.map((w) => [w.name, w.rest_sec]), [["W1 D1", 90], ["W1 D2", 0]]);
  assert.equal("week" in fenced[0], false);
  assert.equal(parsePlan(JSON.stringify({ workouts: plan })).length, 2);
  assert.equal(parsePlan(JSON.stringify(plan[0])).length, 1);
  const says = (text: string, part: string) => assert.throws(() => parsePlan(text), (e) => e instanceof ClientError && e.status === 400 && e.message.includes(part));
  says("Sure! What is your goal?", "No plan found");
  says(JSON.stringify([{ ...plan[0], work_sec: 2 }]), "work_sec");
  says(JSON.stringify([{ name: "no intervals" }]), "repeats and work_sec");
  says("[]", "Too small");
  // The prompt's example is a plan the server takes; the prompt itself, pasted back, is refused.
  const prompt = planPrompt("2099-02-01");
  assert.equal(parsePlan(prompt.slice(prompt.indexOf("["), prompt.lastIndexOf("]") + 1)).length, 1);
  says(prompt, "prompt itself");
});

test("importing a plan stores it approved, once: the same text again creates nothing", { skip }, async () => {
  const text = JSON.stringify(plan);
  const counts = async (t: string) => { const r = await importPlan(userId, t); return [r.workouts, r.created.length, r.past]; };
  assert.deepEqual(await counts(text), [2, 2, 0]);
  assert.deepEqual(await counts("```\n" + text + "\n```"), [2, 0, 0]);
  const up = (await upcomingWorkouts(userId, "2099-02-01", false)).filter((w) => w.name.startsWith("W1 "));
  assert.deepEqual(up.map((w) => [w.name, w.status, w.scheduled_for]), [["W1 D1", "approved", "2099-02-01"], ["W1 D2", "approved", "2099-02-03"]]);
  // One week rewritten and sent with the rest: only the new workout is added, and the workout it
  // was meant to replace is named as left over from the earlier plan.
  const second = await importPlan(userId, JSON.stringify([plan[0], { ...plan[1], name: "W1 D2 easier", work_sec: 600 }]));
  assert.deepEqual([second.workouts, second.created.length, second.past], [2, 1, 0]);
  const names = async (ids: string[]) => (await upcomingWorkouts(userId, "2099-02-01", false)).filter((w) => ids.includes(w.id)).map((w) => w.name);
  assert.deepEqual(await names(second.earlier), ["W1 D2"]);
  // "Remove the earlier plan", then Undo: each takes exactly its own workouts.
  assert.equal(await deleteWorkouts(userId, second.earlier), 1);
  assert.equal(await deleteWorkouts(userId, second.created), 1);
  assert.deepEqual((await upcomingWorkouts(userId, "2099-02-01", false)).filter((w) => w.name.startsWith("W1 ")).map((w) => w.name), ["W1 D1"]);
});

test("a pasted plan dated in the past is refused; past workouts in a mixed plan are left out", { skip }, async () => {
  const old = { ...plan[0], name: "W0 old", scheduled_for: "2001-01-01" };
  await assert.rejects(importPlan(userId, JSON.stringify([old])), (e) => e instanceof ClientError && e.status === 400 && e.message.includes("dated before today"));
  const mixed = await importPlan(userId, JSON.stringify([old, { ...plan[0], name: "W9 new", scheduled_for: "2099-04-01" }]));
  assert.deepEqual([mixed.workouts, mixed.created.length, mixed.past], [1, 1, 1]);
});
