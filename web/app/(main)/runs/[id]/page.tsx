import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { fmtDuration, getRun } from "@/lib/workouts";

export default async function RunPage({ params }: PageProps<"/runs/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const run = await getRun(user.id, id).catch(() => notFound());
  const minutes = Math.round((new Date(run.ended_at).getTime() - new Date(run.started_at).getTime()) / 60000);

  return (
    <>
      <div className="flex flex-col gap-1">
        <Link href="/" className="muted text-sm">← Dashboard</Link>
        <h1 className="text-2xl font-bold">{run.workout_name ?? "Free run"}</h1>
        <p className="muted text-sm">
          {new Date(run.started_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} · {minutes} min
          {run.distance_m != null && ` · ${(run.distance_m / 1000).toFixed(2)} km`} · {run.source === "device" ? "recorded by phone" : "entered manually"}
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Intervals (planned vs. actual)</h2>
        <table className="surface w-full text-sm">
          <thead className="muted text-xs">
            <tr><th className="p-3 text-start">#</th><th className="text-start">Kind</th><th className="text-end">Planned</th><th className="text-end">Actual</th><th className="p-3 text-end">Pace</th></tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {run.intervals.map((iv, i) => (
              <tr key={i}>
                <td className="p-3">{i + 1}</td>
                <td>{iv.kind}</td>
                <td className="text-end tabular-nums">{iv.planned_sec != null ? fmtDuration(iv.planned_sec) : "–"}</td>
                <td className="text-end tabular-nums">{fmtDuration(iv.actual_sec)}</td>
                <td className="p-3 text-end tabular-nums">{iv.avg_pace_sec_per_km ? `${fmtDuration(iv.avg_pace_sec_per_km)}/km` : "–"}</td>
              </tr>
            ))}
            {!run.intervals.length && <tr><td colSpan={5} className="muted p-4 text-center">No interval data.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">How it felt (self-report)</h2>
        <ul className="surface divide-y divide-[var(--border)]">
          {run.feedback.map((f) => (
            <li key={f.id} className="px-4 py-3 text-sm">
              {f.rpe != null && <strong>RPE {f.rpe}/10 </strong>}
              {f.notes}
            </li>
          ))}
          {!run.feedback.length && <li className="muted p-4 text-center">No feedback.</li>}
        </ul>
      </section>
    </>
  );
}
