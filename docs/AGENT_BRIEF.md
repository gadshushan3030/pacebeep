# PaceBeep – architecture and agent brief

PaceBeep is an open-source interval-running app: an iOS client plus a small web backend that AI agents (ChatGPT, Claude) can connect to over MCP, with OAuth and per-user data.

This file is both the architecture reference and the starting prompt for a coding agent. Paste everything under **Agent prompt** into a new session in this repo.

```
iPhone (SwiftUI) ──── OAuth 2.1 + PKCE ───┐
                                          ▼
ChatGPT / agent ── DCR + PKCE ──►  Next.js on Vercel
                                   ├─ /api/auth/*    Better Auth: login, owner lock, OAuth 2.1 server
                                   ├─ /.well-known/* discovery (RFC 8414 / RFC 9728)
                                   ├─ /oauth/consent owner approves each agent
                                   ├─ /api/*         REST for the iOS app (Bearer token)
                                   └─ /mcp           MCP server (token aud = /mcp + live consent check)
                                            │
                                            ▼
                                   Postgres (Neon), every row scoped by user_id
```

## Agent prompt

You are setting up PaceBeep (repo: pacebeep, public, open source): an interval-running app with an iOS client and a small web backend that AI agents (ChatGPT, Claude) can connect to over MCP.

### Decisions (made)
1. Deployment model: **hosted multi-user** – open email + password registration (`SIGNUP_ENABLED=false` closes it). Every row is scoped by `user_id`; disconnecting an assistant removes only that user's consent and tokens, never the shared OAuth client.
2. License: **MIT**.
3. UI language: **English**.

### Status
- **/web is built and deployed**: auth, OAuth for agents, MCP tools below, dashboard, workouts. Verified: full OAuth flow, idempotent replays, cross-user isolation, per-user disconnect.
- **Next**: /ios, then email verification + password reset (email provider), account deletion and a privacy page.

### Architecture
- **/ios**: SwiftUI app (Xcode project "PaceBeep"), iOS 17+.
  - Timer engine on a monotonic clock (not Timer ticks). Beeps and voice cues via AVAudioSession with the background-audio mode so cues play with the screen locked; haptics; Live Activity.
  - Offline-first: SwiftData store; sync queue where every write carries a UUID `request_id`.
  - Signs in with OAuth 2.1 + PKCE via ASWebAuthenticationSession (redirect `pacebeep://oauth/callback`) against the same backend auth server, then calls the backend API with the Bearer token.
  - Signing settings in a gitignored `Local.xcconfig` (team id, bundle id); commit only an example file.
- **/web**: Next.js 16 (App Router, TypeScript) on Vercel + Postgres (Neon via Vercel Storage).
  - Better Auth: email + password with open registration (min 10 characters).
  - OAuth for agents: `@better-auth/mcp` `mcp()` plugin with `jwt()`, `loginPage: "/login"`, `consentPage: "/oauth/consent"`, `resource: <BETTER_AUTH_URL>/mcp`, `allowDynamicClientRegistration` + `allowUnauthenticatedClientRegistration` (ChatGPT registers itself with DCR).
  - Discovery routes: `/.well-known/oauth-authorization-server/api/auth`, `/api/auth/.well-known/openid-configuration`, `/.well-known/oauth-protected-resource[/mcp]`.
  - `/mcp`: `@modelcontextprotocol/server` v2 `createMcpHandler` (do NOT set `legacy: "reject"`; ChatGPT speaks protocol 2025-06-18), wrapped in `requireMcpAuth` (JWT via JWKS, `aud` = `/mcp`). Also require an `oauthConsent` row for (`sub`, `azp`) on every request so "disconnect" takes effect immediately.
  - Disconnect (multi-user) = delete this user's `oauthConsent`, `oauthRefreshToken` and `oauthAccessToken` rows for that client. Never delete the `oauthClient` row: other users may share it. Deleting only the consent would NOT revoke refresh tokens.
  - Next 16 uses `proxy.ts` (not `middleware.ts`); exclude `api/auth`, `mcp` and `.well-known` from it.

### Data model
Every table has `user_id`. All writes are idempotent through `unique (user_id, request_id)`.
- **workouts**: plans (warmup, N × work/rest with target time or pace, cooldown). Created by the owner or by an agent.
- **runs**: what happened – `source` is `device` (measured by the phone) or `manual` (entered or reported in chat); start/end, per-interval planned vs. actual (`intervals` jsonb), distance, optional heart rate later.
- **run_feedback**: self-reported RPE and notes. Never mix self-reports with measured data.
- Writes go through SQL functions that return the row id. A replayed `request_id` returns the same row and changes nothing. Use `clock_timestamp()` for `created_at` where order matters. Read back in a separate statement: a query can't see its own function's UPDATE.

### MCP tools
Writes are idempotent, reads carry `readOnlyHint`, and every write returns an id that a read tool can fetch back:
`get_summary`, `list_workouts`, `get_workout`, `create_workout`, `plan_week`, `update_workout`, `list_runs`, `get_run`, `record_run`, `add_run_feedback`.
The server `instructions` tell the agent to generate a UUID `request_id` per save and reuse it on retry.

### Web UI
Dashboard: workouts, runs (planned vs. actual per interval), connected agents with a disconnect button.

### Ops and security (public repo)
- No secrets in git: `.env*` ignored, commit `.env.example` only. `DATABASE_URL` and `BETTER_AUTH_SECRET` live in Vercel only.
- Vercel env vars are Sensitive (they can't be pulled locally), so run migrations in a `vercel-build` script. Migrations are plain SQL in `db/migrations` (Better Auth tables generated with `npx auth generate`).
- Local dev: `postgres:17` in Docker (`npm run db:up`).
- Never ask the user to paste a connection snippet into a terminal; read it from the clipboard inside the command and clear the clipboard afterwards.
- README: self-host steps (Vercel + Neon), ChatGPT connection steps, MCP tool table.

### Verification before calling anything done
- Web: lint, `tsc`, `build`.
- Full OAuth flow with a scripted client: DCR → authorize with PKCE + `resource` → consent → token → every MCP tool.
- Replayed writes create no duplicates; a second user can't read, change or link to the first user's rows; disconnect returns 401 for that user's still-valid token while other users on the same client keep working.
- iOS: builds in the simulator; cues play in the background; runs sync after going offline and back online.
- Real ChatGPT: the user opens a tunnel themselves (`cloudflared tunnel --url http://localhost:3000`); add `allowedDevOrigins: ["*.trycloudflare.com"]` and set `BETTER_AUTH_URL` to the tunnel URL for that test.

Start with **/web** (auth + MCP + DB), prove the OAuth + MCP flow end to end, then build **/ios**.
