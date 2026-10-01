// The App Review demo account: a password account with workouts, so a reviewer can try the app
// without an AI assistant. Sign-up is closed when Google or Apple is on, so it writes the rows
// itself. Safe to re-run: it resets the account's training, recreates the account if a reviewer
// deleted it, and keeps the password unless DEMO_PASSWORD is set.
// Usage: npm run demo:account [-- <email>]   (production: DATABASE_URL=<Neon URL> npm run …)
import { randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import pg from "pg";

const email = (process.argv[2] ?? "appreview@pacebeep.example").toLowerCase();
const db = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL });
await db.connect();
await db.query("begin");

let password = process.env.DEMO_PASSWORD;
let [user] = (await db.query(`select id from "user" where email = $1`, [email])).rows;
if (!user) {
  password ??= randomBytes(9).toString("base64url");
  [user] = (await db.query(`insert into "user" (id, name, email, "emailVerified") values ($1, 'App Review', $2, true) returning id`,
    [randomUUID(), email])).rows;
}
if (password) {
  await db.query(`delete from account where "userId" = $1 and "providerId" = 'credential'`, [user.id]);
  await db.query(`insert into account (id, "accountId", "providerId", "userId", password, "updatedAt") values ($1, $2, 'credential', $2, $3, now())`,
    [randomUUID(), user.id, await hashPassword(password)]);
}

// Unscheduled ("Anytime"), so none fall off the app's list (today onward) while the review waits.
// The app shows unscheduled ones newest first: the short one gets the latest created_at.
await db.query("delete from runs where user_id = $1", [user.id]); // feedback goes with them
await db.query("delete from workouts where user_id = $1", [user.id]);
const workouts = [
  ["Quick intervals", 60, 3, 30, 30, 60, 300, "A short one to try: a beep at every change, also with the screen locked."],
  ["6 × 2:00 / 1:00", 300, 6, 120, 60, 300, 270, null],
  ["Easy 30", 0, 1, 1800, 0, 0, 360, null],
];
for (const [i, w] of workouts.entries()) {
  await db.query(
    `insert into workouts (user_id, request_id, source, name, warmup_sec, repeats, work_sec, rest_sec, cooldown_sec, target_pace_sec_per_km, notes, created_at)
     values ($1, $2, 'assistant', $3, $4, $5, $6, $7, $8, $9, $10, now() - make_interval(secs => $11))`,
    [user.id, `demo-${i}`, ...w, i],
  );
}
await db.query("commit");
await db.end();

console.log(`Demo account ${email}: ${workouts.length} workouts.`);
console.log(password ? `Password: ${password}` : "Password unchanged (set DEMO_PASSWORD to replace it).");
