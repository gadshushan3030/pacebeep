# App Review

What App Store Connect asks for under **App Review Information**.

## How the reviewer gets in

Every new account starts with three unscheduled workouts (`addStarterWorkouts` in `web/lib/workouts.ts`), so a reviewer who signs in with Apple or Google sees workouts right away, with no assistant and no demo credentials. "Try a 2-minute test first" on the sign-in screen works without any account.

If Apple asks for a demo account anyway, make one with a password (sign-up is closed while Google or Apple sign-in is on, so a script writes it). Against production, with the Neon connection string from Vercel → Storage:

```bash
DATABASE_URL='<Neon URL>' npm --prefix web run demo:account
```

It prints the email (`appreview@pacebeep.example`) and, the first time, a password, to put under **Sign-in required**. Safe to re-run: it resets the workouts, recreates the account if a reviewer deleted it, and keeps the password (set `DEMO_PASSWORD` to replace it).

## App Store Connect fields

- **Sign-in required**: off.
- **Notes**:

```
PaceBeep plays interval running workouts. Users plan them with their AI assistant (ChatGPT or Claude, connected to our server), and the app plays them. No assistant is needed to review it: every new account starts with three workouts.

1. Tap "Sign in to PaceBeep", then "Continue with Apple" (or Google), and tap Allow.
2. Tap Start on "First intervals" (about 5 minutes). Beeps and voice cues mark the changes between running and resting.
3. Lock the screen: the cues continue, and a Live Activity shows the current interval on the Lock Screen and in the Dynamic Island.
4. At the end, rate how hard it felt; the run is sent back to the server.

"Try a 2-minute test first" on the sign-in screen works without an account.

Background audio (UIBackgroundModes audio): each workout is rendered into one audio track with the beeps at their exact times. The cues are what the runner listens to while running with the phone locked or in a pocket, so they must keep playing in the background. Audio plays only during a workout.

Account deletion: Home → "Delete account" opens the account page on pacebeep.vercel.app, where "Delete my account" removes the account and all its data.
```
