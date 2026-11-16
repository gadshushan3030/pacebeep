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

- **Web:** [Run locally (web)](README.md#run-locally-web) — Node 22+, Docker, port 3200.
- **iOS:** [Run on your iPhone](README.md#run-on-your-iphone-ios) — Xcode 26, a free Apple ID is enough.
  1. Copy `ios/Local.xcconfig.example` → `ios/Local.xcconfig` and set your team id and bundle id.
  2. Open `ios/PaceBeep.xcodeproj`, connect a device (Developer Mode on), Run.
  3. Every build, not only the App Store one, talks to `https://pacebeep.vercel.app` by default (`SERVER_URL` in `ios/Config.xcconfig`). To use your local server instead, set `SERVER_URL` in `Local.xcconfig`: `http:/$()/localhost:3200` in the simulator, or your Mac's LAN address on a physical iPhone. That same LAN base URL must be `BETTER_AUTH_URL` in `web/.env.local` (token `resource` / JWT `aud` must match; see README).
- **Architecture:** [docs/AGENT_BRIEF.md](docs/AGENT_BRIEF.md) (humans and coding agents). Tokens: [design/README.md](design/README.md).

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
