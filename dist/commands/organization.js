import { Command } from "commander";
import { createClient, loadConfig, saveConfig, requireActiveOrganization, } from "../core/config-store.js";
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
            const account = config.profiles.find((p) => p.name === config.context.activeProfile);
            if (account) {
                account.memberId = match.id;
            }
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
    command
        .command("show")
        .description("Show details of the active organization")
        .option("--json", "Output raw JSON")
        .action(async (opts) => {
        try {
            const config = loadConfig();
            const client = createClient(config);
            const org = requireActiveOrganization(config);
            const res = await client.get(`organizations/${org}`);
            const organization = res.data;
            if (opts.json) {
                printJson(organization);
                return;
            }
            printInfo(`Name:       ${organization.name}`);
            printInfo(`ID:         ${organization.id}`);
            printInfo(`Currency:   ${organization.currency}`);
        }
        catch (err) {
            exitWithError(err, Boolean(opts.json));
        }
    });
    command
        .command("update")
        .description("Update organization settings")
        .option("--name <name>", "Organization name")
        .option("--billable-rate <cents>", "Default billable rate in cents")
        .option("--prevent-overlapping-time-entries", "Prevent overlapping time entries")
        .option("--no-prevent-overlapping-time-entries", "Allow overlapping time entries")
        .option("--json", "Output raw JSON")
        .action(async (opts) => {
        try {
            const config = loadConfig();
            const client = createClient(config);
            const org = requireActiveOrganization(config);
            const body = {};
            if (opts.name)
                body.name = opts.name;
            if (opts.billableRate)
                body.billable_rate = parseInt(opts.billableRate, 10);
            if (opts.preventOverlappingTimeEntries !== undefined)
                body.prevent_overlapping_time_entries = opts.preventOverlappingTimeEntries;
            if (isDryRunEnabled()) {
                printJson({ dryRun: true, action: "organization.update", body });
                return;
            }
            const res = await client.put(`organizations/${org}`, body);
            if (opts.json) {
                printJson(res.data);
                return;
            }
            printInfo(`Updated organization: ${res.data.name}`);
        }
        catch (err) {
            exitWithError(err, Boolean(opts.json));
        }
    });
    return command;
}
//# sourceMappingURL=organization.js.map