import { createPrivateKey, createSign } from "node:crypto";
import { connect } from "node:http2";
import { sql } from "@/lib/db";

// One visible push to the runner's phones when the coach creates or changes a workout over MCP:
// "New workout from your coach. Open to approve." The push carries the change; the phone keeps the
// time (a local reminder, see the app). Direct APNs over HTTP/2 with a provider token signed by
// the team's .p8 key: no third party, no cost. Without the four APNS_* variables (a self-host, CI)
// nothing is sent and nothing fails.

type Device = { id: string; token: string; environment: "sandbox" | "production" };
type Reply = { status: number; reason?: string };

export function registerDevice(userId: string, token: string, environment: Device["environment"]) {
  return sql(
    `insert into devices (user_id, token, platform, environment) values ($1, $2, 'ios', $3)
     on conflict (token) do update set user_id = excluded.user_id, environment = excluded.environment, last_seen_at = now()`,
    [userId, token, environment],
  );
}

export function removeDevice(userId: string, token: string) {
  return sql("delete from devices where user_id = $1 and token = $2", [userId, token]);
}

function config() {
  const { APNS_KEY, APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID } = process.env;
  if (!APNS_KEY || !APNS_KEY_ID || !APNS_TEAM_ID || !APNS_BUNDLE_ID) return null;
  // The .p8 file's contents; pasted into an env var the newlines may arrive as "\n".
  return { key: APNS_KEY.replace(/\\n/g, "\n"), keyId: APNS_KEY_ID, teamId: APNS_TEAM_ID, bundleId: APNS_BUNDLE_ID };
}

// Apple takes a provider token for an hour and refuses one minted more often than every 20 minutes:
// one per 50 minutes, kept per process. ES256 = ECDSA P-256 with the raw (r‖s) signature.
let provider: { jwt: string; at: number } | undefined;
function providerToken(c: NonNullable<ReturnType<typeof config>>) {
  const now = Math.floor(Date.now() / 1000);
  if (provider && now - provider.at < 50 * 60) return provider.jwt;
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const signed = `${b64({ alg: "ES256", kid: c.keyId })}.${b64({ iss: c.teamId, iat: now })}`;
  const signature = createSign("SHA256").update(signed).sign({ key: createPrivateKey(c.key), dsaEncoding: "ieee-p1363" }, "base64url");
  provider = { jwt: `${signed}.${signature}`, at: now };
  return provider.jwt;
}

// One HTTP/2 request to APNs; the status and Apple's `reason` ("BadDeviceToken", "Unregistered").
function send(host: string, path: string, headers: Record<string, string>, body: string) {
  return new Promise<Reply>((resolve, reject) => {
    const client = connect(`https://${host}`);
    client.setTimeout(5000, () => client.destroy(new Error("APNs timed out")));
    client.on("error", reject);
    const request = client.request({ ":method": "POST", ":path": path, ...headers });
    let status = 0;
    let data = "";
    request.on("response", (h) => (status = Number(h[":status"])));
    request.setEncoding("utf8");
    request.on("data", (chunk) => (data += chunk));
    request.on("end", () => {
      client.close();
      let reason: string | undefined;
      try { reason = JSON.parse(data).reason; } catch {}
      resolve({ status, reason });
    });
    request.on("error", reject);
    request.end(body);
  });
}
// The HTTP layer, replaceable by tests.
export const apns = { send };

// Called from the MCP write path only (never from the phone's own writes). Never throws: the coach's
// tool call succeeded, a failed push is logged.
export async function notifyCoachChange(userId: string, workoutId: string, title = "New workout from your coach") {
  const c = config();
  if (!c) return;
  try {
    // The debounce and the claim are one statement: the user's devices are marked and returned only
    // when none was pushed to in the last 10 minutes, so two coach writes at once send one push.
    const devices = await sql<Device>(
      `update devices set push_sent_at = now() where user_id = $1
         and not exists (select 1 from devices where user_id = $1 and push_sent_at > now() - interval '10 minutes')
       returning id, token, environment`,
      [userId],
    );
    if (!devices.length) return;
    const headers = {
      authorization: `bearer ${providerToken(c)}`,
      "apns-topic": c.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      // Later pushes replace this one in Notification Center instead of piling up.
      "apns-collapse-id": "coach",
    };
    const body = JSON.stringify({ aps: { alert: { title, body: "Open to approve." }, sound: "default" }, workout_id: workoutId });
    await Promise.all(
      devices.map(async (d) => {
        const host = d.environment === "production" ? "api.push.apple.com" : "api.sandbox.push.apple.com";
        const reply = await apns.send(host, `/3/device/${d.token}`, headers, body).catch((error: Error) => ({ status: 0, reason: error.message }));
        // The phone is gone (app deleted, token rotated): forget it. Anything else may pass next time.
        if (reply.status === 410 || (reply.status === 400 && reply.reason === "BadDeviceToken")) await sql("delete from devices where id = $1", [d.id]);
        else if (reply.status !== 200) console.error(`push to ${d.environment} device failed: ${reply.status} ${reply.reason ?? ""}`);
      }),
    );
  } catch (error) {
    console.error("push failed", error);
  }
}
