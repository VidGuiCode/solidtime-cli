import { Command } from "commander";
import { createClient, loadConfig, requireActiveOrganization } from "../core/config-store.js";
import { printJson } from "../core/output.js";
import { exitWithError } from "../core/errors.js";
import { unwrap } from "../core/api-client.js";
export function createDiscoverCommand() {
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
                .get("users/me")
                .then((r) => r.data)
                .catch(() => null);
            const memberships = await client
                .get("users/me/memberships")
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
        }
        catch (err) {
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
            const res = await client.get(`organizations/${org}/projects`);
            const projects = unwrap(res);
            printJson(projects.map((p) => ({
                id: p.id,
                name: p.name,
                color: p.color,
                is_archived: p.is_archived,
                is_billable: p.is_billable,
            })));
        }
        catch (err) {
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
            const res = await client.get(`organizations/${org}/tasks`);
            const tasks = unwrap(res);
            printJson(tasks.map((t) => ({
                id: t.id,
                name: t.name,
                project_id: t.project_id,
                is_done: t.is_done,
            })));
        }
        catch (err) {
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
            const res = await client.get(`organizations/${org}/tags`);
            const tags = unwrap(res);
            printJson(tags.map((t) => ({ id: t.id, name: t.name })));
        }
        catch (err) {
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
            const res = await client.get(`organizations/${org}/members`);
            const members = unwrap(res);
            printJson(members.map((m) => ({
                id: m.id,
                user_id: m.user_id,
                name: m.name,
                email: m.email,
                role: m.role,
            })));
        }
        catch (err) {
            exitWithError(err, true);
        }
    });
    return cmd;
}
//# sourceMappingURL=discover.js.map