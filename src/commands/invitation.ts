import { Command } from "commander";
import { createClient, loadConfig, requireActiveOrganization } from "../core/config-store.js";
import { printJson, printTable } from "../core/output.js";
import { exitWithError } from "../core/errors.js";
import { isDryRunEnabled } from "../core/runtime.js";
import { fetchAll } from "../core/api-client.js";
import type { SolidtimeInvitation } from "../core/types.js";

export function createInvitationCommand(): Command {
  const cmd = new Command("invitation")
    .alias("invite")
    .description("Manage organization invitations");

  cmd
    .command("list")
    .description("List pending invitations")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      try {
        const config = loadConfig();
        const client = createClient(config);
        const org = requireActiveOrganization(config);

        const invitations = await fetchAll<SolidtimeInvitation>(
          client,
          `organizations/${org}/invitations`,
        );

        if (opts.json) {
          printJson(invitations);
          return;
        }

        const rows = invitations.map((i) => [i.email, i.role, i.id]);
        printTable(rows, ["Email", "Role", "ID"]);
      } catch (err) {
        exitWithError(err, Boolean(opts.json));
      }
    });

  cmd
    .command("create")
    .description("Invite a user to the organization")
    .requiredOption("--email <email>", "Email address")
    .requiredOption("--role <role>", "Role (admin, manager, employee)")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      try {
        const config = loadConfig();
        const client = createClient(config);
        const org = requireActiveOrganization(config);

        const body = { email: opts.email, role: opts.role };

        if (isDryRunEnabled()) {
          printJson({ dryRun: true, action: "invitation.create", body });
          return;
        }

        await client.post(`organizations/${org}/invitations`, body);

        if (opts.json) {
          printJson({ success: true, action: "invitation.create", email: opts.email });
          return;
        }

        console.log(`Invited: ${opts.email} as ${opts.role}`);
      } catch (err) {
        exitWithError(err, Boolean(opts.json));
      }
    });

  cmd
    .command("resend")
    .description("Resend an invitation email")
    .argument("<id>", "Invitation ID")
    .option("--json", "Output raw JSON")
    .action(async (id, opts) => {
      try {
        const config = loadConfig();
        const client = createClient(config);
        const org = requireActiveOrganization(config);

        if (isDryRunEnabled()) {
          printJson({ dryRun: true, action: "invitation.resend", id });
          return;
        }

        await client.post(`organizations/${org}/invitations/${id}/resend`, {});

        if (opts.json) {
          printJson({ success: true, action: "resend", id });
          return;
        }

        console.log(`Resent invitation: ${id}`);
      } catch (err) {
        exitWithError(err, Boolean(opts.json));
      }
    });

  cmd
    .command("delete")
    .description("Delete a pending invitation")
    .argument("<id>", "Invitation ID")
    .option("--json", "Output raw JSON")
    .action(async (id, opts) => {
      try {
        const config = loadConfig();
        const client = createClient(config);
        const org = requireActiveOrganization(config);

        if (isDryRunEnabled()) {
          printJson({ dryRun: true, action: "invitation.delete", id });
          return;
        }

        await client.delete(`organizations/${org}/invitations/${id}`);

        if (opts.json) {
          printJson({ success: true, action: "delete", id });
          return;
        }

        console.log(`Deleted invitation: ${id}`);
      } catch (err) {
        exitWithError(err, Boolean(opts.json));
      }
    });

  return cmd;
}
