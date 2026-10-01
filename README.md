# PaceBeep

Interval running with an AI coach. Plan interval workouts, record runs, and let your assistant (ChatGPT, Claude or any MCP client) read your training and write plans, over OAuth.

- **web/** – Next.js 16 backend and dashboard: accounts, workouts, runs, and an MCP server at `/mcp`.
- **ios/** – SwiftUI app: plays the workouts your assistant planned as timed intervals with beeps that keep going with the screen locked, shows a Live Activity (lock screen and Dynamic Island), and sends each run and your RPE back.
- **docs/AGENT_BRIEF.md** – architecture and the brief for coding agents working on this repo.

The auth + MCP layer is also available on its own as a clean template: **[MCP OAuth Starter](https://github.com/gadshushan3030/mcp-oauth-starter)**. Single-owner sibling project: [English Coach](https://github.com/gadshushan3030/english-coach-mcp).

## How it works

![Architecture: runners and AI coaches, two doors into one Next.js app over Postgres](docs/architecture.svg)

- **Accounts**: "Continue with Google" (when `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are set) or email + password (Better Auth). With Google on, new accounts come only from Google, whose emails are verified, so nobody can pre-register a password account on someone else's email; password sign-in keeps working for existing accounts. Set `SIGNUP_ENABLED=false` to close registration entirely.
- **Agents**: an assistant registers itself (dynamic client registration), the user signs in and approves it on `/oauth/consent`, and gets an access token bound to `<BETTER_AUTH_URL>/mcp`. `/mcp` also checks on every request that the user's approval still exists, so **Disconnect** on the dashboard cuts access at once (for that user only).
- **Data**: `workouts` (plans), `runs` (what happened: `device` = recorded by the phone, `manual` = entered/reported) and `run_feedback` (RPE and notes – self-reported, kept apart from measurements). Every write carries a `request_id`; replaying it returns the same row and never duplicates.

![Data model: workouts (the plan), runs (what happened), run_feedback (how it felt)](docs/data-model.svg)

### How an assistant connects

![Sequence: discover, register, authorize with PKCE, token, tool calls](docs/oauth-flow.svg)

### MCP tools

| Tool | What it does |
|---|---|
| `get_summary` | Runs and distance for 7/30 days, last run, upcoming workouts |
| `list_workouts` / `get_workout` | Workout plans |
| `create_workout` / `plan_week` | Create one / several scheduled workouts |
| `update_workout` | Change a plan |
| `list_runs` / `get_run` | Runs with planned vs. actual per interval, plus feedback |
| `record_run` | Store a run (`manual` when the runner reports it in chat) |
| `add_run_feedback` | RPE 1–10 and notes for a run |

### The iPhone app's API

The app is one more OAuth client of the same server: it registers itself as a native client (redirect `app.vercel.pacebeep:/oauth/callback`, PKCE, no secret), the user approves it like an assistant, and it calls two routes with the same kind of token:

| Route | What it does |
|---|---|
| `GET /api/workouts` | Workouts scheduled for today or later, then unscheduled ones; `done` once a run was recorded for it |
| `POST /api/runs` | `{ request_id, run, feedback? }`: stores the run as `device`, plus the RPE. Idempotent, so the app's offline outbox resends until it gets a 2xx |

## Run locally (web)

Requires Node 22+ and Docker.

```bash
cd web
npm install
npm run db:up
cp .env.example .env.local   # then fill BETTER_AUTH_SECRET (openssl rand -hex 32)
npm run db:migrate
npm run dev -- -p 3200
```

Open http://localhost:3200 and create an account.

## Run on your iPhone (ios)

Requires Xcode 26 and an Apple ID (a free one works; the app then expires after 7 days).

1. Xcode → Settings → Accounts → add your Apple ID.
2. `cp ios/Local.xcconfig.example ios/Local.xcconfig` and set your team id and a bundle id of your own.
3. Connect the iPhone, turn on Settings → Privacy & Security → Developer Mode, open `ios/PaceBeep.xcodeproj` and Run.
4. First launch: trust the developer in Settings → General → VPN & Device Management.

The app talks to `https://pacebeep.vercel.app` (`SERVER_URL` in `ios/Config.xcconfig`). Sign in once, ask your assistant to plan your week, and the workouts show up under **From your coach**; pull to refresh. Workouts are cached and finished runs wait in an outbox, so a gym without signal is fine.

The whole workout is rendered into one audio track (silence with the beeps at their exact times) and played with the background audio mode, so iOS keeps the app alive with the screen locked and the beeps can't drift. After a run the app shows whether the audio played without gaps and how late the voice cues were.

## Deploy your own (Vercel + Neon)

1. Import the repo in Vercel with **Root Directory = `web`**.
2. **Storage → Create Database → Neon (Free)**, connect it to the project with env prefix `DATABASE` (gives `DATABASE_URL`).
3. Environment variables: `BETTER_AUTH_SECRET` (`openssl rand -hex 32`), `BETTER_AUTH_URL` (your production URL), optionally `SIGNUP_ENABLED`.
4. Optional Google sign-in: in Google Cloud create a project, configure the Google Auth Platform (External), and a **Web application** OAuth client with redirect URI `https://<your-app>/api/auth/callback/google`; set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. While the app is in "Testing", only listed test users can sign in; to publish, fill the Branding page (home page, `/privacy`, `/terms`) and click **Publish app** – with only the basic `openid email profile` scopes and no logo, no Google verification is needed.
5. Deploy. The build (`vercel-build`) applies `web/db/migrations/*.sql` before `next build`.

## Connect ChatGPT

1. ChatGPT → Settings → Security and login → **Developer mode**.
2. [chatgpt.com/plugins](https://chatgpt.com/plugins) → **Add** → Create MCP App → URL `https://<your-app>/mcp`, authentication **OAuth**.
3. Sign in to PaceBeep in the window that opens, check the app name and return address, and **Allow**.
4. In ChatGPT's **Work** tab, type `@` and pick the app.

## Security notes

- No secrets in the repo: `.env*` is ignored; only `.env.example` is committed.
- Assistants never get a key – only a short-lived access token (1 hour) and a refresh token, after the user approves.
- Every query and write is scoped to the signed-in user (or the user behind the token); cross-user access returns "not found".
- Users can delete their account (Account page); all their data and assistant connections are removed with it.
- Public pages: `/privacy` and `/terms` (review them for your own deployment – they name the operator and contact).

**Disconnect** is per user: it deletes that user's consent, refresh tokens and access tokens in one transaction, and never the shared client registration.

![Timelines and tables: what Disconnect deletes and why the next call gets 401](docs/disconnect.svg)

**Retries** are safe: a lost response followed by a retry with the same `request_id` returns the same run.

![Sequence: a lost response, a retry with the same request_id, one row](docs/retries.svg)

## Roadmap

- iOS: GPS distance and pace for outdoor runs; TestFlight (needs the paid Apple Developer Program).
- Password reset for password accounts (needs an email provider, e.g. Resend).

## License

MIT – see [LICENSE](LICENSE).
