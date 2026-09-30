import { sql } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { ConsentButtons } from "./ConsentButtons";

// Better Auth sends the user here when an assistant (e.g. ChatGPT) asks to connect to /mcp.
// The allow/deny request carries the signed query and is verified by Better Auth.
export default async function ConsentPage({ searchParams }: PageProps<"/oauth/consent">) {
  const user = await requireUser();
  const { client_id } = await searchParams;
  const [client] =
    typeof client_id === "string"
      ? await sql<{ name: string | null; redirectUris: string[] }>(
          'select name, "redirectUris" from "oauthClient" where "clientId" = $1',
          [client_id],
        )
      : [];

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-5">
      <section className="surface flex flex-col gap-4 p-6">
        {client ? (
          <>
            <h1 className="text-xl font-bold">Connect an assistant</h1>
            <p>
              <strong>{client.name || "An unnamed app"}</strong> wants to access your PaceBeep data as <strong>{user.email}</strong>:
            </p>
            <ul className="muted list-disc ps-5 text-sm">
              <li>Read your runs, workouts and summary</li>
              <li>Create and update workout plans</li>
              <li>Record runs and feedback</li>
            </ul>
            <p className="muted text-sm">
              Returns to: <span className="break-all">{client.redirectUris?.join(", ")}</span>
            </p>
            <p className="muted text-sm">If you did not start this connection, deny it.</p>
            <ConsentButtons />
          </>
        ) : (
          <h1 className="text-xl font-bold">This connection request was not found or has expired.</h1>
        )}
      </section>
    </main>
  );
}
