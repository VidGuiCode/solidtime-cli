import { Command } from "commander";
import { createClient, loadConfig, requireActiveOrganization } from "../core/config-store.js";
import { printJson, printTable } from "../core/output.js";
import { exitWithError } from "../core/errors.js";
import { isDryRunEnabled } from "../core/runtime.js";
import { unwrap } from "../core/api-client.js";
import type { SolidtimeMember } from "../core/types.js";

export function createMemberCommand(): Command {
  const cmd = new Command("member").description("Manage organization members");

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

        const rows = members.map((m) => [m.name, m.email, m.role, m.id]);
        printTable(rows, ["Name", "Email", "Role", "ID"]);
      } catch (err) {
        exitWithError(err, Boolean(opts.json));
      }
    });

  cmd
    .command("update")
    .description("Update a member")
    .argument("<id>", "Member ID")
    .option("--role <role>", "New role (owner, admin, manager, employee)")
    .option("--billable-rate <cents>", "Billable rate in cents")
    .option("--json", "Output raw JSON")
    .action(async (id, opts) => {
      try {
        const config = loadConfig();
        const client = createClient(config);
        const org = requireActiveOrganization(config);

        const body: Record<string, unknown> = {};
        if (opts.role) body.role = opts.role;
        if (opts.billableRate) body.billable_rate = parseInt(opts.billableRate, 10);

        if (isDryRunEnabled()) {
          printJson({ dryRun: true, action: "member.update", id, body });
          return;
        }

        const res = await client.put<{ data: SolidtimeMember }>(
          `organizations/${org}/members/${id}`,
          body,
        );

        if (opts.json) {
          printJson(res.data);
          return;
        }

        console.log(`Updated member: ${res.data.name} (${res.data.role})`);
      } catch (err) {
        exitWithError(err, Boolean(opts.json));
      }
    });

  return cmd;
}
