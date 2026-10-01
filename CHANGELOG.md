# Changelog

## 0.1.2

Bug fixes and parallel agent tracking.

### Added

- **`track` command** — run several local timers in parallel on one account. Running timers live in `~/.solidtime-cli/tracks/<id>.json` (one file per timer, atomic writes); `track stop` sends the finished entry to Solidtime and keeps the file if the send fails, so nothing is lost. Subcommands: `start`, `stop <id>`, `stop --all [--label]`, `list`, `cancel`, `show`. Stale timers (12 h by default, `SOLIDTIME_TRACK_STALE_HOURS`) are flagged and guarded; `--label` groups timers per agent session.
- **`report` command** — totals for a period grouped by project and split by the documented `human`/`agent` tag convention, with readable tables (`--json` for agents).
- **Name-or-ID selectors** — `--project`, `--task` and `--tags` accept names as well as UUIDs (case-insensitive; ambiguous names are a validation error listing the candidates).
- **`--create-missing-tags`** on `te start`, `te create`, `te update` and `track start` — unknown tags are created on first use (reported but not created under `--dry-run`).
- **`te update --no-project` / `--no-task`** — clear an entry's project or task.
- **`te list --mine`** — shortcut filtering by the active member.
- **`task create --estimate`** (`90m`, `1h30m`, or plain seconds) and **`task update --project <id|name>`** (also `task update --estimate`).
- **`te aggregate` without `--json`** now prints a readable table instead of ignoring the flag.

### Fixed

- **No more duplicate entries from retries** — non-idempotent requests (`POST`/`PATCH`, `DELETE` with a body) are no longer blindly retried on 5xx or connection drops. When a `te create`/`track stop` POST fails in a way that may have reached the server, the CLI looks for an existing entry with the same member, start and description and treats it as success instead of creating a duplicate.
- **A corrupt `config.json` no longer gets silently wiped** — the CLI now fails with a clear error (including the file path) instead of loading an empty config that the next save would overwrite, losing every saved account.
- **Unencoded URL query parameters** — query strings are built with `URLSearchParams`.
- **Missing pagination** — `member`, `project`, `tag` and `task` list commands fetch all pages.
- **Ineffective retry jitter** — the jitter is now proportional to the exponential backoff.
- **Network error detection** — no longer relies on error message sniffing.
- **Config file permission errors** — read/write failures raise a clear error naming the config path.
- **`project update` no longer silently detaches the client** — an empty `client_id` was sent on every update.
- **Empty updates rejected locally** — `te/project/task/member/organization update` with no fields fail with a validation error instead of sending an empty body.

### Changed

- **Node.js 20.10 or newer is required** — the CLI now uses JSON import attributes (`with { type: "json" }`), which Node 20.10 was the first to support.
- The active profile, organization and member are captured when `track start` runs, so `track stop` posts to the same account even after `account use`.

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
