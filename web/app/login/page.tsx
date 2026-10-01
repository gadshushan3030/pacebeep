import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Mark } from "@/app/Mark";
import { auth, googleEnabled } from "@/lib/auth";
import { AuthForm } from "./AuthForm";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  // Signed in and not in the middle of an agent's OAuth authorization → dashboard.
  const oauthFlow = "client_id" in (await searchParams);
  if (!oauthFlow && (await auth.api.getSession({ headers: await headers() }))) redirect("/");

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <Mark size={56} />
        <h1 className="display text-[44px] [font-stretch:72%]">PaceBeep</h1>
        <p className="muted">Your coach plans the intervals. Your phone counts them.</p>
      </div>
      {oauthFlow && <p className="muted text-center text-sm">Sign in to connect it to your PaceBeep account.</p>}
      <AuthForm google={googleEnabled} passwordSignup={process.env.SIGNUP_ENABLED !== "false" && !googleEnabled} />
      <p className="muted text-center text-xs">
        <Link href="/privacy" className="underline">Privacy</Link> · <Link href="/terms" className="underline">Terms</Link>
      </p>
    </main>
  );
}
