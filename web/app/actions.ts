"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { pool } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { createWorkout, deleteWorkout, workoutInput } from "@/lib/workouts";

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
  });
  if (!parsed.success) return "Check the fields: " + parsed.error.issues.map((i) => i.path.join(".")).join(", ");
  // The form carries a UUID, so a double submit creates one workout, not two.
  await createWorkout(user.id, String(form.get("request_id")), parsed.data, "app");
  revalidatePath("/", "layout");
  return null;
}

export async function removeWorkout(workoutId: string) {
  const user = await requireUser();
  await deleteWorkout(user.id, workoutId);
  revalidatePath("/", "layout");
}

// Disconnects an assistant for this user only. A client can be shared by many users
// (e.g. one ChatGPT client_id), so the client row stays; this user's consent and tokens go.
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
