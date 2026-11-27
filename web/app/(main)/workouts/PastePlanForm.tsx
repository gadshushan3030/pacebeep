"use client";

import { useActionState, useState, useTransition } from "react";
import { pastePlan, removeWorkouts } from "@/app/actions";

// A plan from a personal assistant, no connection needed: copy the prompt, give it to the assistant, paste its answer.
export function PastePlanForm({ prompt }: { prompt: string }) {
  const [result, action, pending] = useActionState(pastePlan, null);
  const [copied, setCopied] = useState(false);
  // What Undo or "Remove the earlier plan" did, keyed by the result it belongs to.
  const [after, setAfter] = useState<{ of: typeof result; undone?: number; cleared?: number } | null>(null);
  const [removing, start] = useTransition();
  const done = after?.of === result ? after : null;
  const s = (n: number) => `${n} workout${n === 1 ? "" : "s"}`;

  return (
    <form action={action} className="surface flex flex-col gap-3 p-4">
      <div>
        <h2 className="font-medium">Paste a plan from your personal assistant</h2>
        <p className="muted text-sm">
          Copy the prompt, send it to your personal assistant with what you want (“a 9-week run-walk plan to my first 5K, 3 days a week”),
          then paste its answer here.
        </p>
      </div>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={async () => {
          await navigator.clipboard.writeText(prompt);
          setCopied(true);
        }}
      >
        {copied ? "Prompt copied" : "Copy the prompt"}
      </button>
      <textarea name="text" required rows={4} maxLength={200000} placeholder="Paste the assistant's answer" aria-label="The assistant's answer" className="input font-mono text-sm" />
      {result && (
        <div role={result.ok ? "status" : "alert"} className={`flex flex-col gap-2 text-sm ${result.ok ? "" : "text-[var(--bad)]"}`}>
          <p className="whitespace-pre-wrap">{done?.undone != null ? `Undone: removed ${s(done.undone)}.` : result.message}</p>
          {result.created.length > 0 && done?.undone == null && (
            <button type="button" className="btn btn-ghost self-start text-sm" disabled={removing} onClick={() => start(async () => setAfter({ ...done, of: result, undone: await removeWorkouts(result.created) }))}>
              Undo
            </button>
          )}
          {/* A second plan lands next to the first one: the runner decides whether the first one goes. */}
          {result.earlier.length > 0 && done?.undone == null && (
            <>
              <p>{done?.cleared != null ? `Removed ${s(done.cleared)} from the earlier plan.` : `${s(result.earlier.length)} from a plan you pasted before ${result.earlier.length === 1 ? "is" : "are"} still in your list.`}</p>
              {done?.cleared == null && (
                <button type="button" className="btn btn-ghost self-start text-sm" disabled={removing} onClick={() => start(async () => setAfter({ ...done, of: result, cleared: await removeWorkouts(result.earlier) }))}>
                  Remove the earlier plan
                </button>
              )}
            </>
          )}
        </div>
      )}
      <button className="btn" disabled={pending}>Add the plan</button>
    </form>
  );
}
