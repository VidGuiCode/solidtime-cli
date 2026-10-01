import { Command } from "commander";
import { loadConfig, saveConfig } from "../core/config-store.js";
import { SolidtimeApiClient } from "../core/api-client.js";
import { printJson } from "../core/output.js";
import { ask, pickOne } from "../core/prompt.js";
import { exitWithError, ValidationError } from "../core/errors.js";
import { isDryRunEnabled } from "../core/runtime.js";
import type { SolidtimeAccount, SolidtimeUser, SolidtimeMembership } from "../core/types.js";

const BASE_URL_PROMPT =
  "Solidtime base URL (e.g. https://solidtime.example.com or https://app.solidtime.io)";

export function createLoginCommand(): Command {
  return new Command("login")
    .description("Connect to a Solidtime instance and save credentials")
    .option("--url <url>", "Solidtime base URL (non-interactive)")
    .option("--token <token>", "API token (non-interactive)")
    .option("--json", "Output raw JSON")
    .action(async (opts: { url?: string; token?: string; json?: boolean }) => {
      try {
        const config = loadConfig();

        let baseUrl: string;
        let token: string;

        if (opts.url || opts.token) {
          if (!opts.url || !opts.token) {
            throw new ValidationError("Provide both --url and --token for non-interactive login.");
          }
          baseUrl = opts.url;
          token = opts.token;
        } else if (config.profiles.length > 0) {
          const ref = config.profiles[0];
          const sameInstance = await ask(`Same Solidtime instance as "${ref.baseUrl}"? (y/n)`, "y");

          if (sameInstance.toLowerCase() !== "n") {
            baseUrl = ref.baseUrl;
            const sameCredentials = await ask(
              `Same credentials as account "${ref.name}"? (y/n)`,
              "y",
            );
            if (sameCredentials.toLowerCase() !== "n") {
              token = ref.token;
            } else {
              token = await ask("API token");
            }
          } else {
            baseUrl = await ask(BASE_URL_PROMPT);
            token = await ask("API token");
          }
        } else {
          baseUrl = await ask(BASE_URL_PROMPT);
          token = await ask("API token");
        }

        if (!baseUrl) throw new ValidationError("Base URL is required.");
        if (!token) throw new ValidationError("Token is required.");

        const tempClient = new SolidtimeApiClient({ baseUrl, token });

        console.log("Connecting to Solidtime...");

        let user: SolidtimeUser;
        try {
          user = await tempClient.get<{ data: SolidtimeUser }>("users/me").then((r) => r.data);
        } catch {
          throw new ValidationError("Failed to connect. Check your base URL and token.");
        }

        console.log(`Authenticated as: ${user.name} (${user.email})`);

        // Fetch organizations
        const membershipsRes = await tempClient.get<{ data: SolidtimeMembership[] }>(
          "users/me/memberships",
        );
        const memberships = membershipsRes.data;

        let organizationId: string;
        let organizationName: string;
        let memberId: string;

        if (memberships.length === 1) {
          organizationId = memberships[0].organization.id;
          organizationName = memberships[0].organization.name;
          memberId = memberships[0].id;
          console.log(`Found organization: ${organizationName}`);
        } else if (memberships.length > 1) {
          if (opts.url && opts.token) {
            organizationId = memberships[0].organization.id;
            organizationName = memberships[0].organization.name;
            memberId = memberships[0].id;
            console.log(`Using organization: ${organizationName}`);
          } else {
            console.log("Multiple organizations found:");
            const idx = await pickOne(
              "Select organization",
              memberships.map((m) => `${m.organization.name} (${m.role})`),
            );
            organizationId = memberships[idx].organization.id;
            organizationName = memberships[idx].organization.name;
            memberId = memberships[idx].id;
          }
        } else {
          throw new ValidationError("No organizations found for this account.");
        }

        let accountName = organizationName.toLowerCase().replace(/\s+/g, "-");
        if (config.profiles.some((p) => p.name === accountName)) {
          accountName = await ask("Account name", accountName);
        }

        const account: SolidtimeAccount = {
          name: accountName,
          baseUrl,
          token,
          defaultOrganization: organizationId,
          memberId,
        };

        const existing = config.profiles.findIndex((p) => p.name === accountName);
        if (existing >= 0) {
          config.profiles[existing] = account;
        } else {
          config.profiles.push(account);
        }

        config.context.activeProfile = accountName;
        config.context.activeOrganization = organizationId;

        const result = {
          success: true,
          action: "login",
          account: {
            name: accountName,
            baseUrl,
            defaultOrganization: organizationId,
            organizationName,
          },
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
          },
        };

        if (isDryRunEnabled()) {
          printJson({ dryRun: true, ...result });
          return;
        }

        saveConfig(config);

        if (opts.json) {
          printJson(result);
          return;
        }

        console.log(`\nAccount "${accountName}" saved.`);
        console.log(`Active organization: ${organizationName}`);
      } catch (err) {
        exitWithError(err, Boolean(opts.json));
      }
    });
}
