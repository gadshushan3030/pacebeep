"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

// Where to land after Apple or Google. During an assistant's OAuth flow this page carries the
// authorization request; sending the user back to /authorize with a fresh session
// continues to the consent page instead of the dashboard.
function afterSignIn() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("client_id")) return "/";
  for (const key of [...params.keys()]) if (key === "sig" || key === "exp" || key.startsWith("ba_")) params.delete(key);
  return `/api/auth/oauth2/authorize?${params}`;
}

export function AuthForm({ apple, google, passwordSignup }: { apple: boolean; google: boolean; passwordSignup: boolean }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const social = async (provider: "apple" | "google") => {
    setPending(true);
    const { error } = await authClient.signIn.social({ provider, callbackURL: afterSignIn() });
    if (error) {
      setPending(false);
      setError(error.message ?? "Sign-in failed");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {(apple || google) && (
        <>
          {/* Apple's button rules: black (white on a dark page), the Apple logo, "Continue with Apple", no smaller than the others. */}
          {apple && (
            <button type="button" className="btn bg-black text-white dark:bg-white dark:text-black" disabled={pending} onClick={() => social("apple")}>
              <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden>
                <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
              </svg>
              Continue with Apple
            </button>
          )}
          {google && (
            <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => social("google")}>
              Continue with Google
            </button>
          )}
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
