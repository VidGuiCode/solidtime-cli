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

```bash
npm install -g https://github.com/VidGuiCode/solidtime-cli/releases/download/v0.1.1/solidtime-cli-0.1.1.tgz
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

#### Time Entry Filters

```bash
solidtime te list --projects <id1> <id2>     # filter by projects
solidtime te list --start 2026-04-01T00:00:00Z --end 2026-04-02T23:59:59Z
solidtime te list --active                    # only running timers
solidtime te list --billable                  # only billable entries
solidtime te list --member <id>               # filter by member
solidtime te list --tags <id1> <id2>          # filter by tags
solidtime te list --limit 100 --offset 50     # pagination
```

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
| `--json` | Machine-readable JSON output |
| `--compact` | Compact JSON without indentation (for AI/agents) |
| `--dry-run` | Validate and preview without sending |
| `--no-interactive` | Fail instead of prompting for input |

## Environment Variables

For CI/automation, you can skip the saved config file entirely:

| Variable | Description |
|----------|-------------|
| `SOLIDTIME_BASE_URL` | Solidtime instance URL |
| `SOLIDTIME_API_TOKEN` | API token (Bearer JWT) |
| `SOLIDTIME_ORGANIZATION` | Active organization ID |
| `SOLIDTIME_MEMBER_ID` | Your membership ID in the org |
| `SOLIDTIME_CONFIG` | Path to custom config file |

When both `SOLIDTIME_BASE_URL` and `SOLIDTIME_API_TOKEN` are set, no saved login config is needed. Environment variables are supplied by your shell, CI system, or container runtime. The CLI reads them but does not create an `.env` file.

## Configuration

Login state is stored at `~/.solidtime-cli/config.json`. This file contains your Solidtime base URL, active context, and API token. Treat it as a secret and do not share or commit it. Multiple accounts are supported - switch between them with `solidtime account use <name>`.

## Non-Interactive Login

```bash
solidtime login --url https://app.solidtime.io --token <jwt>
```

## License

[MIT](LICENSE)
