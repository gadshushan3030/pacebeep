import Link from "next/link";
import { revokeConnection } from "@/app/actions";
import { sql, today } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { fmtDuration, fmtHours, listRuns, summary, totalSec, weekWorkouts } from "@/lib/workouts";

const TZ = "Asia/Jerusalem";
const day = (ymd: string, opts: Intl.DateTimeFormatOptions) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
const fmtDate = (d: Date | string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: TZ });

// Monday to Sunday around a YYYY-MM-DD.
function weekOf(ymd: string) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => new Date(d.getTime() + i * 86400000).toISOString().slice(0, 10));
}

export default async function Dashboard() {
  const user = await requireUser();
  const now = today();
  const days = weekOf(now);
  const [s, runs, week, connections] = await Promise.all([
    summary(user.id),
    listRuns(user.id, 8),
    weekWorkouts(user.id, days[0], days[6]),
    sql<{ client_id: string; name: string | null; granted_at: Date }>(
      `select c."clientId" as client_id, c.name, cs."createdAt" as granted_at
       from "oauthConsent" cs join "oauthClient" c on c."clientId" = cs."clientId"
       where cs."userId" = $1 order by cs."createdAt" desc`,
      [user.id],
    ),
  ]);
  const sameMonth = days[0].slice(0, 7) === days[6].slice(0, 7);

  return (
    <>
      <section aria-labelledby="week" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 id="week" className="display text-[52px] [font-stretch:70%]">This week</h1>
          <span className="muted text-[15px]">
            {sameMonth ? day(days[0], { day: "numeric" }) : day(days[0], { day: "numeric", month: "short" })}–{day(days[6], { day: "numeric", month: "short" })}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-7">
          {days.map((d) => {
            const planned = week.filter((w) => w.scheduled_for === d);
            const isToday = d === now;
            const label = `${day(d, { weekday: "short", day: "numeric" })}${isToday ? " · today" : ""}`;
            if (!planned.length) {
              return (
                <div key={d} className={`flex flex-col gap-2 rounded-[18px] border-[1.5px] border-dashed p-3.5 md:min-h-[150px] ${isToday ? "border-[var(--text)]" : "border-[var(--control)]"}`}>
                  <span className="eyebrow">{label}</span>
                  <span className="muted text-sm">Rest day</span>
                </div>
              );
            }
            return (
              <div
                key={d}
                className={`flex flex-col gap-2 rounded-[18px] p-3.5 md:min-h-[150px] ${isToday ? "bg-[var(--inverse)] text-[var(--on-inverse)]" : "surface !rounded-[18px]"}`}
              >
                <span className={`eyebrow ${isToday ? "!text-[var(--signal-text)]" : ""}`}>{label}</span>
                {planned.map((w) => (
                  <div key={w.id} className="flex flex-1 flex-col gap-1.5">
                    <span dir="auto" className="display text-xl leading-[1.05] [font-stretch:76%]">{w.name}</span>
                    <span className={`text-[13px] ${isToday ? "text-[var(--on-inverse-muted)]" : "muted"}`}>
                      {Math.round(totalSec(w) / 60)} min{w.target_pace_sec_per_km && ` · ${fmtDuration(w.target_pace_sec_per_km)} /km`}
                    </span>
                    {w.done && (
                      <span className={`pill mt-auto self-start ${isToday ? "bg-[var(--on-inverse)] text-[var(--inverse)]" : "bg-[var(--inverse)] text-[var(--on-inverse)]"}`}>
                        Done{w.rpe != null && ` · RPE ${w.rpe}`}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </section>

      <section aria-label="Totals" className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))]">
        <Tile value={s.runs_7d} label="runs, last 7 days" />
        <Tile value={s.runs_30d} label="runs, last 30 days" />
        <Tile value={fmtHours(s.seconds_30d)} label="hours running, last 30 days" />
      </section>

      <div className="grid items-start gap-7 [grid-template-columns:repeat(auto-fit,minmax(min(440px,100%),1fr))]">
        <section aria-labelledby="runs" className="flex flex-col gap-3">
          <h2 id="runs" className="display text-[28px] [font-stretch:76%]">Recent runs</h2>
          <ul className="surface overflow-hidden">
            {runs.map((r) => (
              <li key={r.id} className="border-b border-[var(--border)] last:border-b-0">
                <Link href={`/runs/${r.id}`} className="flex min-h-[72px] items-center gap-4 px-[18px] py-3 hover:bg-black/[0.03] dark:hover:bg-white/5">
                  <DateStack date={r.started_at} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span dir="auto" className="text-[17px] font-bold">{r.workout_name ?? "Free run"}</span>
                    <span className="muted text-[13px]">
                      {r.source === "device" ? "Recorded by your phone" : "You told your coach"} ·{" "}
                      {fmtDuration(Math.round((new Date(r.ended_at).getTime() - new Date(r.started_at).getTime()) / 1000))}
                    </span>
                  </span>
                  {r.rpe != null && <span className="pill border-[1.5px] border-[var(--text)] text-[13px]">RPE {r.rpe}</span>}
                </Link>
              </li>
            ))}
            {!runs.length && <li className="muted p-5 text-center">No runs yet. They show up here after a run with the app, or when you tell your coach about one.</li>}
          </ul>
        </section>

        <section aria-labelledby="connected" className="flex flex-col gap-3">
          <h2 id="connected" className="display text-[28px] [font-stretch:76%]">Connected</h2>
          <ul className="surface overflow-hidden">
            {connections.map((c) => (
              <li key={c.client_id} className="flex min-h-[76px] items-center gap-3.5 border-b border-[var(--border)] px-[18px] py-3.5 last:border-b-0">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[17px] font-bold">{c.name || c.client_id}</span>
                  <span className="muted text-[13px]">
                    {c.name === "PaceBeep iPhone" ? "Plays workouts, sends runs and RPE" : "Reads your training, plans workouts"} · allowed {fmtDate(c.granted_at)}
                  </span>
                </span>
                <form action={revokeConnection.bind(null, c.client_id)}>
                  <button className="btn btn-ghost text-sm">Disconnect</button>
                </form>
              </li>
            ))}
            {!connections.length && <li className="muted p-5 text-center">Nothing connected yet.</li>}
          </ul>
          <p className="muted text-sm leading-relaxed">Disconnect cuts that app off at once. Your other connections keep working.</p>
        </section>
      </div>
    </>
  );
}

function Tile({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="surface flex flex-col gap-1 px-5 py-[18px]">
      <span className="display num text-[40px] [font-stretch:70%]">{value}</span>
      <span className="muted text-sm">{label}</span>
    </div>
  );
}

function DateStack({ date }: { date: Date }) {
  const d = new Date(date);
  return (
    <span className="flex w-11 flex-col items-center">
      <span className="eyebrow !text-[11px]">{d.toLocaleDateString("en-GB", { weekday: "short", timeZone: TZ })}</span>
      <span className="display text-2xl [font-stretch:75%]">{d.toLocaleDateString("en-GB", { day: "numeric", timeZone: TZ })}</span>
    </span>
  );
}
