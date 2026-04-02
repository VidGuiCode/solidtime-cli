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
| `npm run lint` | Lint source files |
| `npm run format` | Format source files |
| `npm run verify-pack` | Pack and smoke test |

## Architecture

- Commands go in `src/commands/` — keep them thin
- Core logic goes in `src/core/`
- All commands follow the same pattern: load config, create client, call API, print output
- Every command supports `--json` for machine-readable output

## Release

1. Update `CHANGELOG.md`
2. Bump version in `package.json`
3. `npm run build && npm test`
4. `npm pack`
5. `gh release create v{version} solidtime-cli-{version}.tgz`
