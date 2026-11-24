# Roadmap

Finished work is in [CHANGELOG.md](../CHANGELOG.md), the current command surface
in [README.md](../README.md). This file tracks what comes next: the direction,
the milestones, and the tasks that make each one up.

- [Direction](#direction)
- [How to work a task](#how-to-work-a-task)
- [Milestones](#milestones): [0.2.1](#v021--keep-up-with-solidtime-022) ·
  [0.3.0](#v030--everyday-ergonomics) · [0.4.0](#v040--data-in-data-out) ·
  [0.5.0](#v050--agent-kit) · [0.6.0](#v060--insights) · [0.7.0](#v070--admin-parity) ·
  [1.0](#road-to-10)
- [API coverage](#api-coverage)
- [Backlog](#backlog-unscheduled) · [Open decisions](#open-decisions) · [Non-goals](#non-goals)

## Direction

solidtime-cli is a thin, dependable client for the Solidtime API, built for two
users: a person at a terminal and an AI agent running shell commands. The 0.1.x
and 0.2.0 releases made it safe for agents (stable `--json`, `--dry-run`, exit
codes, parallel `track` timers, duplicate protection, end-to-end and smoke
tests). What's next, in order:

1. **Keep up with the server.** Solidtime ships an API change every few weeks
   (0.22.0, October 2026, made time-entry validation stricter and added goals).
   The CLI needs a cheap way to notice upstream changes before users do.
2. **Make it pleasant for people.** Today every period needs a full ISO
   timestamp, `te stop` needs an ID you have to look up, and tables show IDs
   instead of names. Those are the first things a person notices.
3. **Use the server's features instead of rebuilding them.** Solidtime already
   exports (CSV, XLSX, ODS, PDF) and imports (Toggl, Clockify, Harvest, generic
   CSV, Solidtime). The CLI should wrap those endpoints, not reimplement them.
4. **Make agent setup a copy-paste job.** The CLI is agent-ready, but each agent
   setup is still hand-made. Ship the guide, hook recipes and status line.
5. **Cover the rest of the API**, then freeze the output contract for 1.0.

Shipped so far:

| Version | In one line |
| ------- | ----------- |
| 0.1.0 | Core surface: login / multi-account, org switching, time-entry CRUD + timer, project / task / tag / client / member / invitation / project-member, `discover`, shell completion, self-update |
| 0.1.1 | Agent-reported friction fixes: UTC datetime normalization, help text, `discover all` |
| 0.1.2 | Parallel agents: `track` timers, `report`, name-or-ID selectors, `--create-missing-tags`, duplicate-entry and corrupt-config fixes |
| 0.2.0 | Safe to run unattended: end-to-end suite (real binary vs mock server), real-server smoke suite, tag-triggered releases, `report` double-count fix, full-page listings |

## How to work a task

Every task below inherits these rules, so the task cards only list what's
specific to them.

**Pick a task.** Take the lowest-numbered open task in the current milestone
whose `Needs` are done. Tasks without `Needs` in the same milestone can be done
in parallel (they touch different files unless the card says otherwise).

**Card format.**

```
- [ ] **T-000 · Title** · size · area
  - Why: the problem, in one line.
  - API: endpoints involved (paths are under /api/v1; org-scoped ones omit
    the `organizations/{org}/` prefix).
  - Change: files to touch and what changes.
  - Done when: observable checks, each one testable.
  - Needs: other task IDs (optional).
```

- **IDs are stable.** A task keeps its ID if it moves to another milestone.
  New tasks take the next free number in their milestone's hundred.
- **Size:** `S` = one file, under an hour. `M` = a few files or a new core
  helper. `L` = a new command family; split it if it grows past a day.

**Definition of done** (applies to every task):

1. Logic lives in `src/core/`; the command file only parses options, calls
   core, prints.
2. Every new command has `--json`; every new mutating command honours
   `--dry-run` (prints the request it would send, sends nothing).
3. Name-or-ID selectors (`resolve.ts`) wherever a project, task, tag, client or
   member is taken as input.
4. Tests: unit tests for new core logic in `tests/core/`; at least one
   end-to-end case per new command or flag in `tests/integration/cli.e2e.test.ts`
   (extend `mock-server.ts` for new endpoints); a read-only smoke case in
   `tests/smoke/` when the endpoint is new to the CLI.
5. README command table and examples updated; CHANGELOG entry under the next
   version's heading.
6. `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` pass;
   `dist/` is rebuilt and committed with the change.
7. Patch versions only take fixes; new commands or flags go in a minor version.

## Milestones

### v0.2.1 — Keep up with Solidtime 0.22

Patch release. Solidtime 0.22.0 (2026-10-19) changed time-entry rules the CLI
relies on. Re-check them, turn the new server errors into clear CLI errors, and
add a way to spot the next upstream change early.

- [ ] **T-201 · Run the smoke suite against Solidtime 0.22** · S · verify
  - Why: 0.22 now rejects a second running timer per user, rejects end before
    start, and changed how a project-only update treats the task. The README's
    "Overlapping Entries" section was verified on an older server.
  - Change: run `SOLIDTIME_SMOKE_ALLOW_WRITE=1 npm run smoke` against a
    ≥ 0.22 server; add smoke cases for "second `te start` while one runs" and
    "`te update --project` on an entry with a task".
  - Done when: the results are written down (commit message or CHANGELOG); the
    README overlap section is confirmed or corrected; `track` still posts
    overlapping finished entries.
  - Status (2026-11-24): read-only smoke suite passed against `cylro`
    (`10 passed`, `5 write scenarios skipped`); write checks pending a
    dedicated test account.

- [x] **T-202 · Clear errors for the new server rejections** · S · errors
  - Why: a raw `API error 4xx` is unhelpful when the cause is known.
  - API: error `key` values `time_entry_still_running`,
    `time_entry_can_not_be_restarted`,
    `time_entry_member_can_not_be_changed_while_running`,
    `overlapping_time_entry`, `feature_is_not_available_in_free_plan`.
  - Change: `src/core/api-client.ts` (keep the response's `key` on
    `ApiError`), `src/core/errors.ts` (map keys to messages and exit code 3).
  - Done when: `te start` while a timer runs says "a timer is already running
    (<id>), stop it with `te stop`" and exits 3; the other keys each have a
    one-line message; unit test per key.

- [x] **T-203 · Validate end after start locally** · S · validation
  - Why: `te create`, `te update` and `track stop --end` send end < start and
    only fail on the server; `--dry-run` reports success.
  - Change: `src/core/datetime.ts` (helper), used by `te create`, `te update`
    (when both are given) and `track stop`.
  - Done when: end ≤ start is a validation error (exit 3), also under
    `--dry-run`; unit and e2e tests.

- [ ] **T-204 · `te update --project` keeps project and task consistent** · S · fix
  - Why: 0.22 fixed project/task mismatches on project-only updates
    (upstream PR 1290). Changing only the project may now fail or drop the
    task; T-201 finds out which.
  - Change: `src/commands/time-entry.ts` update path: when `--project` is given
    without `--task`, send `task_id: null` unless the entry's task belongs to the
    new project. Also fix the misleading comment about Commander defaults.
  - Done when: e2e test for "move entry with task to another project"; result
    matches T-201's real-server finding.
  - Needs: T-201.

- [x] **T-205 · Upstream API drift check** · M · tooling
  - Why: the CLI learns about API changes from broken commands.
  - API: upstream `routes/api.php` and `app/Http/Requests/V1/**` on GitHub.
  - Change: `scripts/api-drift.mjs` fetches the route list and request field
    names and diffs them against a committed snapshot
    `docs/api-snapshot.json`; an `npm run api-drift` script; a scheduled
    (weekly) CI job that fails when the snapshot is out of date.
  - Done when: running it today produces the snapshot; changing one field in
    the snapshot makes it exit non-zero with a readable diff; CONTRIBUTING.md
    mentions it.

- [x] **T-206 · Shell completion covers subcommands and PowerShell** · M · ux
  - Why: completion only lists top-level commands, and there is no PowerShell
    script although the CLI runs on Windows.
  - Change: `src/commands/completion.ts`: walk the Commander tree for bash,
    zsh and fish (subcommands and long options); add `completion powershell`.
  - Done when: `solidtime te <TAB>` offers `list start stop …` in bash, zsh,
    fish and PowerShell; a unit test asserts every registered subcommand
    appears in each generated script.

### v0.3.0 — Everyday ergonomics

The commands people type most should not need IDs or full timestamps.
T-301 is the foundation; most other tasks use it.

- [ ] **T-301 · Relative periods and dates** · M · core
  - Why: every period is a pair of full ISO timestamps today.
  - Change: new `src/core/period.ts`: `--period today|yesterday|this-week|
    last-week|this-month|last-month|this-year` and `--since <duration|date>`
    (e.g. `2h`, `3d`, `2026-11-01`), converted to UTC. Day and week boundaries
    use the `timezone` and `week_start` from `users/me` (fall back to the
    machine's timezone and Monday).
    Wire into `te list`, `te aggregate`, `report`.
  - Done when: `--period` and `--since` work on those three commands; mixing them
    with `--start/--end` is a validation error; unit tests cover DST changes and
    month ends.

- [ ] **T-302 · `te stop` without an ID** · S · ux
  - Why: a person has to run `te active` first to find the ID.
  - API: `GET users/me/time-entries/active`, then `PUT time-entries/{id}`.
  - Change: `src/commands/time-entry.ts`: make `<id>` optional.
  - Done when: `te stop` stops the running timer; nothing running → exit 3
    "no running timer"; `--dry-run` shows the resolved ID; e2e test.

- [ ] **T-303 · `te continue [id]`** · S · ux
  - Why: restarting yesterday's work means retyping description, project, task
    and tags.
  - API: `GET time-entries` (latest of the member), `POST time-entries`.
  - Change: new subcommand in `time-entry.ts`; default is the member's most
    recent finished entry.
  - Done when: starts a new timer copying description, project, task, tags and
    billable; a running timer → the T-202 error; e2e test.

- [ ] **T-304 · `te create --duration`** · S · ux
  - Why: logging "1h30 on X, ending now" needs two computed timestamps.
  - Change: `te create`: `--duration <1h30m|90m|seconds>` with either `--start`
    or `--end` (default end: now). Reuse the existing duration parser.
  - Done when: any two of start/end/duration work; all three or only one is a
    validation error; e2e test.

- [ ] **T-305 · Names instead of IDs in tables** · M · output
  - Why: `te list` shows no project column; other tables print raw UUIDs.
  - Change: `src/core/resolve.ts`: a per-command lookup cache (project, task,
    tag, client, member names); `te list` gets Project and Tags columns;
    `task list`, `pm list`, `member list` print names. `--json` output is
    unchanged.
  - Done when: tables show names; one extra list request per resource type at
    most; e2e snapshot of `te list` table.

- [ ] **T-306 · Missing time-entry list filters** · S · coverage
  - Why: the API filters by several members, by tag match type, by entry type,
    and can round durations; the CLI can't.
  - API: `GET time-entries` and `GET time-entries/aggregate`: `member_ids[]`,
    `tag_match_type=contains|not_contains`, `type=work|break`,
    `rounding_type=up|down|nearest`, `rounding_minutes`.
  - Change: `te list` and `te aggregate`: `--members <id|name...>`,
    `--without-tags` (maps to `not_contains`), `--type`, `--round <up|down|nearest>:<minutes>`.
    `te aggregate` also gets name selectors for `--projects/--tasks/--tags`.
  - Done when: each flag maps to the query parameter (e2e on the mock server).

- [ ] **T-307 · `report` filters and grouping** · M · report
  - Why: `report` sums the whole organization, which is wrong for "my week";
    it can only group by project.
  - Change: `src/commands/report.ts`: `--mine`, `--member <id|name>`,
    `--group project|client|task|tag|day|week`, the T-301 period flags,
    billable amount column when the member may see rates.
  - Done when: `report --mine --period this-week` matches the web UI's numbers
    for the same filters; e2e tests for each group.
  - Needs: T-301.

- [ ] **T-308 · `status` one-liner** · S · ux
  - Why: shell prompts and agent status lines need a fast, short answer.
  - API: `GET users/me/time-entries/active` (+ local `track` files).
  - Change: new `src/commands/status.ts`: prints `⏱ 1:23 Description
    [Project]` or nothing; `+2 tracks` when local tracks run; `--json`.
    No list calls beyond the active entry.
  - Done when: one HTTP request at most; exit 0 with empty output when nothing
    runs; README shows a bash/zsh/PowerShell prompt snippet.

### v0.4.0 — Data in, data out

Wrap Solidtime's own export and import instead of building them in the CLI.
This replaces the earlier plan to generate CSV and parse imports locally.

- [ ] **T-401 · `export entries`** · M · export
  - Why: invoicing and backups need a file, not JSON on stdout.
  - API: `GET time-entries/export?format=csv|xlsx|ods|pdf` (same filters as
    `time-entries`), returns a download URL. PDF needs a paid plan on Solidtime
    Cloud (`FeatureIsNotAvailableInFreePlanApiException`) and a PDF renderer
    on self-hosted instances.
  - Change: new `src/commands/export.ts` + `src/core/download.ts` (fetch the
    URL and save to `--output <file>`, default name from the response).
    Filters and T-301 periods as on `te list`.
  - Done when: writes the file and prints its path (`--json`: path, format,
    size); `--dry-run` prints the query; the PDF plan error has a clear message;
    e2e test with the mock server serving a file.
  - Needs: T-301.

- [ ] **T-402 · `export report`** · S · export
  - Why: the aggregated report (by project, client, …) is what clients receive.
  - API: `GET time-entries/aggregate/export?format=…&group=…&sub_group=…`.
  - Change: `export report` in `export.ts`, reusing T-401's download helper.
  - Done when: as T-401, with `--group/--sub-group`.
  - Needs: T-401.

- [ ] **T-403 · `export organization`** · S · export
  - Why: a full backup of an organization (all resources and entries).
  - API: `POST export` → `{ download_url }`.
  - Change: `export organization --output <file>`.
  - Done when: the archive is saved; non-owner → clear permission error (exit 2).
  - Needs: T-401.

- [ ] **T-404 · `import`** · M · import
  - Why: bring history over from another tracker.
  - API: `GET importers` (list types), `POST import` with `{ type, data }`
    where `data` is the base64 file. Types today: `toggl_time_entries`,
    `toggl_data_importer`, `clockify_time_entries`, `clockify_projects`,
    `harvest_projects`, `harvest_time_entries`, `harvest_clients`,
    `generic_projects`, `generic_time_entries`, `solidtime`.
  - Change: new `src/commands/import.ts`: `import types`, `import <file>
    --type <type>`. Read the type list from the server, not a hard-coded list.
  - Done when: prints the server's created-counts report (clients, projects,
    tasks, time entries, tags, users); `--dry-run` validates the file exists and
    the type is known without uploading; README documents the generic CSV
    columns (link to the Solidtime docs).

### v0.5.0 — Agent kit

The CLI is agent-ready; this makes an agent setup a copy-paste job. Mostly docs
and small commands.

- [ ] **T-501 · Agent guide** · M · docs
  - Why: every agent re-learns the same conventions from `--help`.
  - Change: `docs/agents.md`: discovery (`discover all --compact`), `track`
    per session with `--label`, the `human`/`agent` tag convention, exit codes,
    retry rules, what never to do (no `te start` from agents). Plus
    `solidtime agent-guide` that prints it (bundled in `dist/`).
  - Done when: an agent given only `solidtime agent-guide` can log a session
    correctly (manual check, noted in the PR).

- [ ] **T-502 · Session hook recipes** · S · docs
  - Why: starting and stopping `track` by hand is the step agents forget.
  - Change: `docs/agents.md` section with tested snippets for Claude Code hooks
    (session start → `track start --label $SESSION`, session end →
    `track stop --all --label $SESSION`), and a generic shell wrapper.
  - Done when: each snippet was run once; stale-track behaviour on a crashed
    session is documented.
  - Needs: T-501.

- [ ] **T-503 · `track` session helpers** · S · track
  - Why: hooks need idempotent commands.
  - Change: `track start --label X --if-none` (no-op when a track with that
    label runs; prints the existing one); `track stop --all --label X` exits 0
    when nothing matches (today: check and align).
  - Done when: running the start hook twice creates one track; e2e tests.

- [ ] **T-504 · Field selection for JSON** · S · output
  - Why: agents pay tokens for full API objects.
  - Change: `src/core/output.ts`: `--fields id,description,duration` on list
    and show commands (top-level keys only).
  - Done when: works on every `list` command; unknown field → validation error.

- [ ] **T-505 · `doctor`** · S · ux
  - Why: "it doesn't work" needs one command that checks the setup.
  - Change: new `src/commands/doctor.ts`: config readable, base URL reachable,
    token valid (`users/me`), active org and member resolvable, clock skew
    versus the server's `Date` header, track directory writable, stale tracks,
    CLI version versus latest release.
  - Done when: each check prints ok/warn/fail; exit 1 if any fails; `--json`.

### v0.6.0 — Insights

Goals and dashboards arrived in Solidtime; reports should answer "how is this
week going?" without opening the web UI.

- [ ] **T-601 · `goal` commands** · M · coverage
  - Why: goals shipped in Solidtime 0.22 (e.g. "at least 6 h a day").
  - API: `GET|POST goals`, `GET|PUT|DELETE goals/{id}`. Fields: `name`,
    `type` (personal|organization), `comparison` (at_least|less_than),
    `target_seconds`, `period` (day|week|month), filters, `timezone`, `week_start`.
  - Change: new `src/commands/goal.ts`: `list|show|create|update|delete`;
    `--target 6h` uses the duration parser.
  - Done when: CRUD round-trip in smoke (write mode); `goal list` shows
    progress if the API returns it.

- [ ] **T-602 · `dashboard`** · M · insights
  - Why: the web dashboard's numbers, in the terminal.
  - API: `GET charts/{last-seven-days, daily-tracked-hours, weekly-history,
    total-weekly-time, total-weekly-billable-time,
    total-weekly-billable-amount, weekly-project-overview, latest-tasks,
    latest-team-activity}`.
  - Change: new `src/commands/dashboard.ts`: one summary screen (this week,
    billable, top projects, last 7 days as a text bar chart), and
    `dashboard <chart>` for each raw chart with `--json`.
  - Done when: summary uses at most four requests; each chart reachable.

- [ ] **T-603 · Period comparison in `report`** · M · report
  - Why: the old "analytics" item: this week versus last week.
  - Change: `report --compare previous|<period>`: adds a delta column.
  - Done when: deltas per row and total; `--json` has both periods.
  - Needs: T-307.

### v0.7.0 — Admin parity

Everything an organization owner can do in the web UI that the CLI can't.

- [ ] **T-701 · Missing project and organization fields** · S · coverage
  - API: `PUT projects/{id}`: `client_id`, `is_archived`, `is_public`,
    `billable_rate`, `estimated_time`. `PUT organizations/{org}`: `currency`,
    `employees_can_see_billable_rates`, `employees_can_manage_tasks`,
    `breaks_enabled`, `number_format`, `currency_format`, `date_format`,
    `interval_format`, `time_format`.
  - Change: `project create|update` (`--client`, `--no-client`, `--archived`,
    `--public`, `--billable-rate`, `--estimate`); `project archive|unarchive`
    shortcuts; `organization update` flags for the fields above.
  - Done when: each flag maps to its field (e2e).

- [ ] **T-702 · Breaks** · S · coverage
  - Why: with `breaks_enabled`, entries have `type: work|break`.
  - Change: `--break` on `te start`, `te create`, `track start`; `type` shown in
    `te list`.
  - Done when: e2e for each; the flag is rejected with a clear message when the
    server says breaks are disabled.
  - Needs: T-701.

- [ ] **T-703 · Member management** · M · coverage
  - API: `DELETE members/{id}`, `POST members/{id}/make-placeholder`,
    `POST members/{id}/invite-placeholder`, `POST member/{id}/merge-into`
    (note: singular `member` in the upstream route).
  - Change: `member remove|make-placeholder|invite|merge --into <member>`.
  - Done when: each has `--dry-run` and asks for confirmation when interactive.

- [ ] **T-704 · API tokens** · S · coverage
  - Why: create a scoped token for CI or an agent without the web UI.
  - API: `GET|POST users/me/api-tokens`, `POST users/me/api-tokens/{id}/revoke`,
    `DELETE users/me/api-tokens/{id}`.
  - Change: new `src/commands/token.ts`: `list|create|revoke|delete`.
  - Done when: `token create --name ci --json` prints the token once; README
    warns it is shown only once.

- [ ] **T-705 · Saved and shared reports** · M · coverage
  - API: `GET|POST reports`, `GET|PUT|DELETE reports/{id}`
    (`is_public`, `public_until`, `properties` with filters and grouping);
    `GET public/reports` (no auth, by share secret).
  - Change: new `src/commands/shared-report.ts`: `list|show|create|update|delete`;
    `create` takes the same filter flags as `te list` and prints the public URL.
  - Done when: CRUD round-trip in smoke (write mode); `member_ids` is never
    sent as `[]` (rejected since Solidtime 0.22).

- [ ] **T-706 · Organization switch syncs the server** · S · fix
  - API: `PUT users/me/current-organization`.
  - Change: `organization use` also sets the server-side current organization
    (best effort; failure is a warning, not an error).
  - Done when: the web UI opens in the organization last chosen in the CLI.

### Road to 1.0

1.0 is a promise, not a feature list:

- [ ] **T-901 · JSON output contract** · M · stability
  - Why: `--json` prints raw API objects, so an upstream rename breaks agents.
  - Change: `docs/json-output.md` lists the fields each command guarantees;
    tests assert them; changes to listed fields need a minor bump before 1.0
    and a major one after.
- [ ] **T-902 · Supported server versions** · S · stability
  - Change: README states the Solidtime versions tested (from T-201 and
    T-205); `doctor` warns on older servers when the version is detectable.
- [ ] Every row in [API coverage](#api-coverage) is ✅ or explicitly out of scope.

## API coverage

Solidtime API routes as of upstream 0.22.1, and where the CLI stands.
✅ covered · ◐ partial · ❌ missing · — out of scope.

| Area | Endpoints | CLI | Task |
| ---- | --------- | --- | ---- |
| Current user | `users/me`, `users/me/memberships` | ✅ `profile`, `where`, `discover` | |
| Current organization | `PUT users/me/current-organization` | ❌ | T-706 |
| Running timer | `users/me/time-entries/active` | ✅ `te active` | |
| API tokens | `users/me/api-tokens` (+ revoke) | ❌ | T-704 |
| User account | `PUT/DELETE users/{id}`, email verification | — web UI only | |
| Organization | `GET/PUT organizations/{org}` | ◐ name, rate, overlap only | T-701 |
| Organization create/delete | `POST organizations`, `DELETE organizations/{org}` | — too destructive for a CLI for now | |
| Members | `members` list/update | ✅ | |
| Members | remove, placeholder, merge | ❌ | T-703 |
| Invitations | `invitations` + resend | ✅ | |
| Projects | `projects` CRUD | ◐ missing client change, archive, public, rate, estimate | T-701 |
| Project members | `project-members` | ✅ | |
| Tasks | `tasks` CRUD | ✅ | |
| Tags, clients | CRUD | ✅ | |
| Time entries | CRUD, bulk update/delete | ✅ | |
| Time entries | `type` (breaks), rounding, `member_ids`, `tag_match_type` | ❌ | T-306, T-702 |
| Aggregate | `time-entries/aggregate` | ✅ `te aggregate`, `report` | |
| Export | `time-entries/export`, `aggregate/export`, `export` | ❌ | T-401–T-403 |
| Import | `importers`, `import` | ❌ | T-404 |
| Saved reports | `reports` CRUD, `public/reports` | ❌ | T-705 |
| Goals | `goals` CRUD | ❌ | T-601 |
| Dashboard | `charts/*` (9 charts) | ❌ | T-602 |
| Lookups | `currencies`, `time-zones` | ❌ | backlog |

T-205 keeps this table honest: when the drift check reports a new route, add a
row here.

## Backlog (unscheduled)

Ideas worth keeping, not yet worth a milestone. Promote one by giving it a task
ID in a milestone.

- **Lookup commands:** `solidtime currencies`, `solidtime time-zones` (only
  useful once T-701 takes `--currency`).
- **Interactive pickers:** when a selector is ambiguous and the terminal is
  interactive, offer a numbered choice instead of failing.
- **Resource cache:** cache project/task/tag lists for a few minutes to make
  name resolution cheaper on large organizations (watch for stale names).
- **Bulk by filter:** `te bulk-update --where <te list filters> --set …`,
  always with a `--dry-run` preview of the matched entries.
- **Timesheet entry:** `te log "09:00-10:30 Client Work: refactor #agent"`, a
  one-line grammar for fast manual entry.
- **Weekly email-ready summary:** `report --format markdown` for pasting into
  invoices or status updates.
- **Calendar sync:** create entries from an `.ics` export.
- **Config profiles per directory:** a `.solidtime.json` in a repo that sets the
  default project and tags for `track start` in that repo.

## Open decisions

Questions for the owner. Each has a recommendation; record the answer here and
turn it into tasks.

1. **MCP server mode** (`solidtime mcp`)? Agents with shell access already use
   the CLI; an MCP server adds a second interface to keep stable and likely a
   dependency. *Decision (2026-11-24):* not before 1.0; revisit if users
   without shell access ask for it.
2. **Default scope of `report` and `te list`:** whole organization (today) or
   the active member? Changing it is breaking. *Decision (2026-11-24):* keep
   the whole-organization default now, add `--mine` (`T-307`), and revisit for
   1.0.
3. **Server-side current organization:** should `org use` change what the web
   UI shows (T-706)? *Decision (2026-11-24):* yes, sync
   `PUT users/me/current-organization` as a best-effort side effect (`T-706`).
4. **Agent guide location:** `docs/agents.md` only, or also a packaged skill
   file for agent tools that load skills? *Decision (2026-11-24):* start with
   `docs/agents.md` and `solidtime agent-guide` (`T-501`); add a packaged skill
   file later once a format settles.

## Non-goals

- Publishing to the npm registry (the `solidtime-cli` name there belongs to
  another project); releases are GitHub `.tgz` only.
- Runtime dependencies beyond `commander`; HTTP stays on native `fetch`.
- A TUI or a running daemon. `track` stays file-based so it survives crashes.
- Reimplementing server features (export formats, importers, report rendering)
  that the API already provides.
- Account-level actions that belong in the web UI: password, email, deleting
  users or organizations.
