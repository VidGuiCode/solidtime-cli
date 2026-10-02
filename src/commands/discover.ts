import { Command } from "commander";
import { createClient, loadConfig, requireActiveOrganization } from "../core/config-store.js";
import { printJson } from "../core/output.js";
import { exitWithError } from "../core/errors.js";
import { fetchAll } from "../core/api-client.js";
import type {
  SolidtimeUser,
  SolidtimeMembership,
  SolidtimeProject,
  SolidtimeTask,
  SolidtimeTag,
  SolidtimeMember,
  SolidtimeClient,
} from "../core/types.js";

export function createDiscoverCommand(): Command {
  const cmd = new Command("discover")
    .description("AI-first discovery commands for context and selectors")
    .action(() => cmd.help());

  cmd
    .command("context")
    .description("Show full context: account, organization, user")
    .action(async () => {
      try {
        const config = loadConfig();
        const client = createClient(config);

        const user = await client
          .get<{ data: SolidtimeUser }>("users/me")
          .then((r) => r.data)
          .catch(() => null);

        const memberships = await client
          .get<{ data: SolidtimeMembership[] }>("users/me/memberships")
          .then((r) => r.data)
          .catch(() => []);

        const activeOrg = config.context.activeOrganization;
        const orgMatch = memberships.find((m) => m.organization.id === activeOrg);

        printJson({
          schemaVersion: 1,
          kind: "context",
          account: config.context.activeProfile ?? null,
          organization: orgMatch
            ? {
                id: orgMatch.organization.id,
                name: orgMatch.organization.name,
                currency: orgMatch.organization.currency,
                role: orgMatch.role,
              }
            : null,
          organizations: memberships.map((m) => ({
            id: m.organization.id,
            name: m.organization.name,
            role: m.role,
          })),
          user: user
            ? {
                id: user.id,
                name: user.name,
                email: user.email,
                timezone: user.timezone,
              }
            : null,
        });
      } catch (err) {
        exitWithError(err, true);
      }
    });

  cmd
    .command("projects")
    .description("List projects as selectors")
    .action(async () => {
      try {
        const config = loadConfig();
        const client = createClient(config);
        const org = requireActiveOrganization(config);

        const projects = await fetchAll<SolidtimeProject>(client, `organizations/${org}/projects`);

        printJson(
          projects.map((p) => ({
            id: p.id,
            name: p.name,
            color: p.color,
            is_archived: p.is_archived,
            is_billable: p.is_billable,
          })),
        );
      } catch (err) {
        exitWithError(err, true);
      }
    });

  cmd
    .command("tasks")
    .description("List tasks as selectors")
    .action(async () => {
      try {
        const config = loadConfig();
        const client = createClient(config);
        const org = requireActiveOrganization(config);

        const tasks = await fetchAll<SolidtimeTask>(client, `organizations/${org}/tasks`);

        printJson(
          tasks.map((t) => ({
            id: t.id,
            name: t.name,
            project_id: t.project_id,
            is_done: t.is_done,
          })),
        );
      } catch (err) {
        exitWithError(err, true);
      }
    });

  cmd
    .command("tags")
    .description("List tags as selectors")
    .action(async () => {
      try {
        const config = loadConfig();
        const client = createClient(config);
        const org = requireActiveOrganization(config);

        const tags = await fetchAll<SolidtimeTag>(client, `organizations/${org}/tags`);

        printJson(tags.map((t) => ({ id: t.id, name: t.name })));
      } catch (err) {
        exitWithError(err, true);
      }
    });

  cmd
    .command("members")
    .description("List members as selectors")
    .action(async () => {
      try {
        const config = loadConfig();
        const client = createClient(config);
        const org = requireActiveOrganization(config);

        const members = await fetchAll<SolidtimeMember>(client, `organizations/${org}/members`);

        printJson(
          members.map((m) => ({
            id: m.id,
            user_id: m.user_id,
            name: m.name,
            email: m.email,
            role: m.role,
          })),
        );
      } catch (err) {
        exitWithError(err, true);
      }
    });

  cmd
    .command("clients")
    .description("List clients as selectors")
    .action(async () => {
      try {
        const config = loadConfig();
        const client = createClient(config);
        const org = requireActiveOrganization(config);

        const clients = await fetchAll<SolidtimeClient>(client, `organizations/${org}/clients`);

        printJson(
          clients.map((c) => ({
            id: c.id,
            name: c.name,
            is_archived: c.is_archived,
          })),
        );
      } catch (err) {
        exitWithError(err, true);
      }
    });

  cmd
    .command("all")
    .description("Full context dump: account, org, user, and all resources")
    .action(async () => {
      try {
        const config = loadConfig();
        const client = createClient(config);
        const org = requireActiveOrganization(config);

        const [user, memberships, projects, tasks, tags, members, clients] = await Promise.all([
          client
            .get<{ data: SolidtimeUser }>("users/me")
            .then((r) => r.data)
            .catch(() => null),
          client
            .get<{ data: SolidtimeMembership[] }>("users/me/memberships")
            .then((r) => r.data)
            .catch(() => []),
          fetchAll<SolidtimeProject>(client, `organizations/${org}/projects`),
          fetchAll<SolidtimeTask>(client, `organizations/${org}/tasks`),
          fetchAll<SolidtimeTag>(client, `organizations/${org}/tags`),
          fetchAll<SolidtimeMember>(client, `organizations/${org}/members`),
          fetchAll<SolidtimeClient>(client, `organizations/${org}/clients`),
        ]);

        const activeOrg = config.context.activeOrganization;
        const orgMatch = memberships.find((m) => m.organization.id === activeOrg);

        printJson({
          schemaVersion: 1,
          kind: "full-context",
          account: config.context.activeProfile ?? null,
          organization: orgMatch
            ? {
                id: orgMatch.organization.id,
                name: orgMatch.organization.name,
                currency: orgMatch.organization.currency,
                role: orgMatch.role,
              }
            : null,
          organizations: memberships.map((m) => ({
            id: m.organization.id,
            name: m.organization.name,
            role: m.role,
          })),
          user: user
            ? { id: user.id, name: user.name, email: user.email, timezone: user.timezone }
            : null,
          projects: projects.map((p) => ({
            id: p.id,
            name: p.name,
            color: p.color,
            is_archived: p.is_archived,
            is_billable: p.is_billable,
          })),
          tasks: tasks.map((t) => ({
            id: t.id,
            name: t.name,
            project_id: t.project_id,
            is_done: t.is_done,
          })),
          tags: tags.map((t) => ({ id: t.id, name: t.name })),
          members: members.map((m) => ({
            id: m.id,
            user_id: m.user_id,
            name: m.name,
            email: m.email,
            role: m.role,
          })),
          clients: clients.map((c) => ({
            id: c.id,
            name: c.name,
            is_archived: c.is_archived,
          })),
        });
      } catch (err) {
        exitWithError(err, true);
      }
    });

  return cmd;
}
