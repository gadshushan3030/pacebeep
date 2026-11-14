# Good first issues

Small, real tasks spotted in the current codebase. Each one should fit a first-time contributor in a single PR. Open them as GitHub issues with the labels `good first issue` and `enhancement` or `bug` as noted. Do not invent new product scope here — every item points at an existing gap.

> Maintainers: copy the **Title** into the issue title, paste **Why / Files / Acceptance** into the body, add labels, and link back to this file.

---

## 1. Optional notes after RPE on the Done screen

**Labels:** `good first issue`, `enhancement`

**Why:** After a workout the app collects RPE (`DoneView` → `Runner.rate`), but `Upload.Feedback` only encodes `rpe`. The server already accepts `notes` on `POST /api/runs` and the MCP tool `add_run_feedback` documents notes. Coaches never see free-text context from the phone.

**Files:** `ios/PaceBeep/DoneView.swift`, `ios/PaceBeep/Runner.swift`, `ios/PaceBeep/Coach.swift` (`Upload.Feedback`)

**Acceptance:**
- After picking an RPE (or alongside it), the runner can enter optional notes (≤ 1000 chars to match the API).
- Notes are sent in the same feedback payload as RPE (or a follow-up upload with its own `request_id`).
- Leaving notes empty still works; signing out / offline outbox behavior is unchanged.

---

## 2. VoiceOver labels for RPE buttons

**Labels:** `good first issue`, `bug`

**Why:** RPE buttons in `DoneView` only set `.isSelected`. VoiceOver currently announces bare numbers with no “easy / all out” context.

**Files:** `ios/PaceBeep/DoneView.swift`

**Acceptance:**
- Each button has an accessibility label like `RPE 7, hard` (reuse the word scale already used on the web run page if you want consistency).
- Selected state remains announced.
- Visual UI is unchanged.

---

## 3. Fix empty accessibility label on the “done” checkmark

**Labels:** `good first issue`, `bug`

**Why:** In `HomeView`, the trailing status icon uses `.accessibilityLabel(workout.done ? "Done" : "")`. An empty string is worse than no label for incomplete rows.

**Files:** `ios/PaceBeep/HomeView.swift`

**Acceptance:**
- Done workouts announce “Done” (or equivalent).
- Not-done workouts either omit the label or announce a useful state (“Ready to start” / “Pending approval”) — never `""`.

---

## 4. Document `SERVER_URL` in `Local.xcconfig.example`

**Labels:** `good first issue`, `enhancement`

**Why:** `ios/Config.xcconfig` mentions overriding `SERVER_URL` for local backends, but `Local.xcconfig.example` only shows team / bundle id. New iOS contributors guessing the override often point the app at production by mistake.

**Files:** `ios/Local.xcconfig.example`, optionally a one-line pointer in `README.md` / `CONTRIBUTING.md`

**Acceptance:**
- Example file shows a commented `SERVER_URL = http:/$()/localhost:3200` (or whatever syntax matches xcconfig `//` escaping already used in `Config.xcconfig`).
- A short comment explains when to set it and that App Transport Security / cleartext may need a Debug exception for `http://`.

---

## 5. Dashboard “Connected” empty state → MCP quick start

**Labels:** `good first issue`, `enhancement`

**Why:** When no OAuth clients are linked, the dashboard only says “Nothing connected yet.” Visitors who just signed up never see how to attach ChatGPT / Claude / Cursor.

**Files:** `web/app/(main)/page.tsx`, optionally a short public `/connect` page or link to the README section on the marketing site

**Acceptance:**
- Empty state includes a clear CTA: connect an AI coach, with the production MCP URL `https://pacebeep.vercel.app/mcp` or a link to the README “Connect your AI coach” section.
- Copy stays short; no new card clutter on the filled state.

---

## 6. Optional notes field on the web New Workout form

**Labels:** `good first issue`, `enhancement`

**Why:** `workoutInput` already allows `notes`, and the iPhone home card renders them, but `NewWorkoutForm` never collects notes. Manual web plans cannot carry coach-style reminders.

**Files:** `web/app/(main)/workouts/NewWorkoutForm.tsx`, `web/app/actions.ts` (`addWorkout`)

**Acceptance:**
- Optional notes textarea (respect existing max length in `workoutInput`).
- Saved workout returns the notes in `list_workouts` / iOS sync.
- Leaving notes blank behaves as today.

---

## 7. MCP `delete_workout` tool wrapping existing `deleteWorkout`

**Labels:** `good first issue`, `enhancement` (related to #33, but scoped to MCP only)

**Why:** The web UI already deletes via `removeWorkout` → `deleteWorkout` in `web/lib/workouts.ts`, but the MCP server has no delete tool. Coaches resort to moving mistaken workouts to yesterday (see issue #33).

**Files:** `web/lib/mcp.ts`, `web/test/mcp.test.mts`, README MCP tools table

**Acceptance:**
- New tool `delete_workout` (`workout_id`) calls `deleteWorkout` scoped to the token’s user.
- Missing / other-user ids behave like other tools (“not found”).
- README tools table + a test assertion updated.
- Does **not** need to implement iOS archive UI (that stays with #33).

---

## 8. Stop hardcoding `Asia/Jerusalem` for “today” on the web

**Labels:** `good first issue`, `enhancement`

**Why:** `web/lib/db.ts` `today()` and dashboard / run detail pages hardcode `Asia/Jerusalem`. Runners outside Israel see the wrong “today” boundary and week strip.

**Files:** `web/lib/db.ts`, `web/app/(main)/page.tsx`, `web/app/(main)/runs/[id]/page.tsx` (and any other `TZ = "Asia/Jerusalem"` call sites)

**Acceptance:**
- Prefer a single shared helper (env default is fine for v1, e.g. `USER_TIMEZONE` / `APP_TIMEZONE`, falling back to `Asia/Jerusalem` for the hosted demo).
- Document the env var in `web/.env.example`.
- No migration required for this first step (per-user timezone can be a follow-up).

---

## 9. Accessibility: announce Live Activity phase changes in-app

**Labels:** `good first issue`, `enhancement`

**Why:** `RunView` already labels the countdown, but phase flips (work → rest) rely on color. VoiceOver users get little cue when the beep fires and the screen turns blue.

**Files:** `ios/PaceBeep/RunView.swift` (and optionally `Runner` posting accessibility announcements)

**Acceptance:**
- On phase change, post a short `AccessibilityNotification.Announcement` (e.g. “Rest, 60 seconds”).
- No change to audio / Live Activity timing.
- Does not require Widget extension changes.

---

## 10. Consent page: name the hosted MCP URL the coach will use

**Labels:** `good first issue`, `enhancement`

**Why:** `/oauth/consent` lists permissions and redirect URIs, but never shows `https://pacebeep.vercel.app/mcp` (or the current origin’s `/mcp`). New users approving ChatGPT / Claude cannot verify what they are connecting.

**Files:** `web/app/oauth/consent/page.tsx`

**Acceptance:**
- Show the MCP resource URL derived from the request origin (or `BETTER_AUTH_URL`) as `/mcp`.
- Keep the existing allow/deny flow untouched.
- Works for self-hosted deploys (no hardcoded production host required if origin is used).
