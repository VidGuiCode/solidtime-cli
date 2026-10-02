# solidtime-cli

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue.svg)](https://www.typescriptlang.org/)
[![GitHub release](https://img.shields.io/github/v/release/VidGuiCode/solidtime-cli)](https://github.com/VidGuiCode/solidtime-cli/releases)
[![Unofficial](https://img.shields.io/badge/Solidtime-Unofficial%20CLI-orange.svg)](https://www.solidtime.io/)

Unofficial command-line client for [Solidtime](https://www.solidtime.io/) — open-source time tracking.

Works with both self-hosted Solidtime instances and [Solidtime Cloud](https://app.solidtime.io). Designed for humans in a terminal and AI agents that can run shell commands.

## Install

Requires Node.js 20.10+ and npm (the CLI uses JSON import attributes, which Node 20.10 was the first to support).

Grab the current install command from the [latest release page](https://github.com/VidGuiCode/solidtime-cli/releases/latest), or use this one for v0.1.2:

```bash
npm install -g https://github.com/VidGuiCode/solidtime-cli/releases/download/v0.1.2/solidtime-cli-0.1.2.tgz
solidtime --version
solidtime login
```

This installs the `solidtime` command as a normal npm global CLI. It does not require `sudo`, does not install a system service, and does not modify system configuration.

On Linux and macOS, avoid `sudo npm install -g` for this CLI. If npm global installs fail with permission errors, use a user-level Node.js setup such as [`nvm`](https://github.com/nvm-sh/nvm) or [`fnm`](https://github.com/Schniz/fnm), or configure npm's global prefix to a user-owned directory.

Works on Windows, macOS, and Linux.

## Quick Start

```bash
# Connect to your Solidtime instance
solidtime login

# Check your context
solidtime where

# Start a timer
solidtime te start --description "Working on feature X"

# Check the running timer
solidtime te active

# Stop it
solidtime te stop <id>

# List your time entries
solidtime te list --start 2026-04-01T00:00:00Z --limit 10
```

## Commands

### Auth & Context

| Command | Description |
|---------|-------------|
| `login` | Connect to a Solidtime instance |
| `logout` | Remove saved credentials |
| `where` | Show current account, organization, and user |
| `account list\|use\|show\|remove` | Manage saved accounts |
| `organization list\|use\|show\|update` | Switch and manage organizations |

### Time Entries

| Command | Description |
|---------|-------------|
| `time-entry list` | List time entries with filters |
| `time-entry start` | Start a timer |
| `time-entry stop <id>` | Stop a running timer |
| `time-entry active` | Show the currently running timer |
| `time-entry create` | Create a completed time entry |
| `time-entry update <id>` | Update a time entry |
| `time-entry delete <id>` | Delete a time entry |
| `time-entry bulk-update` | Update multiple entries at once |
| `time-entry bulk-delete` | Delete multiple entries at once |
| `time-entry aggregate` | Aggregate entries with grouping |
| `track` | Run several local timers in parallel (see below) |
| `report` | Time report by project and human/agent tags (see below) |

#### Time Entry Filters

```bash
solidtime te list --projects <id1> <id2>     # filter by projects
solidtime te list --start 2026-04-01T00:00:00Z --end 2026-04-02T23:59:59Z
solidtime te list --active                    # only running timers
solidtime te list --billable                  # only billable entries
solidtime te list --member <id>               # filter by member
solidtime te list --mine                      # filter by the active member
solidtime te list --tags <id1> <id2>          # filter by tags (names work too)
solidtime te list --limit 100 --offset 50     # pagination
```

`te update <id> --no-project` / `--no-task` clear the project or task of an entry. `task create --estimate 90m` sets the estimated time (`1h30m` or plain seconds are also accepted), and `task update <id> --project <id|name>` moves a task to another project.

### Resources

| Command | Description |
|---------|-------------|
| `project list\|show\|create\|update\|delete` | Manage projects |
| `task list\|create\|update\|delete` | Manage tasks |
| `tag list\|create\|update\|delete` | Manage tags |
| `client list\|create\|update\|delete` | Manage clients |
| `member list\|update` | List and update members |
| `project-member list\|add\|update\|remove` | Manage project member assignments |
| `invitation list\|create\|resend\|delete` | Manage organization invitations |

### AI & Automation

| Command | Description |
|---------|-------------|
| `discover all` | Full context dump with all resources (one call) |
| `discover context` | Account, org, user context |
| `discover projects\|tasks\|tags\|members\|clients` | List resources as ID selectors |
| `profile` | Show current user |

### Utility

| Command | Description |
|---------|-------------|
| `upgrade` | Check for updates and self-upgrade |
| `completion bash\|zsh\|fish` | Generate shell completions |

### Aliases

| Alias | Command |
|-------|---------|
| `te` | `time-entry` |
| `org` | `organization` |
| `pm` | `project-member` |
| `invite` | `invitation` |

## Global Flags

| Flag | Description |
|------|-------------|
| `--json` | Machine-readable JSON output. Defined per command (most commands support it); the root `--help` does not list it |
| `--compact` | Compact JSON without indentation (for AI/agents). Implies `--json` on commands that support it |
| `--dry-run` | Validate and preview a mutating command without sending anything |
| `--no-interactive` | Fail instead of prompting for input |

## Name or ID Selectors

`--project`, `--task` and `--tags` accept either a UUID or a name on most commands (`te start`, `te create`, `te update`, `te list` filters, `task create`, `task list --project`, `track start`), and `project show <name>` resolves names too:

```bash
solidtime te create --description "Work" --start 2026-10-01T09:00:00Z --end 2026-10-01T10:00:00Z --project "Client Work" --tags agent
```

- Names are matched case-insensitively.
- An ambiguous name is a validation error listing the matching IDs and names.
- Unknown tags fail with a validation error unless you pass `--create-missing-tags`, which creates them on first use (reported but not created under `--dry-run`).

## Parallel Timers (track)

Solidtime allows one running timer per user, so `te start` cannot run two timers at once. The `track` command keeps running timers **locally** (one file per timer in `~/.solidtime-cli/tracks/`) and only sends **finished entries** to Solidtime on `track stop`. Several agents and the owner can track time at the same time on one account.

```bash
# Agent session 1
solidtime track start --description "Implement feature" --project "Client Work" --tags agent claude --label session-1 --json
# → {"id":"ab234567","start":"2026-10-01T09:00:00Z"}

# Agent session 2, in parallel
solidtime track start --description "Review PR" --tags agent claude --label session-2 --json

# See what is running (stale timers are flagged)
solidtime track list

# Send one timer to Solidtime as a finished entry
solidtime track stop ab234567

# Or stop a whole agent session at once
solidtime track stop --all --label session-2

# Give up on a timer without sending anything
solidtime track cancel qw234567
```

Behaviour:

- `track start` resolves project/task/tag names **immediately**, so a typo fails now, not hours later. It also stores the active account, organization and member ID, so `stop` posts to the same account even if you switched accounts in between.
- `track stop` must not lose time: if the POST fails, the local file is kept and the command exits non-zero — just re-run `track stop <id>`. The file is deleted only after the server accepted the entry.
- `track stop` must not create duplicates: if a POST fails in a way that may have reached the server, the CLI looks for an existing entry with the same start and description before retrying.
- Timers older than 12 hours (configurable with `SOLIDTIME_TRACK_STALE_HOURS`) are flagged as stale by `track list`. Stopping a stale timer asks for confirmation when interactive, and needs `--end <iso>` or `--force` when non-interactive.
- `--label` groups timers per agent session for `stop --all --label <x>`.
- `track stop --dry-run` prints the body it would POST and keeps the local file.
- The track directory can be moved with `SOLIDTIME_TRACK_DIR`.

## Separating Human and Agent Time

Agent wall-clock time is not your working time. To keep reports honest, tag your entries:

- `human` — time you worked yourself
- `agent` — time an AI agent worked, plus an optional second tag naming the agent or model (e.g. `claude`)

```bash
solidtime te create --description "Refactor" --start 2026-10-01T09:00:00Z --end 2026-10-01T10:00:00Z --tags agent claude
```

Then use `report` to see the split:

```bash
solidtime report --start 2026-10-01T00:00:00Z --end 2026-10-01T23:59:59Z
```

```
Project      human   agent   other   total
──────────   ─────   ─────   ─────   ─────
Client Work    2:00    3:30    0:45    6:15
```

Tags other than `human`/`agent` land in the `other` column.

## Overlapping Entries

Solidtime accepts overlapping **finished** entries (two entries whose times overlap, or a finished entry created while a `te start` timer is running) — which is what makes `track` possible. Overlap is only rejected when the organization has `prevent_overlapping_time_entries` enabled (see `organization update`): the server then refuses a second overlapping finished entry of the same member with an `overlapping_time_entry` error. A finished entry that overlaps a still-running timer is accepted either way. When the rejection happens, `track stop` surfaces the error and keeps the local file, so nothing is lost.

## Environment Variables

For CI/automation, you can skip the saved config file entirely:

| Variable | Description |
|----------|-------------|
| `SOLIDTIME_BASE_URL` | Solidtime instance URL |
| `SOLIDTIME_API_TOKEN` | API token (Bearer JWT) |
| `SOLIDTIME_ORGANIZATION` | Active organization ID |
| `SOLIDTIME_MEMBER_ID` | Your membership ID in the org |
| `SOLIDTIME_CONFIG` | Path to custom config file |
| `SOLIDTIME_TRACK_DIR` | Directory for running `track` timers (default `~/.solidtime-cli/tracks`) |
| `SOLIDTIME_TRACK_STALE_HOURS` | Hours after which a running `track` timer counts as stale (default 12) |

When both `SOLIDTIME_BASE_URL` and `SOLIDTIME_API_TOKEN` are set, no saved login config is needed. Environment variables are supplied by your shell, CI system, or container runtime. The CLI reads them but does not create an `.env` file.

## Configuration

Login state is stored at `~/.solidtime-cli/config.json`. This file contains your Solidtime base URL, active context, and API token. Treat it as a secret and do not share or commit it. Multiple accounts are supported - switch between them with `solidtime account use <name>`.

## Non-Interactive Login

```bash
solidtime login --url https://app.solidtime.io --token <jwt>
```

## License

[MIT](LICENSE)
