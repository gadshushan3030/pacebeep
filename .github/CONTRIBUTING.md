# Contributing to PaceBeep

Thanks for stopping by. PaceBeep is a free, open-source interval-running app (iOS + a small Next.js backend with an MCP server), and every kind of help counts.

## Ways to help

- **Run it and report.** Open an [issue](https://github.com/gadshushan3030/pacebeep/issues) for anything that felt wrong: a beep that drifted, a Live Activity that stuck, a confusing screen. Say which iPhone and iOS version.
- **Ask for a feature.** Use the feature template; one feature per issue.
- **Fix or build something.** Fork, branch, open a pull request. Small PRs merge fast.
- **Star the repo.** It helps other runners find it.

## Setting up

- Web: see [Run locally (web)](../README.md#run-locally-web). Node 22+, Docker.
- iOS: see [Run on your iPhone (ios)](../README.md#run-on-your-iphone-ios). Xcode 26, a free Apple ID is enough.
- Architecture and conventions: [docs/AGENT_BRIEF.md](../docs/AGENT_BRIEF.md). Coding agents (Claude Code, Codex, Cursor) are welcome; the brief is written for them too.

## Pull requests

- One change per PR, with a short description of what and why.
- Web: `cd web && npm run lint && npm run build` must pass.
- iOS: the project must build in Xcode without new warnings.
- New MCP tools: add a row to the tools table in the README.
- No secrets, ever. `.env*` is git-ignored; only `.env.example` is committed.

## Code of conduct

Be kind. We are all here to run better.
