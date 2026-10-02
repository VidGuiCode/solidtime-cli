# Roadmap

Done releases live in [CHANGELOG.md](../CHANGELOG.md), the current command surface
in [README.md](../README.md). This file only tracks what's next.

## Shipped

| Version | In one line |
| ------- | ----------- |
| 0.1.0 | Core surface: login / multi-account, org switching, time-entry CRUD + timer (`te active`), project / task / tag / client / member (incl. invitations and project members), AI `discover`, shell completion, self-update |
| 0.1.1 | Agent-reported friction fixes: UTC datetime normalization, help-text improvements, `discover all` |
| 0.1.2 | Parallel agents: `track` timers, `report`, name-or-ID selectors, `--create-missing-tags`, duplicate-entry and corrupt-config fixes, 87 unit tests |

## v0.2.0 — safe to run unattended

One goal: point an agent at the CLI and leave it alone without supervision.

- [x] Smoke suite against a real server — the 0.1.2 bug class (unencoded URLs, retry behaviour, pagination, config handling) is invisible to the mocked unit tests; one end-to-end pass per command family catches it before release. Shipped as an offline end-to-end suite (real binary vs. a mock Solidtime server) plus a real-server smoke suite (`npm run smoke`); the read-only pass ran green against the production server, and it immediately caught real bugs: `report` double-counting multi-tag entries, first-page-only truncation in `client`/`invitation`/`pm`/`discover` listings, and `project show` failing on names
- [x] Release automation — pushing a `v*.*.*` tag publishes the GitHub release with the npm tarball, notes extracted from CHANGELOG.md, and a tag/package.json version guard (no `npm publish` — the npm name is taken)
- [x] Close the open `track` question — verified against the Solidtime source (`TimeEntryController::assertNoOverlap`): overlapping finished entries are accepted unless `prevent_overlapping_time_entries` is enabled, and a finished entry overlapping a *running* timer is accepted either way; README wording settled to match. An executable confirmation (against the live server) ships in the smoke suite's write scenarios, gated behind `SOLIDTIME_SMOKE_ALLOW_WRITE=1`

Ready to cut: rename the CHANGELOG `Unreleased` section to the new version, bump `package.json`, merge to main, push the tag — the release workflow does the rest.

## v0.3.0 — data in, data out

- [ ] `export` — time entries as CSV/JSON for a date range, for invoicing and backups
- [ ] `import` — bulk-create entries from CSV/JSON to bring history over from another tracker
- [ ] Analytics — period-over-period comparison and per-member/per-tag breakdowns on top of `report` / `te aggregate`; use the dashboard/chart endpoints where the API offers them
