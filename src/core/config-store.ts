import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import type { SolidtimeConfig, SolidtimeAccount } from "./types.js";
import { SolidtimeApiClient } from "./api-client.js";
import { printError } from "./output.js";

export const DEFAULT_CONFIG: SolidtimeConfig = {
  profiles: [],
  context: {},
};

export function getConfigDir(): string {
  return path.join(os.homedir(), ".solidtime-cli");
}

export function getConfigPath(): string {
  if (process.env.SOLIDTIME_CONFIG) {
    return process.env.SOLIDTIME_CONFIG;
  }
  return path.join(getConfigDir(), "config.json");
}

export function loadConfig(): SolidtimeConfig {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return { profiles: [], context: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf-8")) as SolidtimeConfig;
  } catch {
    return { profiles: [], context: {} };
  }
}

export function saveConfig(config: SolidtimeConfig): void {
  const dir = getConfigDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), "utf-8");
}

export function getActiveAccount(config: SolidtimeConfig): SolidtimeAccount | undefined {
  return config.profiles.find((p) => p.name === config.context.activeProfile);
}

export function requireActiveAccount(config: SolidtimeConfig): SolidtimeAccount {
  const account = getActiveAccount(config);
  if (!account) {
    printError("No active account. Run: solidtime login");
    process.exit(1);
  }
  return account;
}

export function requireActiveOrganization(config: SolidtimeConfig): string {
  const org = process.env.SOLIDTIME_ORGANIZATION ?? config.context.activeOrganization;
  if (!org) {
    printError("No active organization. Run: solidtime organization use <name>");
    process.exit(1);
  }
  return org;
}

export function createClient(config: SolidtimeConfig): SolidtimeApiClient {
  const envUrl = process.env.SOLIDTIME_BASE_URL;
  const envToken = process.env.SOLIDTIME_API_TOKEN;

  if (envUrl && envToken) {
    return new SolidtimeApiClient({
      baseUrl: envUrl,
      token: envToken,
    });
  }

  const account = requireActiveAccount(config);
  return new SolidtimeApiClient({
    baseUrl: envUrl ?? account.baseUrl,
    token: envToken ?? account.token,
  });
}
