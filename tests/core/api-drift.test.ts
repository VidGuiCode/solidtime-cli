import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT_PATH = path.join(ROOT, "scripts", "api-drift.mjs");
const SNAPSHOT_PATH = path.join(ROOT, "docs", "api-snapshot.json");

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("api-drift script", () => {
  it("exits 0 when compared snapshot matches docs/api-snapshot.json", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "solidtime-drift-"));
    tempDirs.push(dir);
    const copyPath = path.join(dir, "snapshot.json");
    fs.copyFileSync(SNAPSHOT_PATH, copyPath);

    const res = spawnSync(
      process.execPath,
      [SCRIPT_PATH, "--compare", copyPath, "--snapshot", SNAPSHOT_PATH],
      { encoding: "utf8" },
    );
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain("No API drift detected");
  });

  it("exits 1 with a readable diff when routes or request fields drift", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "solidtime-drift-"));
    tempDirs.push(dir);
    const mutatedPath = path.join(dir, "snapshot.json");
    const data = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf-8")) as {
      upstream: string;
      branch: string;
      routes: string[];
      requests: Record<string, string[]>;
    };

    data.routes.push("POST /organizations/{organization}/imaginary-endpoint");
    const reqFile = "TimeEntry/TimeEntryUpdateRequest.php";
    const originalFields = data.requests[reqFile];
    expect(originalFields.length).toBeGreaterThan(0);
    const removedField = originalFields[0];
    data.requests[reqFile] = [...originalFields.slice(1), "unexpected_new_field"];

    fs.writeFileSync(mutatedPath, JSON.stringify(data, null, 2), "utf-8");

    const res = spawnSync(
      process.execPath,
      [SCRIPT_PATH, "--compare", mutatedPath, "--snapshot", SNAPSHOT_PATH],
      { encoding: "utf8" },
    );
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("+ route: POST /organizations/{organization}/imaginary-endpoint");
    expect(res.stderr).toContain(`- request ${reqFile}: ${removedField}`);
    expect(res.stderr).toContain(`+ request ${reqFile}: unexpected_new_field`);
  });
});
