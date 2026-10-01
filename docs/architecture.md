# Architecture

## Overview

solidtime-cli is a thin CLI wrapper around the Solidtime REST API. It mirrors the architecture of [plane-cli](https://github.com/VidGuiCode/plane-cli).

## Layers

```
CLI entry (src/cli.ts)
  -> Commands (src/commands/*.ts)    Thin handlers: parse args, call core, print output
    -> Core (src/core/*.ts)          All logic: HTTP, config, errors, output
      -> Solidtime API               REST API over HTTPS
```

## Core Modules

| Module | Responsibility |
|--------|---------------|
| `api-client.ts` | HTTP client with Bearer auth, retry, rate-limit handling |
| `config-store.ts` | Read/write `~/.solidtime-cli/config.json`, env var overrides |
| `datetime.ts` | UTC normalization of `--start`/`--end` inputs |
| `types.ts` | All Solidtime API response types |
| `output.ts` | JSON, table, and error output formatting |
| `errors.ts` | Structured error handling with exit codes |
| `runtime.ts` | Global flags: `--dry-run`, `--compact`, `--no-interactive` |
| `prompt.ts` | Interactive input (respects `--no-interactive`) |
| `help.ts` | Custom Commander.js help formatter |

## Key Differences from plane-cli

| Concern | plane-cli | solidtime-cli |
|---------|-----------|---------------|
| Auth | `X-API-Key` header | `Authorization: Bearer` header |
| Scoping | Workspace-scoped | Organization-scoped |
| Pagination | Cursor-based (`next_cursor`) | Laravel page-based (`?page=N`) |
| Response shape | `{ results: [] }` | `{ data: [] }` |
| HTTP methods | GET/POST/PATCH/DELETE | GET/POST/PUT/DELETE |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Auth error (401/403) |
| 3 | Validation / non-interactive error |
| 4 | Rate limited (429) |
