import { Command } from "commander";
import { createClient, loadConfig, requireActiveOrganization } from "../core/config-store.js";
import { printJson, printTable } from "../core/output.js";
import { exitWithError, ValidationError } from "../core/errors.js";
import { isDryRunEnabled } from "../core/runtime.js";
import { fetchAll } from "../core/api-client.js";
import { resolveProject } from "../core/resolve.js";
import { parseDurationSeconds } from "../core/datetime.js";
function formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
}
export function createTaskCommand() {
    const cmd = new Command("task").description("Manage tasks");
    cmd
        .command("list")
        .description("List all tasks")
        .option("--json", "Output raw JSON")
        .option("--project <id|name>", "Filter by project ID or name")
        .option("--done", "Include completed tasks")
        .action(async (opts) => {
        try {
            const config = loadConfig();
            const client = createClient(config);
            const org = requireActiveOrganization(config);
            const projectId = opts.project ? await resolveProject(client, org, opts.project) : null;
            const params = new URLSearchParams();
            if (projectId)
                params.append("project_id", projectId);
            if (!opts.done)
                params.append("done", "false");
            const query = params.toString();
            const path = `organizations/${org}/tasks` + (query ? `?${query}` : "");
            const tasks = await fetchAll(client, path);
            if (opts.json) {
                printJson(tasks);
                return;
            }
            const rows = tasks.map((t) => [
                t.name,
                t.is_done ? "done" : "open",
                formatDuration(t.spent_time),
                t.project_id ?? "-",
            ]);
            printTable(rows, ["Name", "Status", "Tracked", "Project"]);
        }
        catch (err) {
            exitWithError(err, Boolean(opts.json));
        }
    });
    cmd
        .command("create")
        .description("Create a new task")
        .requiredOption("--name <name>", "Task name")
        .requiredOption("--project <id|name>", "Project ID or name")
        .option("--estimate <duration>", "Estimated time (e.g. 90m, 1h30m, or plain seconds)")
        .option("--json", "Output raw JSON")
        .action(async (opts) => {
        try {
            const config = loadConfig();
            const client = createClient(config);
            const org = requireActiveOrganization(config);
            const projectId = await resolveProject(client, org, opts.project);
            const body = {
                name: opts.name,
                project_id: projectId,
            };
            if (opts.estimate)
                body.estimated_time = parseDurationSeconds(opts.estimate);
            if (isDryRunEnabled()) {
                printJson({ dryRun: true, action: "task.create", body });
                return;
            }
            const res = await client.post(`organizations/${org}/tasks`, body);
            if (opts.json) {
                printJson(res.data);
                return;
            }
            console.log(`Created task: ${res.data.name} (${res.data.id})`);
        }
        catch (err) {
            exitWithError(err, Boolean(opts.json));
        }
    });
    cmd
        .command("update")
        .description("Update a task")
        .argument("<id>", "Task ID")
        .option("--name <name>", "New name")
        .option("--project <id|name>", "Move the task to this project (ID or name)")
        .option("--estimate <duration>", "Estimated time (e.g. 90m, 1h30m, or plain seconds)")
        .option("--done", "Mark as done")
        .option("--no-done", "Mark as not done")
        .option("--json", "Output raw JSON")
        .action(async (id, opts) => {
        try {
            const config = loadConfig();
            const client = createClient(config);
            const org = requireActiveOrganization(config);
            const body = {};
            if (opts.name)
                body.name = opts.name;
            if (opts.project)
                body.project_id = await resolveProject(client, org, opts.project);
            if (opts.estimate)
                body.estimated_time = parseDurationSeconds(opts.estimate);
            if (opts.done !== undefined)
                body.is_done = opts.done;
            if (Object.keys(body).length === 0) {
                throw new ValidationError("No fields to update provided.");
            }
            if (isDryRunEnabled()) {
                printJson({ dryRun: true, action: "task.update", id, body });
                return;
            }
            const res = await client.put(`organizations/${org}/tasks/${id}`, body);
            if (opts.json) {
                printJson(res.data);
                return;
            }
            console.log(`Updated task: ${res.data.name}`);
        }
        catch (err) {
            exitWithError(err, Boolean(opts.json));
        }
    });
    cmd
        .command("delete")
        .description("Delete a task")
        .argument("<id>", "Task ID")
        .option("--json", "Output raw JSON")
        .action(async (id, opts) => {
        try {
            const config = loadConfig();
            const client = createClient(config);
            const org = requireActiveOrganization(config);
            if (isDryRunEnabled()) {
                printJson({ dryRun: true, action: "task.delete", id });
                return;
            }
            await client.delete(`organizations/${org}/tasks/${id}`);
            if (opts.json) {
                printJson({ success: true, action: "delete", id });
                return;
            }
            console.log(`Deleted task: ${id}`);
        }
        catch (err) {
            exitWithError(err, Boolean(opts.json));
        }
    });
    return cmd;
}
//# sourceMappingURL=task.js.map