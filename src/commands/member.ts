import { Command } from "commander";
import { createClient, loadConfig, requireActiveOrganization } from "../core/config-store.js";
import { printJson, printTable } from "../core/output.js";
import { exitWithError } from "../core/errors.js";
import { unwrap } from "../core/api-client.js";
import type { SolidtimeMember } from "../core/types.js";

export function createMemberCommand(): Command {
  const cmd = new Command("member").description("List organization members");

  cmd
    .command("list")
    .description("List all members")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      try {
        const config = loadConfig();
        const client = createClient(config);
        const org = requireActiveOrganization(config);

        const res = await client.get<unknown>(`organizations/${org}/members`);
        const members = unwrap<SolidtimeMember>(res);

        if (opts.json) {
          printJson(members);
          return;
        }

        const rows = members.map((m) => [m.name, m.email, m.role]);
        printTable(rows, ["Name", "Email", "Role"]);
      } catch (err) {
        exitWithError(err, Boolean(opts.json));
      }
    });

  return cmd;
}
