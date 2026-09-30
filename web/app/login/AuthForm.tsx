"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

// Where to land after Google. During an assistant's OAuth flow this page carries the
// authorization request; sending the user back to /authorize with a fresh session
// continues to the consent page instead of the dashboard.
function afterSignIn() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("client_id")) return "/";
  for (const key of [...params.keys()]) if (key === "sig" || key === "exp" || key.startsWith("ba_")) params.delete(key);
  return `/api/auth/oauth2/authorize?${params}`;
}

export function AuthForm({ google, passwordSignup }: { google: boolean; passwordSignup: boolean }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      {google && (
        <>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              const { error } = await authClient.signIn.social({ provider: "google", callbackURL: afterSignIn() });
              if (error) {
                setPending(false);
                setError(error.message ?? "Google sign-in failed");
              }
            }}
          >
            Continue with Google
          </button>
          <p className="muted text-center text-xs">or sign in with a password</p>
        </>
      )}
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
        {passwordSignup && (
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
    </div>
  );
}
