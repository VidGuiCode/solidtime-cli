# Roadmap

Done releases live in [CHANGELOG.md](../CHANGELOG.md), the current command surface
in [README.md](../README.md). This file only tracks what's next.

## Shipped

| Version | In one line |
| ------- | ----------- |
| 0.1.0 | Core surface: login / multi-account, org switching, time-entry CRUD + timer (`te active`), project / task / tag / client / member (incl. invitations and project members), AI `discover`, shell completion, self-update |
| 0.1.1 | Agent-reported friction fixes: UTC datetime normalization, help-text improvements, `discover all` |
| 0.1.2 | Parallel agents: `track` timers, `report`, name-or-ID selectors, `--create-missing-tags`, duplicate-entry and corrupt-config fixes, 87 unit tests |
| 0.2.0 | Safe to run unattended: end-to-end suite (real binary vs mock server), real-server smoke suite (`npm run smoke`), tag-triggered releases, `report` double-count fix, full-page listings, `project show` by name |

## v0.3.0 — data in, data out

- [ ] `export` — time entries as CSV/JSON for a date range, for invoicing and backups
- [ ] `import` — bulk-create entries from CSV/JSON to bring history over from another tracker
- [ ] Analytics — period-over-period comparison and per-member/per-tag breakdowns on top of `report` / `te aggregate`; use the dashboard/chart endpoints where the API offers them
