import Link from "next/link";
import { revokeConnection } from "@/app/actions";
import { sql } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { describeWorkout, listRuns, summary } from "@/lib/workouts";

const fmtDate = (d: Date | string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export default async function Dashboard() {
  const user = await requireUser();
  const [s, runs, connections] = await Promise.all([
    summary(user.id),
    listRuns(user.id, 10),
    sql<{ client_id: string; name: string | null; granted_at: Date }>(
      `select c."clientId" as client_id, c.name, cs."createdAt" as granted_at
       from "oauthConsent" cs join "oauthClient" c on c."clientId" = cs."clientId"
       where cs."userId" = $1 order by cs."createdAt" desc`,
      [user.id],
    ),
  ]);

  return (
    <>
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="grid grid-cols-3 gap-3">
        <Tile label="Runs, 7 days" value={s.runs_7d} />
        <Tile label="Runs, 30 days" value={s.runs_30d} />
        <Tile label="km, 30 days" value={(s.distance_30d_m / 1000).toFixed(1)} />
      </div>

      <Section title="Upcoming workouts" empty={!s.upcoming.length} emptyText="Nothing scheduled.">
        {s.upcoming.map((w) => (
          <li key={w.id} className="flex justify-between px-4 py-3">
            <span className="font-medium">{w.name}</span>
            <span className="muted text-sm">
              {describeWorkout(w)} · {w.scheduled_for && fmtDate(w.scheduled_for)}
            </span>
          </li>
        ))}
      </Section>

      <Section title="Recent runs" empty={!runs.length} emptyText="No runs yet.">
        {runs.map((r) => (
          <li key={r.id}>
            <Link href={`/runs/${r.id}`} className="flex justify-between px-4 py-3 hover:bg-black/5 dark:hover:bg-white/5">
              <span className="font-medium">{r.workout_name ?? "Free run"}</span>
              <span className="muted text-sm">
                {fmtDate(r.started_at)}
                {r.distance_m != null && ` · ${(r.distance_m / 1000).toFixed(2)} km`} · {r.source}
              </span>
            </Link>
          </li>
        ))}
      </Section>

      <Section title="Connected assistants" empty={!connections.length} emptyText="No assistants connected.">
        {connections.map((c) => (
          <li key={c.client_id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{c.name || c.client_id}</div>
              <div className="muted text-xs">Allowed {fmtDate(c.granted_at)}</div>
            </div>
            <form action={revokeConnection.bind(null, c.client_id)}>
              <button className="btn btn-ghost text-sm">Disconnect</button>
            </form>
          </li>
        ))}
      </Section>
    </>
  );
}

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="surface flex flex-col items-center gap-1 p-4">
      <span className="text-2xl font-bold tabular-nums">{value}</span>
      <span className="muted text-xs">{label}</span>
    </div>
  );
}

function Section({ title, empty, emptyText, children }: { title: string; empty: boolean; emptyText: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <ul className="surface divide-y divide-[var(--border)]">{empty ? <li className="muted p-4 text-center">{emptyText}</li> : children}</ul>
    </section>
  );
}
