# PaceBeep

Interval running with an AI coach. Plan interval workouts, record runs, and let your assistant (ChatGPT, Claude or any MCP client) read your training and write plans, over OAuth.

- **web/** – Next.js 16 backend and dashboard: accounts, workouts, runs, and an MCP server at `/mcp`.
- **ios/** – SwiftUI app (planned): the interval timer with audio cues, offline-first, syncing to the backend.
- **docs/AGENT_BRIEF.md** – architecture and the brief for coding agents working on this repo.

## How it works

```
iPhone (planned) ── OAuth 2.1 + PKCE ──┐
                                       ▼
ChatGPT / agent ── DCR + PKCE ──► Next.js on Vercel
                                  ├─ /api/auth/*     Better Auth: accounts, OAuth 2.1 authorization server
                                  ├─ /.well-known/*  discovery (RFC 8414 / RFC 9728)
                                  ├─ /oauth/consent  each user approves each assistant
                                  └─ /mcp            MCP server: token audience = /mcp, live consent check
                                           │
                                           ▼
                                  Postgres (Neon); every row belongs to one user
```

- **Accounts**: "Continue with Google" (when `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are set) or email + password (Better Auth). With Google on, new accounts come only from Google, whose emails are verified, so nobody can pre-register a password account on someone else's email; password sign-in keeps working for existing accounts. Set `SIGNUP_ENABLED=false` to close registration entirely.
- **Agents**: an assistant registers itself (dynamic client registration), the user signs in and approves it on `/oauth/consent`, and gets an access token bound to `<BETTER_AUTH_URL>/mcp`. `/mcp` also checks on every request that the user's approval still exists, so **Disconnect** on the dashboard cuts access at once (for that user only).
- **Data**: `workouts` (plans), `runs` (what happened: `device` = recorded by the phone, `manual` = entered/reported) and `run_feedback` (RPE and notes – self-reported, kept apart from measurements). Every write carries a `request_id`; replaying it returns the same row and never duplicates.

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

## Deploy your own (Vercel + Neon)

1. Import the repo in Vercel with **Root Directory = `web`**.
2. **Storage → Create Database → Neon (Free)**, connect it to the project with env prefix `DATABASE` (gives `DATABASE_URL`).
3. Environment variables: `BETTER_AUTH_SECRET` (`openssl rand -hex 32`), `BETTER_AUTH_URL` (your production URL), optionally `SIGNUP_ENABLED`.
4. Optional Google sign-in: in Google Cloud create a project, configure the Google Auth Platform (External), and a **Web application** OAuth client with redirect URI `https://<your-app>/api/auth/callback/google`; set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. While the app is in "Testing", only listed test users can sign in; publishing requires a privacy policy and terms URL on the Branding page.
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

## Roadmap

- iOS app (see `docs/AGENT_BRIEF.md`).
- Publish the Google OAuth app (currently "Testing"): fill the Branding page with the home, privacy and terms URLs.
- Password reset for password accounts (needs an email provider, e.g. Resend).

## License

MIT – see [LICENSE](LICENSE).
