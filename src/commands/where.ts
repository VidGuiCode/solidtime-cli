import { Command } from "commander";
import {
  createClient,
  loadConfig,
  getActiveAccount,
  getActiveOrganizationId,
} from "../core/config-store.js";
import { printInfo, printJson } from "../core/output.js";
import { exitWithError } from "../core/errors.js";
import type { SolidtimeUser } from "../core/types.js";

export function createWhereCommand(): Command {
  return new Command("where")
    .description("Show current account, organization, and user context")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      try {
        const config = loadConfig();
        const account = getActiveAccount(config);
        const hasEnvCredentials = Boolean(
          process.env.SOLIDTIME_BASE_URL && process.env.SOLIDTIME_API_TOKEN,
        );
        const client = account || hasEnvCredentials ? createClient(config) : null;
        const user = client
          ? await client
              .get<{ data: SolidtimeUser }>("users/me")
              .then((r) => r.data)
              .catch(() => null)
          : null;

        if (opts.json) {
          printJson({
            schemaVersion: 1,
            kind: "context",
            context: {
              account: account ? { name: account.name, baseUrl: account.baseUrl } : null,
              organization: getActiveOrganizationId(config),
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
        printInfo(`Organization: ${getActiveOrganizationId(config) ?? "-"}`);
        if (user) {
          printInfo(`User:         ${user.name} (${user.email})`);
          printInfo(`Timezone:     ${user.timezone}`);
        }
      } catch (err) {
        exitWithError(err, Boolean(opts.json));
      }
    });
}
