"use client";

import { useActionState, useState } from "react";
import { pastePlan } from "@/app/actions";

// A plan from a personal assistant, no connection needed: copy the prompt, give it to the assistant, paste its answer.
export function PastePlanForm({ prompt }: { prompt: string }) {
  const [result, action, pending] = useActionState(pastePlan, null);
  const [copied, setCopied] = useState(false);

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
        <p role={result.ok ? "status" : "alert"} className={`whitespace-pre-wrap text-sm ${result.ok ? "" : "text-[var(--bad)]"}`}>
          {result.message}
        </p>
      )}
      <button className="btn" disabled={pending}>Add the plan</button>
    </form>
  );
}
