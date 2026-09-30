"use client";

import { useActionState, useState } from "react";
import { addWorkout } from "@/app/actions";

export function NewWorkoutForm() {
  const [error, action, pending] = useActionState(addWorkout, null);
  // New id after each submit; a double click sends the same id and saves once.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());

  return (
    <form action={(form) => { action(form); setRequestId(crypto.randomUUID()); }} className="surface grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
      <input type="hidden" name="request_id" value={requestId} />
      <Field label="Name" className="col-span-2 sm:col-span-4">
        <input name="name" required maxLength={100} placeholder="8 × 400 m" className="input" />
      </Field>
      <Field label="Repeats"><input name="repeats" type="number" min={1} max={50} defaultValue={8} required className="input" /></Field>
      <Field label="Work (sec)"><input name="work_sec" type="number" min={5} max={3600} defaultValue={90} required className="input" /></Field>
      <Field label="Rest (sec)"><input name="rest_sec" type="number" min={0} max={3600} defaultValue={60} required className="input" /></Field>
      <Field label="Target pace (m:ss/km)"><input name="target_pace" pattern="\d{1,2}:\d{2}" placeholder="5:00" className="input" /></Field>
      <Field label="Warmup (min)"><input name="warmup_min" type="number" min={0} max={120} defaultValue={10} className="input" /></Field>
      <Field label="Cooldown (min)"><input name="cooldown_min" type="number" min={0} max={120} defaultValue={5} className="input" /></Field>
      <Field label="Date" className="col-span-2"><input name="scheduled_for" type="date" className="input" /></Field>
      {error && <p role="alert" className="col-span-2 text-sm text-[var(--bad)] sm:col-span-4">{error}</p>}
      <button className="btn col-span-2 sm:col-span-4" disabled={pending}>Add workout</button>
    </form>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="muted text-xs">{label}</span>
      {children}
    </label>
  );
}
