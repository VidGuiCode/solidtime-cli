import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { SolidtimeConfig } from "../../src/core/types.js";

const originalHomedir = os.homedir;

function setupTempConfigDir(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "solidtime-cli-test-"));
  (os as { homedir(): string }).homedir = () => tempDir;
  return tempDir;
}

function restoreHomedir(): void {
  (os as { homedir(): string }).homedir = originalHomedir;
}

async function importConfigStore() {
  return await import("../../src/core/config-store.js");
}

describe("config-store", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    restoreHomedir();
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("returns default config when no config file exists", async () => {
    tempDir = setupTempConfigDir();
    const { loadConfig } = await importConfigStore();

    expect(loadConfig()).toEqual({ profiles: [], context: {} });
  });

  it("throws and leaves the file unchanged when the config file is corrupt", async () => {
    tempDir = setupTempConfigDir();
    const { loadConfig, getConfigPath } = await importConfigStore();
    fs.mkdirSync(path.dirname(getConfigPath()), { recursive: true });
    fs.writeFileSync(getConfigPath(), "{not json", "utf-8");

    expect(() => loadConfig()).toThrow(/not valid JSON/);
    expect(fs.readFileSync(getConfigPath(), "utf-8")).toBe("{not json");
  });

  it("saves and loads config JSON", async () => {
    tempDir = setupTempConfigDir();
    const { saveConfig, loadConfig } = await importConfigStore();
    const config: SolidtimeConfig = {
      profiles: [
        {
          name: "test",
          baseUrl: "https://solidtime.example.com",
          token: "secret-token",
        },
      ],
      context: {
        activeProfile: "test",
        activeOrganization: "org-123",
      },
    };

    saveConfig(config);

    expect(loadConfig()).toEqual(config);
  });

  it("restricts default config directory and file permissions on POSIX", async () => {
    if (process.platform === "win32") {
      return;
    }

    tempDir = setupTempConfigDir();
    const { saveConfig, getConfigDir, getConfigPath } = await importConfigStore();

    saveConfig({ profiles: [], context: {} });

    expect(fs.statSync(getConfigDir()).mode & 0o777).toBe(0o700);
    expect(fs.statSync(getConfigPath()).mode & 0o777).toBe(0o600);
  });

  it("throws a clear error when the config file cannot be written", async () => {
    tempDir = setupTempConfigDir();
    const { saveConfig, getConfigPath } = await importConfigStore();

    saveConfig({ profiles: [], context: {} });
    fs.chmodSync(getConfigPath(), 0o444);

    try {
      const config: SolidtimeConfig = {
        profiles: [{ name: "x", baseUrl: "https://x.example.com", token: "t" }],
        context: {},
      };
      expect(() => saveConfig(config)).toThrow(/Cannot write config file/);
    } finally {
      fs.chmodSync(getConfigPath(), 0o644);
    }
  });
});
