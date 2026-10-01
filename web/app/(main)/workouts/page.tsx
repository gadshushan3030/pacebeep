import { removeWorkout } from "@/app/actions";
import { requireUser } from "@/lib/session";
import { describeWorkout, fmtDuration, listWorkouts } from "@/lib/workouts";
import { NewWorkoutForm } from "./NewWorkoutForm";

export default async function WorkoutsPage() {
  const user = await requireUser();
  const workouts = await listWorkouts(user.id);

  return (
    <>
      <h1 className="display text-[52px] [font-stretch:70%]">Workouts</h1>
      <NewWorkoutForm />
      <ul className="surface divide-y divide-[var(--border)]">
        {workouts.map((w) => (
          <li key={w.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="font-medium">
                {w.name} {w.source === "assistant" && <span className="muted text-xs">· by assistant</span>}
              </div>
              <div className="muted text-sm">
                {w.warmup_sec > 0 && `${fmtDuration(w.warmup_sec)} warmup · `}
                {describeWorkout(w)}
                {w.cooldown_sec > 0 && ` · ${fmtDuration(w.cooldown_sec)} cooldown`}
                {w.target_pace_sec_per_km && ` · ${fmtDuration(w.target_pace_sec_per_km)}/km`}
                {w.scheduled_for && ` · ${w.scheduled_for}`}
              </div>
            </div>
            <form action={removeWorkout.bind(null, w.id)}>
              <button aria-label={`Delete ${w.name}`} className="muted size-11 rounded-full hover:bg-black/5 dark:hover:bg-white/10">✕</button>
            </form>
          </li>
        ))}
        {!workouts.length && <li className="muted p-4 text-center">No workouts yet.</li>}
      </ul>
    </>
  );
}
