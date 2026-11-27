"use client";

import { useState, useTransition } from "react";
import { newCoachLink } from "@/app/actions";

// For an assistant that cannot add a connector: one link it opens, with no sign-in on its side.
// The link is shown here once, right after it is made.
export function NewCoachLink() {
  const [link, setLink] = useState<{ url: string; invite: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="surface flex flex-col gap-3 p-4">
      <div>
        <h3 className="font-medium">An assistant without a connector</h3>
        <p className="muted text-sm">
          Make a coach link and send it to your personal assistant in your chat. It opens the link, sees your training and plans your workouts.
          Nothing to install, no sign-in on its side.
        </p>
      </div>
      {link && (
        <>
          <input readOnly value={link.url} aria-label="Coach link" className="input font-mono text-sm" onFocus={(e) => e.target.select()} />
          <p className="muted text-sm">
            Shown once. Anyone who has this link can read your training and plan workouts, so send it only to your assistant. Disconnect it above at any time.
          </p>
        </>
      )}
      <button
        type="button"
        className="btn"
        disabled={pending}
        onClick={async () => {
          if (!link) return start(async () => setLink(await newCoachLink()));
          await navigator.clipboard.writeText(link.invite);
          setCopied(true);
        }}
      >
        {!link ? "New coach link" : copied ? "Copied, with a line for your assistant" : "Copy it for your assistant"}
      </button>
    </div>
  );
}
