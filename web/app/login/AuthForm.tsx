"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function AuthForm({ signupEnabled }: { signupEnabled: boolean }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      className="surface flex flex-col gap-4 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        const form = new FormData(e.currentTarget);
        const email = String(form.get("email"));
        const password = String(form.get("password"));
        const { data, error } =
          mode === "signin"
            ? await authClient.signIn.email({ email, password })
            : await authClient.signUp.email({ email, password, name: email.split("@")[0] });
        if (error) {
          setPending(false);
          return setError(error.message ?? "Something went wrong");
        }
        // During an agent's OAuth flow the server answers with the next step (consent page).
        window.location.href = (data as { url?: string }).url ?? "/";
      }}
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Email</span>
        <input name="email" type="email" autoComplete="username" required className="input" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Password</span>
        <input
          name="password"
          type="password"
          minLength={10}
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          required
          className="input"
        />
      </label>
      {error && <p role="alert" className="text-sm text-[var(--bad)]">{error}</p>}
      <button className="btn" disabled={pending}>{pending ? "…" : mode === "signin" ? "Sign in" : "Create account"}</button>
      {signupEnabled && (
        <button
          type="button"
          className="muted text-sm underline"
          onClick={() => {
            setError(null);
            setMode(mode === "signin" ? "signup" : "signin");
          }}
        >
          {mode === "signin" ? "New here? Create an account" : "Have an account? Sign in"}
        </button>
      )}
    </form>
  );
}
