import { Command } from "commander";
import { createClient, loadConfig, requireActiveOrganization } from "../core/config-store.js";
import { printJson, printTable } from "../core/output.js";
import { exitWithError } from "../core/errors.js";
import { isDryRunEnabled } from "../core/runtime.js";
import { unwrap } from "../core/api-client.js";
import type { SolidtimeProjectMember } from "../core/types.js";

export function createProjectMemberCommand(): Command {
  const cmd = new Command("project-member").alias("pm").description("Manage project members");

  cmd
    .command("list")
    .description("List members of a project")
    .requiredOption("--project <id>", "Project ID")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      try {
        const config = loadConfig();
        const client = createClient(config);
        const org = requireActiveOrganization(config);

        const res = await client.get<unknown>(
          `organizations/${org}/projects/${opts.project}/project-members`,
        );
        const members = unwrap<SolidtimeProjectMember>(res);

        if (opts.json) {
          printJson(members);
          return;
        }

        const rows = members.map((m) => [
          m.member_id,
          m.billable_rate !== null ? String(m.billable_rate) : "-",
          m.id,
        ]);
        printTable(rows, ["Member", "Billable Rate", "ID"]);
      } catch (err) {
        exitWithError(err, Boolean(opts.json));
      }
    });

  cmd
    .command("add")
    .description("Add a member to a project")
    .requiredOption("--project <id>", "Project ID")
    .requiredOption("--member <id>", "Member ID")
    .option("--billable-rate <cents>", "Billable rate in cents")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      try {
        const config = loadConfig();
        const client = createClient(config);
        const org = requireActiveOrganization(config);

        const body: Record<string, unknown> = { member_id: opts.member };
        if (opts.billableRate) body.billable_rate = parseInt(opts.billableRate, 10);

        if (isDryRunEnabled()) {
          printJson({ dryRun: true, action: "project-member.add", body });
          return;
        }

        const res = await client.post<{ data: SolidtimeProjectMember }>(
          `organizations/${org}/projects/${opts.project}/project-members`,
          body,
        );

        if (opts.json) {
          printJson(res.data);
          return;
        }

        console.log(`Added member ${opts.member} to project (${res.data.id})`);
      } catch (err) {
        exitWithError(err, Boolean(opts.json));
      }
    });

  cmd
    .command("update")
    .description("Update a project member")
    .argument("<id>", "Project member ID")
    .option("--billable-rate <cents>", "Billable rate in cents")
    .option("--json", "Output raw JSON")
    .action(async (id, opts) => {
      try {
        const config = loadConfig();
        const client = createClient(config);
        const org = requireActiveOrganization(config);

        const body: Record<string, unknown> = {};
        if (opts.billableRate) body.billable_rate = parseInt(opts.billableRate, 10);

        if (isDryRunEnabled()) {
          printJson({ dryRun: true, action: "project-member.update", id, body });
          return;
        }

        const res = await client.put<{ data: SolidtimeProjectMember }>(
          `organizations/${org}/project-members/${id}`,
          body,
        );

        if (opts.json) {
          printJson(res.data);
          return;
        }

        console.log(`Updated project member: ${id}`);
      } catch (err) {
        exitWithError(err, Boolean(opts.json));
      }
    });

  cmd
    .command("remove")
    .description("Remove a member from a project")
    .argument("<id>", "Project member ID")
    .option("--json", "Output raw JSON")
    .action(async (id, opts) => {
      try {
        const config = loadConfig();
        const client = createClient(config);
        const org = requireActiveOrganization(config);

        if (isDryRunEnabled()) {
          printJson({ dryRun: true, action: "project-member.remove", id });
          return;
        }

        await client.delete(`organizations/${org}/project-members/${id}`);

        if (opts.json) {
          printJson({ success: true, action: "remove", id });
          return;
        }

        console.log(`Removed project member: ${id}`);
      } catch (err) {
        exitWithError(err, Boolean(opts.json));
      }
    });

  return cmd;
}
