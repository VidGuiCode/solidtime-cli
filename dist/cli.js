#!/usr/bin/env node
import { createRequire } from "node:module";
import { Command } from "commander";
import { createCompletionCommand } from "./commands/completion.js";
import { createLoginCommand } from "./commands/login.js";
import { createLogoutCommand } from "./commands/logout.js";
import { createAccountCommand } from "./commands/account.js";
import { createWhereCommand } from "./commands/where.js";
import { createOrganizationCommand } from "./commands/organization.js";
import { createProjectCommand } from "./commands/project.js";
import { createTimeEntryCommand } from "./commands/time-entry.js";
import { createTaskCommand } from "./commands/task.js";
import { createTagCommand } from "./commands/tag.js";
import { createMemberCommand } from "./commands/member.js";
import { createClientCommand } from "./commands/client.js";
import { createProjectMemberCommand } from "./commands/project-member.js";
import { createInvitationCommand } from "./commands/invitation.js";
import { createDiscoverCommand } from "./commands/discover.js";
import { createProfileCommand } from "./commands/profile.js";
import { createUpgradeCommand, fetchLatestVersion, isNewer } from "./commands/upgrade.js";
import { configureHelp } from "./core/help.js";
const require = createRequire(import.meta.url);
const pkg = require("../package.json");
const SPLASH = `
    ╔═══════════╗
    ║ SOLIDTIME ║   solidtime-cli
    ╚═══════════╝   Unofficial CLI for Solidtime
                    v${pkg.version}
`;
const program = new Command();
program
    .name("solidtime")
    .description("Unofficial CLI for Solidtime")
    .option("--dry-run", "Resolve and validate a mutating command without sending it")
    .option("--no-interactive", "Fail instead of prompting for missing input")
    .option("--compact", "Output compact JSON without indentation (for AI/agents)")
    .version(pkg.version)
    .helpCommand(true)
    .action(async () => {
    console.log(SPLASH);
    const latest = await Promise.race([
        fetchLatestVersion(),
        new Promise((resolve) => setTimeout(() => resolve(null), 1500)),
    ]);
    if (latest && isNewer(latest, pkg.version)) {
        console.log(`  Update available v${latest}  ·  run: solidtime upgrade\n`);
    }
    console.log(`  AI start: solidtime discover context\n`);
    program.help();
});
program.addCommand(createLoginCommand());
program.addCommand(createLogoutCommand());
program.addCommand(createCompletionCommand(program));
program.addCommand(createAccountCommand());
program.addCommand(createWhereCommand());
program.addCommand(createOrganizationCommand());
program.addCommand(createDiscoverCommand());
program.addCommand(createProjectCommand());
program.addCommand(createTimeEntryCommand());
program.addCommand(createTaskCommand());
program.addCommand(createTagCommand());
program.addCommand(createMemberCommand());
program.addCommand(createClientCommand());
program.addCommand(createProjectMemberCommand());
program.addCommand(createInvitationCommand());
program.addCommand(createProfileCommand());
program.addCommand(createUpgradeCommand());
configureHelp(program);
program.parseAsync(process.argv);
//# sourceMappingURL=cli.js.map