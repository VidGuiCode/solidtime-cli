import { Command } from "commander";
import { createClient, loadConfig, requireActiveOrganization, requireActiveMemberId, } from "../core/config-store.js";
import { printJson, printTable } from "../core/output.js";
import { exitWithError } from "../core/errors.js";
import { isDryRunEnabled } from "../core/runtime.js";
import { unwrap, SolidtimeApiError } from "../core/api-client.js";
function formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
}
function formatDate(iso) {
    return new Date(iso).toLocaleString();
}
export function createTimeEntryCommand() {
    const cmd = new Command("time-entry")
        .alias("te")
        .description("Manage time entries");
    cmd
        .command("list")
        .description("List time entries")
        .option("--json", "Output raw JSON")
        .option("--member <id>", "Filter by member ID")
        .option("--project <id>", "Filter by single project ID")
        .option("--projects <ids...>", "Filter by project IDs")
        .option("--clients <ids...>", "Filter by client IDs")
        .option("--tasks <ids...>", "Filter by task IDs")
        .option("--tags <ids...>", "Filter by tag IDs")
        .option("--start <datetime>", "Filter entries after this time (ISO 8601)")
        .option("--end <datetime>", "Filter entries before this time (ISO 8601)")
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
            const params = [];
            if (opts.member)
                params.push(`member_id=${opts.member}`);
            if (opts.project)
                params.push(`project_ids[]=${opts.project}`);
            if (opts.projects)
                for (const id of opts.projects)
                    params.push(`project_ids[]=${id}`);
            if (opts.clients)
                for (const id of opts.clients)
                    params.push(`client_ids[]=${id}`);
            if (opts.tasks)
                for (const id of opts.tasks)
                    params.push(`task_ids[]=${id}`);
            if (opts.tags)
                for (const id of opts.tags)
                    params.push(`tag_ids[]=${id}`);
            if (opts.start)
                params.push(`start=${opts.start}`);
            if (opts.end)
                params.push(`end=${opts.end}`);
            if (opts.active)
                params.push("active=true");
            if (opts.billable !== undefined)
                params.push(`billable=${opts.billable}`);
            if (opts.limit)
                params.push(`limit=${opts.limit}`);
            if (opts.offset)
                params.push(`offset=${opts.offset}`);
            if (opts.onlyFullDates)
                params.push("only_full_dates=true");
            const path = `organizations/${org}/time-entries` +
                (params.length > 0 ? `?${params.join("&")}` : "");
            const res = await client.get(path);
            const entries = unwrap(res);
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
        }
        catch (err) {
            exitWithError(err, Boolean(opts.json));
        }
    });
    cmd
        .command("start")
        .description("Start a new time entry (timer)")
        .requiredOption("--description <text>", "Description")
        .option("--project <id>", "Project ID")
        .option("--task <id>", "Task ID")
        .option("--tags <ids...>", "Tag IDs")
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
                start: new Date().toISOString(),
                end: null,
            };
            if (isDryRunEnabled()) {
                printJson({ dryRun: true, action: "time-entry.start", body });
                return;
            }
            const res = await client.post(`organizations/${org}/time-entries`, body);
            if (opts.json) {
                printJson(res.data);
                return;
            }
            console.log(`Timer started: ${res.data.description} (${res.data.id})`);
        }
        catch (err) {
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
                end: new Date().toISOString(),
            };
            if (isDryRunEnabled()) {
                printJson({ dryRun: true, action: "time-entry.stop", id, body });
                return;
            }
            const res = await client.put(`organizations/${org}/time-entries/${id}`, body);
            if (opts.json) {
                printJson(res.data);
                return;
            }
            console.log(`Timer stopped: ${formatDuration(res.data.duration)}`);
        }
        catch (err) {
            exitWithError(err, Boolean(opts.json));
        }
    });
    cmd
        .command("create")
        .description("Create a completed time entry")
        .requiredOption("--description <text>", "Description")
        .requiredOption("--start <iso>", "Start time (ISO 8601)")
        .requiredOption("--end <iso>", "End time (ISO 8601)")
        .option("--project <id>", "Project ID")
        .option("--task <id>", "Task ID")
        .option("--tags <ids...>", "Tag IDs")
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
                start: opts.start,
                end: opts.end,
                project_id: opts.project ?? null,
                task_id: opts.task ?? null,
                tags: opts.tags ?? [],
                billable: opts.billable ?? false,
            };
            if (isDryRunEnabled()) {
                printJson({ dryRun: true, action: "time-entry.create", body });
                return;
            }
            const res = await client.post(`organizations/${org}/time-entries`, body);
            if (opts.json) {
                printJson(res.data);
                return;
            }
            console.log(`Created: ${res.data.description} (${formatDuration(res.data.duration)})`);
        }
        catch (err) {
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
        .option("--tags <ids...>", "Tag IDs")
        .option("--start <iso>", "Start time")
        .option("--end <iso>", "End time")
        .option("--billable", "Mark as billable")
        .option("--no-billable", "Mark as not billable")
        .option("--json", "Output raw JSON")
        .action(async (id, opts) => {
        try {
            const config = loadConfig();
            const client = createClient(config);
            const org = requireActiveOrganization(config);
            const memberId = requireActiveMemberId(config);
            const body = { member_id: memberId };
            if (opts.description)
                body.description = opts.description;
            if (opts.project)
                body.project_id = opts.project;
            if (opts.task)
                body.task_id = opts.task;
            if (opts.tags)
                body.tags = opts.tags;
            if (opts.start)
                body.start = opts.start;
            if (opts.end)
                body.end = opts.end;
            if (opts.billable !== undefined)
                body.billable = opts.billable;
            if (isDryRunEnabled()) {
                printJson({ dryRun: true, action: "time-entry.update", id, body });
                return;
            }
            const res = await client.put(`organizations/${org}/time-entries/${id}`, body);
            if (opts.json) {
                printJson(res.data);
                return;
            }
            console.log(`Updated: ${res.data.description}`);
        }
        catch (err) {
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
        }
        catch (err) {
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
            const res = await client.get("users/me/time-entries/active");
            const entry = res.data;
            if (opts.json) {
                printJson(entry);
                return;
            }
            console.log(`Running: ${entry.description || "(no description)"}`);
            console.log(`  Started: ${formatDate(entry.start)}`);
            console.log(`  ID:      ${entry.id}`);
            if (entry.project_id)
                console.log(`  Project: ${entry.project_id}`);
        }
        catch (err) {
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
        .requiredOption("--ids <ids...>", "Time entry IDs")
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
            const changes = {};
            if (opts.description)
                changes.description = opts.description;
            if (opts.project)
                changes.project_id = opts.project;
            if (opts.task)
                changes.task_id = opts.task;
            if (opts.member)
                changes.member_id = opts.member;
            if (opts.billable !== undefined)
                changes.billable = opts.billable;
            const body = { ids: opts.ids, changes };
            if (isDryRunEnabled()) {
                printJson({ dryRun: true, action: "time-entry.bulk-update", body });
                return;
            }
            const res = await client.patch(`organizations/${org}/time-entries`, body);
            if (opts.json) {
                printJson(res);
                return;
            }
            console.log(`Updated: ${res.success.length} entries`);
            if (res.error.length > 0) {
                console.log(`Failed: ${res.error.length} entries`);
            }
        }
        catch (err) {
            exitWithError(err, Boolean(opts.json));
        }
    });
    cmd
        .command("bulk-delete")
        .description("Delete multiple time entries at once")
        .requiredOption("--ids <ids...>", "Time entry IDs")
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
            const res = await client.deleteWithBody(`organizations/${org}/time-entries`, body);
            if (opts.json) {
                printJson(res);
                return;
            }
            console.log(`Deleted: ${res.success.length} entries`);
            if (res.error.length > 0) {
                console.log(`Failed: ${res.error.length} entries`);
            }
        }
        catch (err) {
            exitWithError(err, Boolean(opts.json));
        }
    });
    cmd
        .command("aggregate")
        .description("Aggregate time entries with grouping")
        .requiredOption("--group <type>", "Group by: day, week, month, year, user, project, task, client, billable, description, tag")
        .option("--sub-group <type>", "Secondary grouping (same options as --group)")
        .option("--member <id>", "Filter by member ID")
        .option("--projects <ids...>", "Filter by project IDs")
        .option("--clients <ids...>", "Filter by client IDs")
        .option("--tasks <ids...>", "Filter by task IDs")
        .option("--tags <ids...>", "Filter by tag IDs")
        .option("--start <datetime>", "Filter entries after this time (ISO 8601)")
        .option("--end <datetime>", "Filter entries before this time (ISO 8601)")
        .option("--billable", "Only billable entries")
        .option("--no-billable", "Only non-billable entries")
        .option("--fill-gaps", "Fill gaps in time-based groups")
        .option("--json", "Output raw JSON")
        .action(async (opts) => {
        try {
            const config = loadConfig();
            const client = createClient(config);
            const org = requireActiveOrganization(config);
            const params = [];
            params.push(`group=${opts.group}`);
            if (opts.subGroup)
                params.push(`sub_group=${opts.subGroup}`);
            if (opts.member)
                params.push(`member_id=${opts.member}`);
            if (opts.projects)
                for (const id of opts.projects)
                    params.push(`project_ids[]=${id}`);
            if (opts.clients)
                for (const id of opts.clients)
                    params.push(`client_ids[]=${id}`);
            if (opts.tasks)
                for (const id of opts.tasks)
                    params.push(`task_ids[]=${id}`);
            if (opts.tags)
                for (const id of opts.tags)
                    params.push(`tag_ids[]=${id}`);
            if (opts.start)
                params.push(`start=${opts.start}`);
            if (opts.end)
                params.push(`end=${opts.end}`);
            if (opts.billable !== undefined)
                params.push(`billable=${opts.billable}`);
            if (opts.fillGaps)
                params.push("fill_gaps_in_time_groups=true");
            const path = `organizations/${org}/time-entries/aggregate?${params.join("&")}`;
            const res = await client.get(path);
            printJson(res);
        }
        catch (err) {
            exitWithError(err, Boolean(opts.json));
        }
    });
    return cmd;
}
//# sourceMappingURL=time-entry.js.map