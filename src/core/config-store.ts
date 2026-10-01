import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import type { SolidtimeConfig, SolidtimeAccount, SolidtimeMembership } from "./types.js";
import { SolidtimeApiClient } from "./api-client.js";
import { printError } from "./output.js";
import { ValidationError } from "./errors.js";

export const DEFAULT_CONFIG: SolidtimeConfig = {
  profiles: [],
  context: {},
};

const CONFIG_DIR_MODE = 0o700;
const CONFIG_FILE_MODE = 0o600;

export function getConfigDir(): string {
  return path.join(os.homedir(), ".solidtime-cli");
}

export function getConfigPath(): string {
  if (process.env.SOLIDTIME_CONFIG) {
    return process.env.SOLIDTIME_CONFIG;
  }
  return path.join(getConfigDir(), "config.json");
}

function describeConfigError(err: unknown, configPath: string, action: "read" | "write"): Error {
  const code = err instanceof Error ? (err as NodeJS.ErrnoException).code : undefined;
  if (code === "EACCES" || code === "EPERM") {
    return new Error(
      `Cannot ${action} config file (permission denied): ${configPath}. ` +
        `Fix the file permissions or set SOLIDTIME_CONFIG to a ${action === "read" ? "readable" : "writable"} path.`,
    );
  }
  return err instanceof Error ? err : new Error(String(err));
}

export function loadConfig(): SolidtimeConfig {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return { profiles: [], context: {} };
  }
  let raw: string;
  try {
    raw = fs.readFileSync(configPath, "utf-8");
  } catch (err) {
    throw describeConfigError(err, configPath, "read");
  }
  try {
    return JSON.parse(raw) as SolidtimeConfig;
  } catch {
    // Never fall back to an empty config: the next saveConfig() would wipe
    // every saved account.
    throw new ValidationError(
      `Config file is not valid JSON: ${configPath}. Fix or delete the file, then run: solidtime login`,
    );
  }
}

export function saveConfig(config: SolidtimeConfig): void {
  const configPath = getConfigPath();
  const dir = path.dirname(configPath);
  const defaultConfigDir = path.resolve(getConfigDir());
  const shouldRestrictDir = path.resolve(dir) === defaultConfigDir;

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: CONFIG_DIR_MODE });
  }

  if (shouldRestrictDir) {
    restrictPermissions(dir, CONFIG_DIR_MODE);
  }

  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), {
      encoding: "utf-8",
      mode: CONFIG_FILE_MODE,
    });
  } catch (err) {
    throw describeConfigError(err, configPath, "write");
  }
  restrictPermissions(configPath, CONFIG_FILE_MODE);
}

function restrictPermissions(targetPath: string, mode: number): void {
  try {
    fs.chmodSync(targetPath, mode);
  } catch {
    // Some platforms/filesystems do not support POSIX-style permissions.
  }
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

export function requireActiveMemberId(config: SolidtimeConfig): string {
  const envMember = process.env.SOLIDTIME_MEMBER_ID;
  if (envMember) return envMember;

  const account = getActiveAccount(config);
  if (account?.memberId) return account.memberId;

  printError("No member ID found. Run: solidtime login");
  process.exit(1);
}

export async function resolveAndPersistMemberId(
  client: SolidtimeApiClient,
  config: SolidtimeConfig,
  orgId: string,
): Promise<string> {
  const account = getActiveAccount(config);
  if (account?.memberId) return account.memberId;

  const res = await client.get<{ data: SolidtimeMembership[] }>("users/me/memberships");
  const match = res.data.find((m) => m.organization.id === orgId);
  if (!match) {
    printError("Could not resolve member ID for active organization. Run: solidtime login");
    process.exit(1);
  }

  if (account) {
    account.memberId = match.id;
    saveConfig(config);
  }

  return match.id;
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
