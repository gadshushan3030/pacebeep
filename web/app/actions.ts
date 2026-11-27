"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { coachInvite, createCoachLink, revokeCoachLink } from "@/lib/coach-link";
import { pool } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { approveWorkout, ClientError, createWorkout, deleteWorkout, deleteWorkouts, importPlan, workoutInput } from "@/lib/workouts";

export async function logout() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}

const minutes = (v: FormDataEntryValue | null) => Math.round(Number(v || 0) * 60);

export async function addWorkout(_prev: string | null, form: FormData) {
  const user = await requireUser();
  const pace = String(form.get("target_pace") ?? "").trim(); // "m:ss" per km
  const parsed = workoutInput.safeParse({
    name: String(form.get("name") ?? ""),
    warmup_sec: minutes(form.get("warmup_min")),
    repeats: Number(form.get("repeats")),
    work_sec: Number(form.get("work_sec")),
    rest_sec: Number(form.get("rest_sec")),
    cooldown_sec: minutes(form.get("cooldown_min")),
    target_pace_sec_per_km: /^\d{1,2}:\d{2}$/.test(pace) ? Number(pace.split(":")[0]) * 60 + Number(pace.split(":")[1]) : undefined,
    scheduled_for: String(form.get("scheduled_for") ?? "") || undefined,
    scheduled_time: String(form.get("scheduled_time") ?? "") || undefined,
  });
  if (!parsed.success) return "Check the fields: " + parsed.error.issues.map((i) => i.path.join(".")).join(", ");
  // The form carries a UUID, so a double submit creates one workout, not two.
  try {
    await createWorkout(user.id, String(form.get("request_id")), parsed.data, "app");
  } catch (error) {
    if (error instanceof ClientError) return error.message;
    throw error;
  }
  revalidatePath("/", "layout");
  return null;
}

// A plan pasted from any chat (the answer to planPrompt). Same text again adds nothing.
export async function pastePlan(_prev: { ok: boolean; message: string; created: string[]; earlier: string[] } | null, form: FormData) {
  const user = await requireUser();
  try {
    const { workouts, created, past, earlier } = await importPlan(user.id, String(form.get("text") ?? ""));
    revalidatePath("/", "layout");
    const n = created.length;
    return {
      ok: true,
      message: (n ? `Added ${n} workout${n === 1 ? "" : "s"}.` : `Already added: ${workouts} workout${workouts === 1 ? "" : "s"}.`) + (past ? ` ${past} dated before today left out.` : ""),
      created,
      earlier,
    };
  } catch (error) {
    if (error instanceof ClientError) return { ok: false, message: error.message, created: [], earlier: [] };
    throw error;
  }
}

// Undo of a pasted plan, or dropping the plan pasted before it. Returns how many went.
export async function removeWorkouts(ids: string[]) {
  const user = await requireUser();
  const removed = await deleteWorkouts(user.id, ids);
  revalidatePath("/", "layout");
  return removed;
}

export async function acceptWorkout(workoutId: string) {
  const user = await requireUser();
  // Deleted in another tab meanwhile: nothing to approve, the list just refreshes.
  await approveWorkout(user.id, workoutId).catch((e) => { if (!(e instanceof ClientError)) throw e; });
  revalidatePath("/", "layout");
}

export async function removeWorkout(workoutId: string) {
  const user = await requireUser();
  // A workout with a run stays (409): the list simply still shows it.
  await deleteWorkout(user.id, workoutId).catch((e) => {
    if (!(e instanceof ClientError)) throw e;
  });
  revalidatePath("/", "layout");
}

// A coach link for an assistant with no connector, with the sentence to send it in. Only the
// link's hash is stored, so this answer is the one time it can be shown.
export async function newCoachLink() {
  const user = await requireUser();
  const url = await createCoachLink(user.id);
  revalidatePath("/");
  return { url, invite: coachInvite(url) };
}

export async function removeCoachLink(id: string) {
  const user = await requireUser();
  await revokeCoachLink(user.id, id);
  revalidatePath("/");
}

// Disconnects an assistant for this user only. A client can be shared by many users
// (e.g. one assistant's client_id), so the client row stays; this user's consent and tokens go.
// /mcp then rejects this user's still-valid access tokens (no consent → 401).
export async function revokeConnection(clientId: string) {
  const user = await requireUser();
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const table of ["oauthConsent", "oauthRefreshToken", "oauthAccessToken"]) {
      await client.query(`delete from "${table}" where "clientId" = $1 and "userId" = $2`, [clientId, user.id]);
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  revalidatePath("/");
}
