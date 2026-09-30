import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, googleEnabled } from "@/lib/auth";
import { AuthForm } from "./AuthForm";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  // Signed in and not in the middle of an agent's OAuth authorization → dashboard.
  const oauthFlow = "client_id" in (await searchParams);
  if (!oauthFlow && (await auth.api.getSession({ headers: await headers() }))) redirect("/");

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-5">
      <h1 className="text-center text-3xl font-bold">PaceBeep</h1>
      {oauthFlow && <p className="muted text-center text-sm">Sign in to connect your AI assistant.</p>}
      <AuthForm google={googleEnabled} passwordSignup={process.env.SIGNUP_ENABLED !== "false" && !googleEnabled} />
    </main>
  );
}
