import { Command } from "commander";
import { createClient, loadConfig, requireActiveOrganization } from "../core/config-store.js";
import { printJson, printTable } from "../core/output.js";
import { exitWithError } from "../core/errors.js";
import { isDryRunEnabled } from "../core/runtime.js";
import { fetchAll } from "../core/api-client.js";
export function createClientCommand() {
    const cmd = new Command("client").description("Manage clients");
    cmd
        .command("list")
        .description("List all clients")
        .option("--json", "Output raw JSON")
        .option("--archived", "Include archived clients")
        .action(async (opts) => {
        try {
            const config = loadConfig();
            const client = createClient(config);
            const org = requireActiveOrganization(config);
            const params = [];
            if (opts.archived)
                params.push("filter[archived]=true");
            const path = `organizations/${org}/clients` + (params.length > 0 ? `?${params.join("&")}` : "");
            const clients = await fetchAll(client, path);
            if (opts.json) {
                printJson(clients);
                return;
            }
            const rows = clients.map((c) => [c.name, c.is_archived ? "archived" : "", c.id]);
            printTable(rows, ["Name", "Status", "ID"]);
        }
        catch (err) {
            exitWithError(err, Boolean(opts.json));
        }
    });
    cmd
        .command("create")
        .description("Create a new client")
        .requiredOption("--name <name>", "Client name")
        .option("--json", "Output raw JSON")
        .action(async (opts) => {
        try {
            const config = loadConfig();
            const client = createClient(config);
            const org = requireActiveOrganization(config);
            const body = { name: opts.name };
            if (isDryRunEnabled()) {
                printJson({ dryRun: true, action: "client.create", body });
                return;
            }
            const res = await client.post(`organizations/${org}/clients`, body);
            if (opts.json) {
                printJson(res.data);
                return;
            }
            console.log(`Created client: ${res.data.name} (${res.data.id})`);
        }
        catch (err) {
            exitWithError(err, Boolean(opts.json));
        }
    });
    cmd
        .command("update")
        .description("Update a client")
        .argument("<id>", "Client ID")
        .option("--name <name>", "New name")
        .option("--archived", "Mark as archived")
        .option("--no-archived", "Mark as not archived")
        .option("--json", "Output raw JSON")
        .action(async (id, opts) => {
        try {
            const config = loadConfig();
            const client = createClient(config);
            const org = requireActiveOrganization(config);
            const body = {};
            if (opts.name)
                body.name = opts.name;
            if (opts.archived !== undefined)
                body.is_archived = opts.archived;
            if (isDryRunEnabled()) {
                printJson({ dryRun: true, action: "client.update", id, body });
                return;
            }
            const res = await client.put(`organizations/${org}/clients/${id}`, body);
            if (opts.json) {
                printJson(res.data);
                return;
            }
            console.log(`Updated client: ${res.data.name}`);
        }
        catch (err) {
            exitWithError(err, Boolean(opts.json));
        }
    });
    cmd
        .command("delete")
        .description("Delete a client")
        .argument("<id>", "Client ID")
        .option("--json", "Output raw JSON")
        .action(async (id, opts) => {
        try {
            const config = loadConfig();
            const client = createClient(config);
            const org = requireActiveOrganization(config);
            if (isDryRunEnabled()) {
                printJson({ dryRun: true, action: "client.delete", id });
                return;
            }
            await client.delete(`organizations/${org}/clients/${id}`);
            if (opts.json) {
                printJson({ success: true, action: "delete", id });
                return;
            }
            console.log(`Deleted client: ${id}`);
        }
        catch (err) {
            exitWithError(err, Boolean(opts.json));
        }
    });
    return cmd;
}
//# sourceMappingURL=client.js.map