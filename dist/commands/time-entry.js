import { Command } from "commander";
import { createClient, loadConfig, requireActiveOrganization } from "../core/config-store.js";
import { printJson, printTable } from "../core/output.js";
import { exitWithError } from "../core/errors.js";
import { isDryRunEnabled } from "../core/runtime.js";
import { unwrap } from "../core/api-client.js";
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
        .option("--project <id>", "Filter by project ID")
        .option("--limit <n>", "Limit results", "20")
        .action(async (opts) => {
        try {
            const config = loadConfig();
            const client = createClient(config);
            const org = requireActiveOrganization(config);
            let path = `organizations/${org}/time-entries`;
            const params = [];
            if (opts.project)
                params.push(`project_id=${opts.project}`);
            if (params.length > 0)
                path += `?${params.join("&")}`;
            const res = await client.get(path);
            let entries = unwrap(res);
            const limit = parseInt(opts.limit, 10);
            if (limit > 0)
                entries = entries.slice(0, limit);
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
            const body = {
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
            const body = {
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
            const body = {
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
            const body = {};
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
    return cmd;
}
//# sourceMappingURL=time-entry.js.map