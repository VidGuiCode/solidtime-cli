import { Command } from "commander";
import { createClient, loadConfig, requireActiveOrganization } from "../core/config-store.js";
import { printJson, printTable } from "../core/output.js";
import { exitWithError } from "../core/errors.js";
import { isDryRunEnabled } from "../core/runtime.js";
import { unwrap } from "../core/api-client.js";
export function createTagCommand() {
    const cmd = new Command("tag").description("Manage tags");
    cmd
        .command("list")
        .description("List all tags")
        .option("--json", "Output raw JSON")
        .action(async (opts) => {
        try {
            const config = loadConfig();
            const client = createClient(config);
            const org = requireActiveOrganization(config);
            const res = await client.get(`organizations/${org}/tags`);
            const tags = unwrap(res);
            if (opts.json) {
                printJson(tags);
                return;
            }
            const rows = tags.map((t) => [t.name, t.id]);
            printTable(rows, ["Name", "ID"]);
        }
        catch (err) {
            exitWithError(err, Boolean(opts.json));
        }
    });
    cmd
        .command("create")
        .description("Create a new tag")
        .requiredOption("--name <name>", "Tag name")
        .option("--json", "Output raw JSON")
        .action(async (opts) => {
        try {
            const config = loadConfig();
            const client = createClient(config);
            const org = requireActiveOrganization(config);
            const body = { name: opts.name };
            if (isDryRunEnabled()) {
                printJson({ dryRun: true, action: "tag.create", body });
                return;
            }
            const res = await client.post(`organizations/${org}/tags`, body);
            if (opts.json) {
                printJson(res.data);
                return;
            }
            console.log(`Created tag: ${res.data.name} (${res.data.id})`);
        }
        catch (err) {
            exitWithError(err, Boolean(opts.json));
        }
    });
    cmd
        .command("update")
        .description("Update a tag")
        .argument("<id>", "Tag ID")
        .requiredOption("--name <name>", "New name")
        .option("--json", "Output raw JSON")
        .action(async (id, opts) => {
        try {
            const config = loadConfig();
            const client = createClient(config);
            const org = requireActiveOrganization(config);
            const body = { name: opts.name };
            if (isDryRunEnabled()) {
                printJson({ dryRun: true, action: "tag.update", id, body });
                return;
            }
            const res = await client.put(`organizations/${org}/tags/${id}`, body);
            if (opts.json) {
                printJson(res.data);
                return;
            }
            console.log(`Updated tag: ${res.data.name}`);
        }
        catch (err) {
            exitWithError(err, Boolean(opts.json));
        }
    });
    cmd
        .command("delete")
        .description("Delete a tag")
        .argument("<id>", "Tag ID")
        .option("--json", "Output raw JSON")
        .action(async (id, opts) => {
        try {
            const config = loadConfig();
            const client = createClient(config);
            const org = requireActiveOrganization(config);
            if (isDryRunEnabled()) {
                printJson({ dryRun: true, action: "tag.delete", id });
                return;
            }
            await client.delete(`organizations/${org}/tags/${id}`);
            if (opts.json) {
                printJson({ success: true, action: "delete", id });
                return;
            }
            console.log(`Deleted tag: ${id}`);
        }
        catch (err) {
            exitWithError(err, Boolean(opts.json));
        }
    });
    return cmd;
}
//# sourceMappingURL=tag.js.map