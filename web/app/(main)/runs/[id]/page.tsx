import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { fmtDuration, formatDate, getRun } from "@/lib/workouts";

const TZ = "Asia/Jerusalem";
const COLOR = { warmup: "var(--neutral)", work: "var(--signal)", rest: "var(--rest)", cooldown: "var(--neutral)" } as const;
const RPE_WORD = ["", "very easy", "very easy", "easy", "easy", "moderate", "moderate", "hard", "hard", "very hard", "all out"];

export default async function RunPage({ params }: PageProps<"/runs/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const run = await getRun(user.id, id).catch(() => notFound());
  const time = (d: Date) => new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  const seconds = Math.round((new Date(run.ended_at).getTime() - new Date(run.started_at).getTime()) / 1000);
  const longest = Math.max(1, ...run.intervals.map((iv) => Math.max(iv.planned_sec ?? 0, iv.actual_sec)));
  const work = run.intervals.filter((iv) => iv.kind === "work");
  const repsDone = work.filter((iv) => iv.planned_sec == null || iv.actual_sec >= iv.planned_sec - 1).length;
  const rated = [...run.feedback].reverse().find((f) => f.rpe != null);
  const notes = run.feedback.filter((f) => f.notes);
  const withPace = run.intervals.some((iv) => iv.avg_pace_sec_per_km);
  let rep = 0;

  return (
    <>
      <div className="flex flex-col gap-3">
        <Link href="/" className="flex min-h-11 items-center gap-1.5 self-start font-semibold">
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Dashboard
        </Link>
        <h1 dir="auto" className="display text-[56px] [font-stretch:68%]">{run.workout_name ?? "Free run"}</h1>
        <p className="muted">
          {formatDate(run.started_at, { weekday: "short", day: "numeric", month: "short", timeZone: TZ })} ·{" "}
          {time(run.started_at)} to {time(run.ended_at)} · {run.source === "device" ? "recorded by your phone" : "you told your coach"}
        </p>
      </div>

      <div className="grid items-start gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(460px,100%),1fr))]">
        <section aria-labelledby="intervals" className="surface flex flex-col gap-3 px-[22px] py-5">
          <h2 id="intervals" className="display text-[26px] [font-stretch:76%]">Planned vs. actual</h2>
          {run.intervals.length ? (
            <table className="num w-full border-collapse text-[15px]">
              <thead>
                <tr className="eyebrow text-start">
                  <th scope="col" className="py-1.5 text-start font-bold">Interval</th>
                  <th scope="col" className="text-start font-bold">Planned</th>
                  <th scope="col" className="text-start font-bold">Actual</th>
                  {withPace && <th scope="col" className="text-start font-bold">Pace</th>}
                  <th scope="col" className="w-[38%]"><span className="sr-only">Length</span></th>
                </tr>
              </thead>
              <tbody>
                {run.intervals.map((iv, i) => {
                  const label = iv.kind === "work" ? `Run ${++rep}` : { warmup: "Warm up", rest: "Rest", cooldown: "Cool down" }[iv.kind];
                  const planned = iv.planned_sec ?? iv.actual_sec;
                  return (
                    <tr key={i} className="border-t border-[var(--border)]">
                      <td className={`py-2.5 ${iv.kind === "work" ? "font-bold" : ""}`}>{label}</td>
                      <td>{iv.planned_sec != null ? fmtDuration(iv.planned_sec) : "–"}</td>
                      <td>{fmtDuration(iv.actual_sec)}</td>
                      {withPace && <td>{iv.avg_pace_sec_per_km ? fmtDuration(iv.avg_pace_sec_per_km) : "–"}</td>}
                      <td>
                        {/* The track is the plan; the fill is what was run. */}
                        <div className="h-2 rounded bg-[var(--border)]" style={{ width: `${(planned / longest) * 100}%` }}>
                          <div className="h-2 rounded" style={{ width: `${Math.min(1, iv.actual_sec / planned) * 100}%`, background: COLOR[iv.kind] }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="muted">No interval data.</p>
          )}
        </section>

        <div className="flex flex-col gap-6">
          <section aria-labelledby="felt" className="flex flex-col gap-3 rounded-[22px] bg-[var(--inverse)] p-[22px] text-[var(--on-inverse)]">
            <h2 id="felt" className="eyebrow !text-[var(--on-inverse-muted)]">How it felt</h2>
            {rated ? (
              <div className="flex items-baseline gap-2.5">
                <span className="display text-[96px] leading-[0.85] [font-stretch:66%]">{rated.rpe}</span>
                <span className="text-[22px] font-bold">/ 10 · {RPE_WORD[rated.rpe!]}</span>
              </div>
            ) : (
              <p className="text-lg font-bold">Not rated</p>
            )}
            {notes.map((f) => (
              <p key={f.id} dir="auto" className="leading-relaxed">{f.notes}</p>
            ))}
            <p className="text-[13px] leading-relaxed text-[var(--on-inverse-muted)]">Your own rating, kept apart from the measured times.</p>
          </section>
          <section aria-label="Summary" className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(120px,1fr))]">
            <Fact value={fmtDuration(seconds)} label="total" />
            {work.length > 0 && <Fact value={`${repsDone} / ${work.length}`} label="reps" />}
            {run.distance_m != null && <Fact value={(run.distance_m / 1000).toFixed(2)} label="km" />}
          </section>
        </div>
      </div>
    </>
  );
}

function Fact({ value, label }: { value: string; label: string }) {
  return (
    <div className="surface flex flex-col gap-1 !rounded-[18px] p-4">
      <span className="display num text-[32px] [font-stretch:70%]">{value}</span>
      <span className="muted text-[13px]">{label}</span>
    </div>
  );
}
