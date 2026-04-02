# solidtime-cli

Unofficial CLI for [Solidtime](https://www.solidtime.io/) — open-source time tracking.

## Install

```bash
npm install -g solidtime-cli
```

Requires Node.js 20+.

## Quick Start

```bash
solidtime login
solidtime where
solidtime project list
solidtime time-entry list
```

## Commands

| Command | Description |
|---------|-------------|
| `login` | Connect to a Solidtime instance |
| `logout` | Remove saved credentials |
| `where` | Show current context |
| `project list\|create\|update` | Manage projects |
| `time-entry list\|start\|stop\|create\|update\|delete` | Manage time entries |
| `task list\|create\|update\|delete` | Manage tasks |
| `tag list\|create\|update\|delete` | Manage tags |
| `member list` | List organization members |

### Aliases

- `te` → `time-entry`

### Global Flags

| Flag | Description |
|------|-------------|
| `--json` | Output raw JSON |
| `--compact` | Compact JSON (for AI/agents) |
| `--dry-run` | Validate without sending |
| `--no-interactive` | Fail instead of prompting |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SOLIDTIME_BASE_URL` | Override instance URL |
| `SOLIDTIME_API_TOKEN` | Override API token |
| `SOLIDTIME_ORGANIZATION` | Override organization ID |
| `SOLIDTIME_CONFIG` | Custom config file path |

## Configuration

Config is stored at `~/.solidtime-cli/config.json`.

## License

MIT
