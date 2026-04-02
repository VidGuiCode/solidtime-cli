import { Command } from "commander";
import { createClient, loadConfig } from "../core/config-store.js";
import { printInfo, printJson } from "../core/output.js";
import { exitWithError } from "../core/errors.js";
import type { SolidtimeUser } from "../core/types.js";

export function createProfileCommand(): Command {
  return new Command("profile")
    .description("Show current user profile")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      try {
        const config = loadConfig();
        const client = createClient(config);

        const user = await client
          .get<{ data: SolidtimeUser }>("users/me")
          .then((r) => r.data);

        if (opts.json) {
          printJson(user);
          return;
        }

        printInfo(`Name:     ${user.name}`);
        printInfo(`Email:    ${user.email}`);
        printInfo(`Timezone: ${user.timezone}`);
        printInfo(`Week:     starts ${user.week_start}`);
      } catch (err) {
        exitWithError(err, Boolean(opts.json));
      }
    });
}
