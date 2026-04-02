import { Command } from "commander";
import { loadConfig, saveConfig, requireActiveAccount } from "../core/config-store.js";
import { printInfo, printTable, printJson } from "../core/output.js";
import { exitWithError, ValidationError } from "../core/errors.js";
import { isDryRunEnabled } from "../core/runtime.js";
export function createAccountCommand() {
    const command = new Command("account")
        .description("Manage saved Solidtime accounts")
        .action(() => command.help());
    command
        .command("list")
        .description("List saved accounts")
        .option("--json", "Output raw JSON")
        .action((opts) => {
        const config = loadConfig();
        if (config.profiles.length === 0) {
            printInfo("No accounts saved. Run: solidtime login");
            return;
        }
        if (opts.json) {
            printJson(config.profiles.map((p) => ({
                name: p.name,
                baseUrl: p.baseUrl,
                defaultOrganization: p.defaultOrganization ?? null,
            })));
            return;
        }
        const rows = config.profiles.map((p) => [
            p.name === config.context.activeProfile ? `* ${p.name}` : `  ${p.name}`,
            p.baseUrl,
            p.defaultOrganization ?? "",
        ]);
        printTable(rows, ["ACCOUNT", "URL", "ORGANIZATION"]);
    });
    command
        .command("use <account>")
        .description("Switch the active account")
        .option("--json", "Output raw JSON")
        .action((accountName, opts) => {
        try {
            const config = loadConfig();
            const found = config.profiles.find((p) => p.name === accountName);
            if (!found) {
                throw new ValidationError(`Account "${accountName}" not found. Run: solidtime account list`);
            }
            if (isDryRunEnabled()) {
                printJson({
                    dryRun: true,
                    action: "account.use",
                    account: { name: found.name, baseUrl: found.baseUrl },
                });
                return;
            }
            config.context.activeProfile = accountName;
            config.context.activeOrganization = found.defaultOrganization;
            saveConfig(config);
            if (opts.json) {
                printJson({
                    success: true,
                    action: "account.use",
                    account: { name: found.name, baseUrl: found.baseUrl },
                });
                return;
            }
            printInfo(`Switched to account "${accountName}".`);
        }
        catch (err) {
            exitWithError(err, Boolean(opts.json));
        }
    });
    command
        .command("remove <account>")
        .description("Remove a saved account")
        .option("--json", "Output raw JSON")
        .action((accountName, opts) => {
        try {
            const config = loadConfig();
            const idx = config.profiles.findIndex((p) => p.name === accountName);
            if (idx < 0) {
                throw new ValidationError(`Account "${accountName}" not found. Run: solidtime account list`);
            }
            const removed = config.profiles[idx];
            const clearsActive = config.context.activeProfile === accountName;
            if (isDryRunEnabled()) {
                printJson({
                    dryRun: true,
                    action: "account.remove",
                    account: { name: removed.name, baseUrl: removed.baseUrl },
                });
                return;
            }
            config.profiles.splice(idx, 1);
            if (clearsActive) {
                config.context = {};
            }
            saveConfig(config);
            if (opts.json) {
                printJson({ success: true, action: "account.remove", account: removed.name });
                return;
            }
            printInfo(`Account "${accountName}" removed.`);
        }
        catch (err) {
            exitWithError(err, Boolean(opts.json));
        }
    });
    command
        .command("show")
        .description("Show details of the active account")
        .option("--json", "Output raw JSON")
        .action((opts) => {
        try {
            const config = loadConfig();
            const account = requireActiveAccount(config);
            if (opts.json) {
                printJson({
                    name: account.name,
                    baseUrl: account.baseUrl,
                    defaultOrganization: account.defaultOrganization ?? null,
                });
                return;
            }
            printInfo(`Name:         ${account.name}`);
            printInfo(`URL:          ${account.baseUrl}`);
            printInfo(`Organization: ${account.defaultOrganization ?? "-"}`);
        }
        catch (err) {
            exitWithError(err, Boolean(opts.json));
        }
    });
    return command;
}
//# sourceMappingURL=account.js.map