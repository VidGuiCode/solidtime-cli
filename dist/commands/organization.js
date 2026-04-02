import { Command } from "commander";
import { createClient, loadConfig, saveConfig } from "../core/config-store.js";
import { printInfo, printTable, printJson } from "../core/output.js";
import { exitWithError, ValidationError } from "../core/errors.js";
import { isDryRunEnabled } from "../core/runtime.js";
export function createOrganizationCommand() {
    const command = new Command("organization")
        .alias("org")
        .description("Manage organization context")
        .action(() => command.help());
    command
        .command("list")
        .description("List organizations you belong to")
        .option("--json", "Output raw JSON")
        .action(async (opts) => {
        try {
            const config = loadConfig();
            const client = createClient(config);
            const res = await client.get("users/me/memberships");
            const memberships = res.data;
            if (opts.json) {
                printJson(memberships.map((m) => ({
                    id: m.organization.id,
                    name: m.organization.name,
                    currency: m.organization.currency,
                    role: m.role,
                    active: m.organization.id === config.context.activeOrganization,
                })));
                return;
            }
            const rows = memberships.map((m) => [
                m.organization.id === config.context.activeOrganization
                    ? `* ${m.organization.name}`
                    : `  ${m.organization.name}`,
                m.organization.id,
                m.role,
                m.organization.currency,
            ]);
            printTable(rows, ["Organization", "ID", "Role", "Currency"]);
        }
        catch (err) {
            exitWithError(err, Boolean(opts.json));
        }
    });
    command
        .command("use <name-or-id>")
        .description("Switch the active organization")
        .option("--json", "Output raw JSON")
        .action(async (nameOrId, opts) => {
        try {
            const config = loadConfig();
            const client = createClient(config);
            const res = await client.get("users/me/memberships");
            const memberships = res.data;
            const lower = nameOrId.toLowerCase();
            const match = memberships.find((m) => m.organization.id === nameOrId ||
                m.organization.name.toLowerCase() === lower);
            if (!match) {
                throw new ValidationError(`Organization "${nameOrId}" not found. Run: solidtime organization list`);
            }
            if (isDryRunEnabled()) {
                printJson({
                    dryRun: true,
                    action: "organization.use",
                    organization: {
                        id: match.organization.id,
                        name: match.organization.name,
                    },
                });
                return;
            }
            config.context.activeOrganization = match.organization.id;
            saveConfig(config);
            if (opts.json) {
                printJson({
                    success: true,
                    action: "organization.use",
                    organization: {
                        id: match.organization.id,
                        name: match.organization.name,
                    },
                });
                return;
            }
            printInfo(`Switched to organization "${match.organization.name}".`);
        }
        catch (err) {
            exitWithError(err, Boolean(opts.json));
        }
    });
    return command;
}
//# sourceMappingURL=organization.js.map