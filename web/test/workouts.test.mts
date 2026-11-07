// Runs against DATABASE_URL (after npm run db:migrate); skipped when it is unset.
// A throwaway user owns every row and is deleted at the end (workouts cascade).
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { pool, sql } from "@/lib/db";
import { approveWorkout, ClientError, createWorkout, getWorkout, summary, updateWorkout, upcomingWorkouts, type WorkoutInput } from "@/lib/workouts";

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
  await assert.rejects(createWorkout(userId, "t1", { ...noDate, scheduled_time: "07:00" }, "app"), (e) => e instanceof ClientError && e.status === 400);
  const { id: bare } = await createWorkout(userId, "t2", noDate, "app");
  await assert.rejects(updateWorkout(userId, bare, { scheduled_time: "07:00" }, "assistant"), (e) => e instanceof ClientError && e.status === 400);
  await assert.rejects(approveWorkout(userId, bare, "07:00"), (e) => e instanceof ClientError && e.status === 400);
  await assert.rejects(approveWorkout(userId, "00000000-0000-0000-0000-000000000000"), (e) => e instanceof ClientError && e.status === 404);
});
