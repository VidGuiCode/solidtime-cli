#!/usr/bin/env node
import { createRequire } from "node:module";
import { Command } from "commander";
import { createLoginCommand } from "./commands/login.js";
import { createLogoutCommand } from "./commands/logout.js";
import { createWhereCommand } from "./commands/where.js";
import { createProjectCommand } from "./commands/project.js";
import { createTimeEntryCommand } from "./commands/time-entry.js";
import { createTaskCommand } from "./commands/task.js";
import { createTagCommand } from "./commands/tag.js";
import { createMemberCommand } from "./commands/member.js";
import { configureHelp } from "./core/help.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

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
    console.log(`  Get started: solidtime login\n`);
    program.help();
  });

program.addCommand(createLoginCommand());
program.addCommand(createLogoutCommand());
program.addCommand(createWhereCommand());
program.addCommand(createProjectCommand());
program.addCommand(createTimeEntryCommand());
program.addCommand(createTaskCommand());
program.addCommand(createTagCommand());
program.addCommand(createMemberCommand());

configureHelp(program);

program.parseAsync(process.argv);
