// Runs against DATABASE_URL (after npm run db:migrate); skipped when it is unset. APNs itself is
// replaced by a fake `apns.send` that records the calls; the key is a throwaway P-256 key.
import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { after, before, test } from "node:test";
import { pool, sql } from "@/lib/db";
import { apns, notifyCoachChange, registerDevice, removeDevice } from "@/lib/push";

const skip = !process.env.DATABASE_URL && "DATABASE_URL unset";
const userId = `push-${Date.now()}`;
const other = `${userId}-other`;
const workoutId = "11111111-1111-1111-1111-111111111111";
const tokenA = "a".repeat(64);
const tokenB = "b".repeat(64);
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const env = { APNS_KEY: privateKey.export({ type: "pkcs8", format: "pem" }) as string, APNS_KEY_ID: "KEY1234567", APNS_TEAM_ID: "TEAM567890", APNS_BUNDLE_ID: "com.example.PaceBeep" };

type Call = { host: string; path: string; headers: Record<string, string>; body: string };
const calls: Call[] = [];
let reply: (call: Call) => { status: number; reason?: string } = () => ({ status: 200 });
apns.send = async (host, path, headers, body) => {
  const call = { host, path, headers, body };
  calls.push(call);
  return reply(call);
};

const devices = () => sql<{ token: string; user_id: string; push_sent_at: Date | null }>("select token, user_id, push_sent_at from devices where user_id in ($1, $2) order by token", [userId, other]);
const resetDebounce = () => sql("update devices set push_sent_at = null where user_id = $1", [userId]);

before(async () => {
  if (skip) return;
  for (const id of [userId, other]) await sql('insert into "user" (id, name, email, "emailVerified") values ($1, $1, $1, false)', [id]);
  await registerDevice(userId, tokenA, "sandbox");
  await registerDevice(userId, tokenB, "production");
});
after(async () => {
  if (skip) return;
  await sql('delete from "user" where id in ($1, $2)', [userId, other]);
  await pool.end();
});

test("without the APNS_* variables nothing is sent and the debounce is untouched", { skip }, async () => {
  for (const k of Object.keys(env)) delete process.env[k];
  await notifyCoachChange(userId, workoutId);
  assert.equal(calls.length, 0);
  assert.ok((await devices()).every((d) => d.push_sent_at === null));
});

test("one alert per device, to the host of its environment, with a provider token Apple can verify", { skip }, async () => {
  Object.assign(process.env, env);
  await notifyCoachChange(userId, workoutId);
  assert.deepEqual(calls.map((c) => [c.host, c.path]).sort(), [
    ["api.push.apple.com", `/3/device/${tokenB}`],
    ["api.sandbox.push.apple.com", `/3/device/${tokenA}`],
  ]);
  const { headers, body } = calls[0];
  assert.equal(headers["apns-topic"], env.APNS_BUNDLE_ID);
  assert.equal(headers["apns-push-type"], "alert");
  assert.deepEqual(JSON.parse(body), { aps: { alert: { title: "New workout from your coach", body: "Open to approve." }, sound: "default" }, workout_id: workoutId });
  const [h, p, s] = headers.authorization.replace(/^bearer /, "").split(".");
  const header = JSON.parse(Buffer.from(h, "base64url").toString());
  const claims = JSON.parse(Buffer.from(p, "base64url").toString());
  assert.deepEqual(header, { alg: "ES256", kid: env.APNS_KEY_ID });
  assert.equal(claims.iss, env.APNS_TEAM_ID);
  assert.ok(Math.abs(claims.iat - Date.now() / 1000) < 60);
  assert.ok(createVerify("SHA256").update(`${h}.${p}`).verify({ key: publicKey, dsaEncoding: "ieee-p1363" }, s, "base64url"));
});

test("a second change within 10 minutes sends nothing; after 10 minutes it sends again", { skip }, async () => {
  calls.length = 0;
  await notifyCoachChange(userId, workoutId, "Your plan changed");
  assert.equal(calls.length, 0);
  await sql("update devices set push_sent_at = now() - interval '11 minutes' where user_id = $1", [userId]);
  await notifyCoachChange(userId, workoutId, "Your plan changed");
  assert.equal(calls.length, 2);
  assert.equal(JSON.parse(calls[0].body).aps.alert.title, "Your plan changed");
});

test("410 Unregistered and 400 BadDeviceToken remove the device; other failures keep it", { skip }, async () => {
  await resetDebounce();
  reply = (c) => (c.path.endsWith(tokenA) ? { status: 410, reason: "Unregistered" } : { status: 500, reason: "InternalServerError" });
  await notifyCoachChange(userId, workoutId);
  assert.deepEqual((await devices()).map((d) => d.token), [tokenB]);
  await resetDebounce();
  reply = () => ({ status: 400, reason: "BadDeviceToken" });
  await notifyCoachChange(userId, workoutId);
  assert.deepEqual(await devices(), []);
  reply = () => ({ status: 200 });
});

test("a token moves to whoever registers it last; DELETE removes only the caller's", { skip }, async () => {
  await registerDevice(userId, tokenA, "sandbox");
  await registerDevice(other, tokenA, "production");
  assert.deepEqual((await devices()).map((d) => d.user_id), [other]);
  await removeDevice(userId, tokenA);
  assert.equal((await devices()).length, 1);
  await removeDevice(other, tokenA);
  assert.deepEqual(await devices(), []);
});
