# Contributing

## Setup

```bash
git clone https://github.com/VidGuiCode/solidtime-cli.git
cd solidtime-cli
npm install
npm run build
```

For development with Bun: `bun src/cli.ts`

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run dev` | Run from source with Bun |
| `npm test` | Run tests |
| `npm run typecheck` | Type-check without emitting |
| `npm run lint` | Lint `src/` and `tests/` |
| `npm run format` | Format `src/` and `tests/` with Prettier |
| `npm run format:check` | Check Prettier formatting |
| `npm run verify-pack` | Pack and smoke test |

## Architecture

- Commands go in `src/commands/` — keep them thin
- Core logic goes in `src/core/`
- All commands follow the same pattern: load config, create client, call API, print output
- Every command supports `--json` for machine-readable output

## Testing

Three layers, in increasing fidelity:

| Layer | Command | What it covers |
|-------|---------|----------------|
| Unit | `npx vitest run tests/core tests/commands` | Core modules against stubbed `fetch` |
| End-to-end | `npx vitest run tests/integration` | The real `dist/cli.js` binary, spawned per scenario, against `tests/integration/mock-server.ts` — a minimal fake Solidtime server (pagination, overlap policy, fault injection). Runs as part of `npm test` and needs `npm run build` first |
| Real-server smoke | `npm run smoke` | The same command families against a live Solidtime instance |

The smoke suite is skipped unless `SOLIDTIME_SMOKE_BASE_URL` and `SOLIDTIME_SMOKE_TOKEN` are set, so `npm test` stays offline. It is read-only by default; set `SOLIDTIME_SMOKE_ALLOW_WRITE=1` to include the write round-trips and the `track` overlap verdict. Those scenarios create entries/tags with a `smoke-` prefix and delete them again — only enable writes against a test account.

## Line endings

The repo enforces LF line endings via `.gitattributes`. Git converts on checkout/commit as needed; no editor configuration is required.

## Release

Releases are automated. Pushing a tag `v*.*.*` triggers `.github/workflows/release.yml`, which verifies the tag matches `package.json`, runs the full check suite, packs the tarball and creates the GitHub release with notes taken from the matching `## <version>` CHANGELOG section.

1. Update `CHANGELOG.md` — the section must be named exactly `## <version>`
2. Bump `version` in `package.json` and rebuild (`npm run build`); `dist/` is committed
3. Push to `main`, then tag: `git tag vX.Y.Z && git push origin vX.Y.Z`

`solidtime upgrade` reads `version` from `main`'s `package.json` and downloads `releases/download/v<version>/solidtime-cli-<version>.tgz`, so merge to `main` and push the tag in the same sitting. There is no `npm publish` step: the `solidtime-cli` name on the npm registry belongs to an unrelated project — releases are GitHub tarballs only.
