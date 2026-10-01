# Roadmap

## v0.1.0 (current)

- [x] Core commands: login, logout, where, project, time-entry, task, tag, member
- [x] Multi-account support
- [x] Organization switching
- [x] AI discovery commands
- [x] Shell completion
- [x] Self-update

## v0.1.2 (bug fixes + parallel agent tracking)

- [ ] Fix unencoded URL query parameters (Critical bug)
- [ ] Add pagination support for `list` commands
- [ ] Fix ineffective jitter in retry logic
- [ ] Make network error detection more robust
- [ ] Handle un-silenced file permission errors safely
- [ ] Update outdated module imports (`package.json`)
- [ ] Add validation on empty updates
- [ ] Don't blindly retry non-idempotent requests (`POST`/`PATCH`/`DELETE`): a lost response on `te create` currently creates a duplicate entry
- [ ] Fail with a clear error on a corrupt `config.json` instead of returning an empty config that the next `saveConfig()` writes over, wiping every saved account
- [ ] README: install link points to an old release; use a "latest release" link
- [ ] `track` command: local parallel timers so several agents and the owner can log time at once on one account. Running timers live in `~/.solidtime-cli/tracks/<id>.json` (one file each, atomic writes); `stop` posts a finished entry. Subcommands `start`/`stop`/`stop --all [--label]`/`list`/`cancel`/`show`.
  - [ ] Check first on a real server: overlapping finished entries are accepted, including while a `te start` timer is running; document the result in the README
- [ ] `report` command (time reports with date ranges), grouped by project then by `human`/`agent` tag
- [ ] Document the `human`/`agent` tagging convention in the README
- [ ] Name-or-ID resolution for `--project`, `--task`, `--tags` (case-insensitive; ambiguous match is a validation error listing the candidates)
- [ ] `--create-missing-tags` to create unknown tags on first use
- [ ] `te update --no-project` / `--no-task` to clear a project or task
- [ ] `te list --mine` shortcut (fills in the active member ID)
- [ ] `task create --estimate`; `task update --project`
- [ ] Docs: `--json` is per command, not global; `te aggregate` ignores `--json`

## v0.2.0 (planned)

- [ ] `client` command (list/create/update/delete)
- [ ] `time-entry active` — show currently running timer
- [ ] Tests (unit + smoke)

## v0.3.0 (future)

- [ ] `import` / `export` commands
- [ ] Chart/analytics data access
- [ ] CI workflow for automated releases
