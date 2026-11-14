# Contributing to PaceBeep

Thanks for helping. PaceBeep is a free, ad-free, open-source iOS workout app plus a Next.js MCP backend. Help of every size counts: a typo, a bug report, a first PR, or a new MCP tool.

## Ways to help

- **Use it and report.** Open an [issue](https://github.com/gadshushan3030/pacebeep/issues) when something feels wrong: a late beep, a stuck Live Activity, a confusing screen. Say which iPhone and iOS (or browser) you used.
- **Ask for a feature.** Use the feature template; one idea per issue.
- **Pick a good first issue.** See [docs/good-first-issues.md](docs/good-first-issues.md) for small, scoped tasks ready to open as GitHub issues with the `good first issue` label.
- **Fix or build something.** Fork, branch, open a pull request. Small PRs merge fastest.
- **Star the repo.** It helps other runners and MCP builders find it.

## Code of conduct

Everyone is expected to follow the [Contributor Covenant](CODE_OF_CONDUCT.md). Be kind; we are all here to run better.

## Setting up

### Web (Next.js + Postgres)

Requires Node 22+ and Docker. Details in the README: [Run locally (web)](README.md#run-locally-web).

```bash
cd web
npm install
npm run db:up
cp .env.example .env.local   # fill BETTER_AUTH_SECRET (openssl rand -hex 32)
npm run db:migrate
npm run dev -- -p 3200
```

Open http://localhost:3200 and create an account.

### iOS (SwiftUI)

Requires Xcode 26 and an Apple ID (a free one works; the build expires after 7 days). Details: [Run on your iPhone](README.md#run-on-your-iphone-ios).

1. Copy `ios/Local.xcconfig.example` → `ios/Local.xcconfig` and set your team id and bundle id.
2. Open `ios/PaceBeep.xcodeproj`, connect a device (Developer Mode on), Run.
3. The App Store build talks to `https://pacebeep.vercel.app`. To hit a local server, set `SERVER_URL` in `Local.xcconfig` (see comments in `ios/Config.xcconfig`).

### Architecture

- [docs/AGENT_BRIEF.md](docs/AGENT_BRIEF.md) — architecture and conventions (written for humans and coding agents).
- [design/README.md](design/README.md) — color and type tokens.

## Pull requests

- One change per PR, with a short description of **what** and **why**.
- Use the PR template. Link related issues when there are any.
- Web changes: `cd web && npm run lint && npm run build` must pass. Prefer `npm test` too when you touch MCP or workouts.
- iOS changes: the project must build in Xcode without new warnings.
- New MCP tools: add a row to the tools table in the README and cover them in `web/test/` when practical.
- No secrets. `.env*` is gitignored; only `.env.example` is committed.
- Do not change app behavior in docs-only PRs; keep docs PRs docs-only.

## Labels that help newcomers

When opening issues from [docs/good-first-issues.md](docs/good-first-issues.md), please add:

- `good first issue`
- `help wanted` (optional)
- `bug` or `enhancement` as appropriate

## Questions

Open an issue, or reach the author at [@ShushanGad on X](https://x.com/ShushanGad).
