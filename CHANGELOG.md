# Changelog

## 0.1.2

Bug fixes and parallel agent tracking.

### Changed

- **Node.js 20.10 or newer is required** — the CLI now uses JSON import attributes (`with { type: "json" }`), which Node 20.10 was the first to support

## 0.1.1

Patch release: agent-reported friction fixes.

### Fixed

- **UTC datetime normalization** — `--start` and `--end` options now accept any ISO 8601 datetime (with timezone offsets like `+02:00`) and automatically convert to UTC before sending to the API
- **Timer timestamps** — Milliseconds stripped from auto-generated timestamps to match API format

### Improved

- **Help text for array flags** — `--tags`, `--projects`, `--clients`, `--tasks`, `--ids` now show `(space-separated)` in descriptions
- **Help text for datetime flags** — All `--start` and `--end` options now show example formats

### Added

- **`discover all`** — Single command returning full context (account, org, user) plus all resource lists (projects, tasks, tags, members, clients) in one JSON response

## 0.1.0

Initial release.

### Auth & Context

- `login` / `logout` — connect to a Solidtime instance
- `where` — show current context
- `account list/use/show/remove` — multi-account management
- `organization list/use/show/update` — switch organizations, view/update org settings

### Time Entries

- `time-entry list` — list with full filter support (member, projects, clients, tasks, tags, start/end, active, billable, limit/offset)
- `time-entry start/stop` — timer workflow
- `time-entry create/update/delete` — full CRUD
- `time-entry active` — show the currently running timer
- `time-entry bulk-update/bulk-delete` — batch operations

### Resources

- `project list/show/create/update/delete` — manage projects
- `task list/create/update/delete` — manage tasks (server-side done filter)
- `tag list/create/update/delete` — manage tags
- `client list/create/update/delete` — manage clients
- `member list/update` — list and update members

### AI & Automation

- `discover context/projects/tasks/tags/members/clients` — AI-first discovery
- `profile` — show current user
- `upgrade` — self-update from GitHub releases
- `completion bash/zsh/fish` — shell autocompletion
- Global flags: `--json`, `--compact`, `--dry-run`, `--no-interactive`

### API Correctness

- All time entry mutations send `member_id` (org membership ID) as required by the API
- Time entry list uses offset/limit pagination matching the real API
- Task and project list use server-side filtering instead of client-side
- API client supports PATCH and DELETE-with-body for bulk operations
