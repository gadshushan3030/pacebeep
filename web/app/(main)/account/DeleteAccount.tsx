"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function DeleteAccount() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <button
        className="btn self-start bg-[var(--bad)]"
        disabled={pending}
        onClick={async () => {
          if (!window.confirm("Delete your PaceBeep account and all its data? This cannot be undone.")) return;
          setPending(true);
          const { error } = await authClient.deleteUser({ callbackURL: "/login" });
          if (error) {
            setPending(false);
            // A long-lived session must be refreshed before deleting.
            return setError(error.message ?? "Could not delete the account. Sign out, sign in again and retry.");
          }
          router.replace("/login");
        }}
      >
        {pending ? "Deleting…" : "Delete my account"}
      </button>
      {error && <p role="alert" className="text-sm text-[var(--bad)]">{error}</p>}
    </div>
  );
}
