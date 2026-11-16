## What

<!-- One or two sentences: what this PR changes. -->

## Why

<!-- Why this helps runners, coaches, or contributors. Link issues with Fixes #N when applicable. -->

## How to test

<!-- Concrete steps a reviewer can follow. -->

## Checklist

- [ ] Docs-only / no behavior change, **or** behavior change is intentional and described above
- [ ] `cd web && npm run lint && npm run build` (if `web/` changed)
- [ ] `cd web && npm test` (if MCP tools, workouts, or auth paths changed)
- [ ] Builds in Xcode without new warnings (if `ios/` changed)
- [ ] README / MCP tool table updated when a tool, route, or setup step changed
- [ ] No secrets or `.env` files included
