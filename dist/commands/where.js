import { Command } from "commander";
import { createClient, loadConfig, getActiveAccount } from "../core/config-store.js";
import { printInfo, printJson } from "../core/output.js";
import { exitWithError } from "../core/errors.js";
export function createWhereCommand() {
    return new Command("where")
        .description("Show current account, organization, and user context")
        .option("--json", "Output raw JSON")
        .action(async (opts) => {
        try {
            const config = loadConfig();
            const account = getActiveAccount(config);
            const client = account ? createClient(config) : null;
            const user = client
                ? await client
                    .get("users/me")
                    .then((r) => r.data)
                    .catch(() => null)
                : null;
            if (opts.json) {
                printJson({
                    schemaVersion: 1,
                    kind: "context",
                    context: {
                        account: account
                            ? { name: account.name, baseUrl: account.baseUrl }
                            : null,
                        organization: config.context.activeOrganization ?? null,
                        user: user
                            ? {
                                id: user.id,
                                name: user.name,
                                email: user.email,
                                timezone: user.timezone,
                            }
                            : null,
                    },
                });
                return;
            }
            printInfo(`Account:      ${account ? `${account.name}  (${account.baseUrl})` : "-"}`);
            printInfo(`Organization: ${config.context.activeOrganization ?? "-"}`);
            if (user) {
                printInfo(`User:         ${user.name} (${user.email})`);
                printInfo(`Timezone:     ${user.timezone}`);
            }
        }
        catch (err) {
            exitWithError(err, Boolean(opts.json));
        }
    });
}
//# sourceMappingURL=where.js.map