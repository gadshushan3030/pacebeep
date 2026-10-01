# App Review

What App Store Connect asks for under **App Review Information**, and the account the reviewer signs in with.

## The demo account

Sign-up is closed while Google or Apple sign-in is on, so the account is made by a script. Against production, with the Neon connection string from Vercel → Storage:

```bash
DATABASE_URL='<Neon URL>' npm --prefix web run demo:account
```

It prints the email (`appreview@pacebeep.example`) and, the first time, a password. Run it again before each submission: it resets the three workouts, recreates the account if a reviewer deleted it, and keeps the password (set `DEMO_PASSWORD` to replace it). The workouts have no date, so they stay on the app's list however long the review waits.

## App Store Connect fields

- **Sign-in required**: on. User name and password from the script.
- **Notes**:

```
PaceBeep plays interval running workouts. Users plan them with their AI assistant (ChatGPT or Claude, connected to our server), and the app plays them. The demo account already has three workouts, so no assistant is needed.

1. Tap "Sign in to PaceBeep", sign in with the demo account under "or sign in with a password", and tap Allow.
2. Tap Start on "Quick intervals" (about 5 minutes). Beeps and voice cues mark the changes between running and resting.
3. Lock the screen: the cues continue, and a Live Activity shows the current interval on the Lock Screen and in the Dynamic Island.
4. At the end, rate how hard it felt; the run is sent back to the server.

"Try a 2-minute test first" on the sign-in screen works without an account.

Background audio (UIBackgroundModes audio): each workout is rendered into one audio track with the beeps at their exact times. The cues are what the runner listens to while running with the phone locked or in a pocket, so they must keep playing in the background. Audio plays only during a workout.

Account deletion: Home → "Delete account" opens the account page on pacebeep.vercel.app, where "Delete my account" removes the account and all its data.
```
