import { Command } from "commander";
import { createClient, loadConfig, requireActiveOrganization } from "../core/config-store.js";
import { printInfo, printJson, printTable } from "../core/output.js";
import { exitWithError } from "../core/errors.js";
import { isDryRunEnabled } from "../core/runtime.js";
import { unwrap } from "../core/api-client.js";
import type { SolidtimeProject } from "../core/types.js";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export function createProjectCommand(): Command {
  const cmd = new Command("project").description("Manage projects");

  cmd
    .command("list")
    .description("List all projects")
    .option("--json", "Output raw JSON")
    .option("--archived", "Include archived projects")
    .action(async (opts) => {
      try {
        const config = loadConfig();
        const client = createClient(config);
        const org = requireActiveOrganization(config);

        const params: string[] = [];
        if (opts.archived) params.push("filter[archived]=true");

        const path =
          `organizations/${org}/projects` +
          (params.length > 0 ? `?${params.join("&")}` : "");

        const res = await client.get<unknown>(path);
        const projects = unwrap<SolidtimeProject>(res);

        if (opts.json) {
          printJson(projects);
          return;
        }

        const rows = projects.map((p) => [
          p.name,
          p.color,
          formatDuration(p.spent_time),
          p.is_billable ? "billable" : "",
          p.is_archived ? "archived" : "",
        ]);
        printTable(rows, ["Name", "Color", "Tracked", "Billable", "Status"]);
      } catch (err) {
        exitWithError(err, Boolean(opts.json));
      }
    });

  cmd
    .command("create")
    .description("Create a new project")
    .requiredOption("--name <name>", "Project name")
    .option("--color <color>", "Hex color", "#7e57c2")
    .option("--billable", "Mark as billable")
    .option("--client <id>", "Client ID")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      try {
        const config = loadConfig();
        const client = createClient(config);
        const org = requireActiveOrganization(config);

        const body = {
          name: opts.name,
          color: opts.color,
          is_billable: opts.billable ?? false,
          client_id: opts.client ?? null,
        };

        if (isDryRunEnabled()) {
          printJson({ dryRun: true, action: "project.create", body });
          return;
        }

        const res = await client.post<{ data: SolidtimeProject }>(
          `organizations/${org}/projects`,
          body,
        );

        if (opts.json) {
          printJson(res.data);
          return;
        }

        console.log(`Created project: ${res.data.name} (${res.data.id})`);
      } catch (err) {
        exitWithError(err, Boolean(opts.json));
      }
    });

  cmd
    .command("update")
    .description("Update a project")
    .argument("<id>", "Project ID")
    .option("--name <name>", "New name")
    .option("--color <color>", "New color")
    .option("--billable", "Mark as billable")
    .option("--no-billable", "Mark as not billable")
    .option("--json", "Output raw JSON")
    .action(async (id, opts) => {
      try {
        const config = loadConfig();
        const client = createClient(config);
        const org = requireActiveOrganization(config);

        const body: Record<string, unknown> = { client_id: null };
        if (opts.name) body.name = opts.name;
        if (opts.color) body.color = opts.color;
        if (opts.billable !== undefined) body.is_billable = opts.billable;

        if (isDryRunEnabled()) {
          printJson({ dryRun: true, action: "project.update", id, body });
          return;
        }

        const res = await client.put<{ data: SolidtimeProject }>(
          `organizations/${org}/projects/${id}`,
          body,
        );

        if (opts.json) {
          printJson(res.data);
          return;
        }

        console.log(`Updated project: ${res.data.name}`);
      } catch (err) {
        exitWithError(err, Boolean(opts.json));
      }
    });

  cmd
    .command("show")
    .description("Show a single project")
    .argument("<id>", "Project ID")
    .option("--json", "Output raw JSON")
    .action(async (id, opts) => {
      try {
        const config = loadConfig();
        const client = createClient(config);
        const org = requireActiveOrganization(config);

        const res = await client.get<{ data: SolidtimeProject }>(
          `organizations/${org}/projects/${id}`,
        );
        const project = res.data;

        if (opts.json) {
          printJson(project);
          return;
        }

        printInfo(`Name:      ${project.name}`);
        printInfo(`ID:        ${project.id}`);
        printInfo(`Color:     ${project.color}`);
        printInfo(`Billable:  ${project.is_billable ? "yes" : "no"}`);
        printInfo(`Archived:  ${project.is_archived ? "yes" : "no"}`);
        printInfo(`Public:    ${project.is_public ? "yes" : "no"}`);
        printInfo(`Tracked:   ${formatDuration(project.spent_time)}`);
        if (project.client_id) printInfo(`Client:    ${project.client_id}`);
      } catch (err) {
        exitWithError(err, Boolean(opts.json));
      }
    });

  cmd
    .command("delete")
    .description("Delete a project")
    .argument("<id>", "Project ID")
    .option("--json", "Output raw JSON")
    .action(async (id, opts) => {
      try {
        const config = loadConfig();
        const client = createClient(config);
        const org = requireActiveOrganization(config);

        if (isDryRunEnabled()) {
          printJson({ dryRun: true, action: "project.delete", id });
          return;
        }

        await client.delete(`organizations/${org}/projects/${id}`);

        if (opts.json) {
          printJson({ success: true, action: "delete", id });
          return;
        }

        console.log(`Deleted project: ${id}`);
      } catch (err) {
        exitWithError(err, Boolean(opts.json));
      }
    });

  return cmd;
}
