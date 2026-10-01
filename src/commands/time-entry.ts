import { Command } from "commander";
import {
  createClient,
  loadConfig,
  requireActiveOrganization,
  requireActiveMemberId,
} from "../core/config-store.js";
import { printJson, printTable } from "../core/output.js";
import { exitWithError, ValidationError } from "../core/errors.js";
import { isDryRunEnabled } from "../core/runtime.js";
import { normalizeDateTime, toUTCString } from "../core/datetime.js";
import { unwrap, SolidtimeApiError } from "../core/api-client.js";
import type { SolidtimeTimeEntry } from "../core/types.js";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function createTimeEntryCommand(): Command {
  const cmd = new Command("time-entry")
    .alias("te")
    .description("Manage time entries");

  cmd
    .command("list")
    .description("List time entries")
    .option("--json", "Output raw JSON")
    .option("--member <id>", "Filter by member ID")
    .option("--project <id>", "Filter by single project ID")
    .option("--projects <ids...>", "Filter by project IDs (space-separated)")
    .option("--clients <ids...>", "Filter by client IDs (space-separated)")
    .option("--tasks <ids...>", "Filter by task IDs (space-separated)")
    .option("--tags <ids...>", "Filter by tag IDs (space-separated)")
    .option("--start <datetime>", "Filter after this time (e.g. 2026-04-01T00:00:00Z or +02:00)")
    .option("--end <datetime>", "Filter before this time (e.g. 2026-04-01T23:59:59Z or +02:00)")
    .option("--active", "Only active (running) entries")
    .option("--billable", "Only billable entries")
    .option("--no-billable", "Only non-billable entries")
    .option("--limit <n>", "Limit results (1-500)", "50")
    .option("--offset <n>", "Skip N results")
    .option("--only-full-dates", "Only complete date ranges")
    .action(async (opts) => {
      try {
        const config = loadConfig();
        const client = createClient(config);
        const org = requireActiveOrganization(config);

        const params = new URLSearchParams();
        if (opts.member) params.append("member_id", opts.member);
        if (opts.project) params.append("project_ids[]", opts.project);
        if (opts.projects) for (const id of opts.projects) params.append("project_ids[]", id);
        if (opts.clients) for (const id of opts.clients) params.append("client_ids[]", id);
        if (opts.tasks) for (const id of opts.tasks) params.append("task_ids[]", id);
        if (opts.tags) for (const id of opts.tags) params.append("tag_ids[]", id);
        if (opts.start) params.append("start", normalizeDateTime(opts.start));
        if (opts.end) params.append("end", normalizeDateTime(opts.end));
        if (opts.active) params.append("active", "true");
        if (opts.billable !== undefined) params.append("billable", String(opts.billable));
        if (opts.limit) params.append("limit", opts.limit);
        if (opts.offset) params.append("offset", opts.offset);
        if (opts.onlyFullDates) params.append("only_full_dates", "true");

        const query = params.toString();
        const path = `organizations/${org}/time-entries` + (query ? `?${query}` : "");

        const res = await client.get<unknown>(path);
        const entries = unwrap<SolidtimeTimeEntry>(res);

        if (opts.json) {
          printJson(entries);
          return;
        }

        const rows = entries.map((e) => [
          e.description || "(no description)",
          formatDate(e.start),
          e.end ? formatDate(e.end) : "running",
          e.end ? formatDuration(e.duration) : "...",
          e.billable ? "billable" : "",
        ]);
        printTable(rows, ["Description", "Start", "End", "Duration", "Billable"]);
      } catch (err) {
        exitWithError(err, Boolean(opts.json));
      }
    });

  cmd
    .command("start")
    .description("Start a new time entry (timer)")
    .requiredOption("--description <text>", "Description")
    .option("--project <id>", "Project ID")
    .option("--task <id>", "Task ID")
    .option("--tags <ids...>", "Tag IDs (space-separated)")
    .option("--billable", "Mark as billable")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      try {
        const config = loadConfig();
        const client = createClient(config);
        const org = requireActiveOrganization(config);
        const memberId = requireActiveMemberId(config);

        const body = {
          member_id: memberId,
          description: opts.description,
          project_id: opts.project ?? null,
          task_id: opts.task ?? null,
          tags: opts.tags ?? [],
          billable: opts.billable ?? false,
          start: toUTCString(new Date()),
          end: null,
        };

        if (isDryRunEnabled()) {
          printJson({ dryRun: true, action: "time-entry.start", body });
          return;
        }

        const res = await client.post<{ data: SolidtimeTimeEntry }>(
          `organizations/${org}/time-entries`,
          body,
        );

        if (opts.json) {
          printJson(res.data);
          return;
        }

        console.log(`Timer started: ${res.data.description} (${res.data.id})`);
      } catch (err) {
        exitWithError(err, Boolean(opts.json));
      }
    });

  cmd
    .command("stop")
    .description("Stop a running time entry")
    .argument("<id>", "Time entry ID")
    .option("--json", "Output raw JSON")
    .action(async (id, opts) => {
      try {
        const config = loadConfig();
        const client = createClient(config);
        const org = requireActiveOrganization(config);
        const memberId = requireActiveMemberId(config);

        const body = {
          member_id: memberId,
          end: toUTCString(new Date()),
        };

        if (isDryRunEnabled()) {
          printJson({ dryRun: true, action: "time-entry.stop", id, body });
          return;
        }

        const res = await client.put<{ data: SolidtimeTimeEntry }>(
          `organizations/${org}/time-entries/${id}`,
          body,
        );

        if (opts.json) {
          printJson(res.data);
          return;
        }

        console.log(`Timer stopped: ${formatDuration(res.data.duration)}`);
      } catch (err) {
        exitWithError(err, Boolean(opts.json));
      }
    });

  cmd
    .command("create")
    .description("Create a completed time entry")
    .requiredOption("--description <text>", "Description")
    .requiredOption("--start <iso>", "Start time (e.g. 2026-04-01T09:00:00Z or +02:00)")
    .requiredOption("--end <iso>", "End time (e.g. 2026-04-01T17:00:00Z or +02:00)")
    .option("--project <id>", "Project ID")
    .option("--task <id>", "Task ID")
    .option("--tags <ids...>", "Tag IDs (space-separated)")
    .option("--billable", "Mark as billable")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      try {
        const config = loadConfig();
        const client = createClient(config);
        const org = requireActiveOrganization(config);
        const memberId = requireActiveMemberId(config);

        const body = {
          member_id: memberId,
          description: opts.description,
          start: normalizeDateTime(opts.start),
          end: normalizeDateTime(opts.end),
          project_id: opts.project ?? null,
          task_id: opts.task ?? null,
          tags: opts.tags ?? [],
          billable: opts.billable ?? false,
        };

        if (isDryRunEnabled()) {
          printJson({ dryRun: true, action: "time-entry.create", body });
          return;
        }

        const res = await client.post<{ data: SolidtimeTimeEntry }>(
          `organizations/${org}/time-entries`,
          body,
        );

        if (opts.json) {
          printJson(res.data);
          return;
        }

        console.log(`Created: ${res.data.description} (${formatDuration(res.data.duration)})`);
      } catch (err) {
        exitWithError(err, Boolean(opts.json));
      }
    });

  cmd
    .command("update")
    .description("Update a time entry")
    .argument("<id>", "Time entry ID")
    .option("--description <text>", "New description")
    .option("--project <id>", "Project ID")
    .option("--task <id>", "Task ID")
    .option("--tags <ids...>", "Tag IDs (space-separated)")
    .option("--start <iso>", "Start time (e.g. 2026-04-01T09:00:00Z or +02:00)")
    .option("--end <iso>", "End time (e.g. 2026-04-01T17:00:00Z or +02:00)")
    .option("--billable", "Mark as billable")
    .option("--no-billable", "Mark as not billable")
    .option("--json", "Output raw JSON")
    .action(async (id, opts) => {
      try {
        const config = loadConfig();
        const client = createClient(config);
        const org = requireActiveOrganization(config);
        const memberId = requireActiveMemberId(config);

        const body: Record<string, unknown> = { member_id: memberId };
        if (opts.description) body.description = opts.description;
        if (opts.project) body.project_id = opts.project;
        if (opts.task) body.task_id = opts.task;
        if (opts.tags) body.tags = opts.tags;
        if (opts.start) body.start = normalizeDateTime(opts.start);
        if (opts.end) body.end = normalizeDateTime(opts.end);
        if (opts.billable !== undefined) body.billable = opts.billable;

        if (Object.keys(body).length === 1 && 'member_id' in body) {
          throw new ValidationError("No fields to update provided.");
        }

        if (isDryRunEnabled()) {
          printJson({ dryRun: true, action: "time-entry.update", id, body });
          return;
        }

        const res = await client.put<{ data: SolidtimeTimeEntry }>(
          `organizations/${org}/time-entries/${id}`,
          body,
        );

        if (opts.json) {
          printJson(res.data);
          return;
        }

        console.log(`Updated: ${res.data.description}`);
      } catch (err) {
        exitWithError(err, Boolean(opts.json));
      }
    });

  cmd
    .command("delete")
    .description("Delete a time entry")
    .argument("<id>", "Time entry ID")
    .option("--json", "Output raw JSON")
    .action(async (id, opts) => {
      try {
        const config = loadConfig();
        const client = createClient(config);
        const org = requireActiveOrganization(config);

        if (isDryRunEnabled()) {
          printJson({ dryRun: true, action: "time-entry.delete", id });
          return;
        }

        await client.delete(`organizations/${org}/time-entries/${id}`);

        if (opts.json) {
          printJson({ success: true, action: "delete", id });
          return;
        }

        console.log(`Deleted time entry: ${id}`);
      } catch (err) {
        exitWithError(err, Boolean(opts.json));
      }
    });

  cmd
    .command("active")
    .description("Show the currently running timer")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      try {
        const config = loadConfig();
        const client = createClient(config);

        const res = await client.get<{ data: SolidtimeTimeEntry }>(
          "users/me/time-entries/active",
        );
        const entry = res.data;

        if (opts.json) {
          printJson(entry);
          return;
        }

        console.log(`Running: ${entry.description || "(no description)"}`);
        console.log(`  Started: ${formatDate(entry.start)}`);
        console.log(`  ID:      ${entry.id}`);
        if (entry.project_id) console.log(`  Project: ${entry.project_id}`);
      } catch (err) {
        if (err instanceof SolidtimeApiError && err.status === 404) {
          if (opts.json) {
            printJson({ active: false });
            return;
          }
          console.log("No timer running.");
          return;
        }
        exitWithError(err, Boolean(opts.json));
      }
    });

  cmd
    .command("bulk-update")
    .description("Update multiple time entries at once")
    .requiredOption("--ids <ids...>", "Time entry IDs (space-separated)")
    .option("--description <text>", "New description")
    .option("--project <id>", "Project ID")
    .option("--task <id>", "Task ID")
    .option("--member <id>", "Member ID")
    .option("--billable", "Mark as billable")
    .option("--no-billable", "Mark as not billable")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      try {
        const config = loadConfig();
        const client = createClient(config);
        const org = requireActiveOrganization(config);

        const changes: Record<string, unknown> = {};
        if (opts.description) changes.description = opts.description;
        if (opts.project) changes.project_id = opts.project;
        if (opts.task) changes.task_id = opts.task;
        if (opts.member) changes.member_id = opts.member;
        if (opts.billable !== undefined) changes.billable = opts.billable;

        if (Object.keys(changes).length === 0) {
          throw new ValidationError("No fields to update provided.");
        }

        const body = { ids: opts.ids, changes };

        if (isDryRunEnabled()) {
          printJson({ dryRun: true, action: "time-entry.bulk-update", body });
          return;
        }

        const res = await client.patch<{ success: string[]; error: string[] }>(
          `organizations/${org}/time-entries`,
          body,
        );

        if (opts.json) {
          printJson(res);
          return;
        }

        console.log(`Updated: ${res.success.length} entries`);
        if (res.error.length > 0) {
          console.log(`Failed: ${res.error.length} entries`);
        }
      } catch (err) {
        exitWithError(err, Boolean(opts.json));
      }
    });

  cmd
    .command("bulk-delete")
    .description("Delete multiple time entries at once")
    .requiredOption("--ids <ids...>", "Time entry IDs (space-separated)")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      try {
        const config = loadConfig();
        const client = createClient(config);
        const org = requireActiveOrganization(config);

        const body = { ids: opts.ids };

        if (isDryRunEnabled()) {
          printJson({ dryRun: true, action: "time-entry.bulk-delete", body });
          return;
        }

        const res = await client.deleteWithBody<{ success: string[]; error: string[] }>(
          `organizations/${org}/time-entries`,
          body,
        );

        if (opts.json) {
          printJson(res);
          return;
        }

        console.log(`Deleted: ${res.success.length} entries`);
        if (res.error.length > 0) {
          console.log(`Failed: ${res.error.length} entries`);
        }
      } catch (err) {
        exitWithError(err, Boolean(opts.json));
      }
    });

  cmd
    .command("aggregate")
    .description("Aggregate time entries with grouping")
    .requiredOption(
      "--group <type>",
      "Group by: day, week, month, year, user, project, task, client, billable, description, tag",
    )
    .option("--sub-group <type>", "Secondary grouping (same options as --group)")
    .option("--member <id>", "Filter by member ID")
    .option("--projects <ids...>", "Filter by project IDs (space-separated)")
    .option("--clients <ids...>", "Filter by client IDs (space-separated)")
    .option("--tasks <ids...>", "Filter by task IDs (space-separated)")
    .option("--tags <ids...>", "Filter by tag IDs (space-separated)")
    .option("--start <datetime>", "Filter after this time (e.g. 2026-04-01T00:00:00Z or +02:00)")
    .option("--end <datetime>", "Filter before this time (e.g. 2026-04-01T23:59:59Z or +02:00)")
    .option("--billable", "Only billable entries")
    .option("--no-billable", "Only non-billable entries")
    .option("--fill-gaps", "Fill gaps in time-based groups")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      try {
        const config = loadConfig();
        const client = createClient(config);
        const org = requireActiveOrganization(config);

        const params = new URLSearchParams();
        params.append("group", opts.group);
        if (opts.subGroup) params.append("sub_group", opts.subGroup);
        if (opts.member) params.append("member_id", opts.member);
        if (opts.projects) for (const id of opts.projects) params.append("project_ids[]", id);
        if (opts.clients) for (const id of opts.clients) params.append("client_ids[]", id);
        if (opts.tasks) for (const id of opts.tasks) params.append("task_ids[]", id);
        if (opts.tags) for (const id of opts.tags) params.append("tag_ids[]", id);
        if (opts.start) params.append("start", normalizeDateTime(opts.start));
        if (opts.end) params.append("end", normalizeDateTime(opts.end));
        if (opts.billable !== undefined) params.append("billable", String(opts.billable));
        if (opts.fillGaps) params.append("fill_gaps_in_time_groups", "true");

        const query = params.toString();
        const path = `organizations/${org}/time-entries/aggregate?${query}`;
        const res = await client.get<unknown>(path);

        printJson(res);
      } catch (err) {
        exitWithError(err, Boolean(opts.json));
      }
    });

  return cmd;
}
