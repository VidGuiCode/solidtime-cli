# solidtime-cli — Claude Code Instructions

## Quick Orientation

- **What**: Unofficial CLI for Solidtime (open-source time tracking)
- **Stack**: TypeScript, Commander.js, native fetch, Vitest
- **Dev**: `bun src/cli.ts` or `npm run dev`
- **Build**: `npm run build` (tsc to `dist/`)
- **Test**: `npm test`

## Full Agent Briefing

@context/docs/briefs/agent.md

## Project Context

@context/docs/project/project-context.md

## Current State

@context/docs/project/current-state.md

## API Reference

@context/docs/reference/solidtime-api-reference.md

## Rules

- Commands stay thin — logic goes in `src/core/`
- Every command supports `--json` for machine-readable output
- Every mutating command supports `--dry-run`
- Use native `fetch` only — no axios, no node-fetch
- Do not publish to npm registry — distribute via GitHub Releases `.tgz`
- Do not add heavy dependencies — `commander` is the only runtime dep
- Keep the same architecture patterns as [plane-cli](https://github.com/VidGuiCode/plane-cli)
- Run `npm run build` after code changes to verify compilation
- Auth uses `Authorization: Bearer <JWT>` — never `X-API-Key`
- All data endpoints are organization-scoped: `/organizations/{org_id}/...`
- Responses use `{ data: [] }` wrapping with Laravel pagination

## Versioning

- Patch bumps (`0.0.1`): bug fixes, polish, doc cleanup
- Minor bumps (`0.1.0`): new commands or breaking input changes
- Update `CHANGELOG.md` and `package.json` version together
- Tag releases as `v{version}` on GitHub

## Distribution

```bash
npm run build
npm pack
gh release create v{version} solidtime-cli-{version}.tgz
```

Install: `npm install -g https://github.com/VidGuiCode/solidtime-cli/releases/download/v{version}/solidtime-cli-{version}.tgz`
