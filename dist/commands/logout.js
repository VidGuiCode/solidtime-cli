import { Command } from "commander";
import { loadConfig, saveConfig } from "../core/config-store.js";
import { printInfo, printJson } from "../core/output.js";
import { exitWithError } from "../core/errors.js";
export function createLogoutCommand() {
    return new Command("logout")
        .description("Remove saved credentials")
        .option("--json", "Output raw JSON")
        .action(async (opts) => {
        try {
            const config = loadConfig();
            const name = config.context.activeProfile;
            if (!name) {
                printInfo("No active account to log out.");
                return;
            }
            config.profiles = config.profiles.filter((p) => p.name !== name);
            config.context = {};
            saveConfig(config);
            if (opts.json) {
                printJson({ success: true, action: "logout", account: name });
                return;
            }
            printInfo(`Logged out of "${name}".`);
        }
        catch (err) {
            exitWithError(err, Boolean(opts.json));
        }
    });
}
//# sourceMappingURL=logout.js.map