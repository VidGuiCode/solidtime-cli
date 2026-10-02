import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Smoke suite against a REAL Solidtime server.
 *
 * The 0.1.2 bug class (unencoded URLs, retry behaviour, pagination, config
 * handling) is invisible to mocked unit tests and only partially covered by
 * the local end-to-end suite; this file runs the same command families
 * against a live server.
 *
 * Configuration (via environment variables only — the saved config file is
 * never touched):
 *   SOLIDTIME_SMOKE_BASE_URL      e.g. https://solidtime.example.com
 *   SOLIDTIME_SMOKE_TOKEN         API token for the smoke account
 *   SOLIDTIME_SMOKE_ORGANIZATION  organization ID (optional; defaults to the
 *                                 first membership)
 *   SOLIDTIME_SMOKE_ALLOW_WRITE   "1" enables the write scenarios. They create
 *                                 entries/tags with a `smoke-` prefix and
 *                                 delete them afterwards. Never enable this
 *                                 against an account whose data you cannot
 *                                 afford to touch.
 *
 * Without SOLIDTIME_SMOKE_BASE_URL the whole file is skipped, so plain
 * `npm test` stays offline.
 */

const CLI_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "dist",
  "cli.js",
);

const BASE_URL = process.env.SOLIDTIME_SMOKE_BASE_URL;
const TOKEN = process.env.SOLIDTIME_SMOKE_TOKEN;
const ALLOW_WRITE = process.env.SOLIDTIME_SMOKE_ALLOW_WRITE === "1";
const SMOKE_ENABLED = Boolean(BASE_URL && TOKEN);

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

let workDir = "";
let tracksDir = "";
let smokeEnv: Record<string, string> = {};

function run(args: string[], extraEnv: Record<string, string> = {}): RunResult {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    SOLIDTIME_CONFIG: path.join(workDir, "config.json"),
    SOLIDTIME_TRACK_DIR: tracksDir,
    SOLIDTIME_BASE_URL: BASE_URL ?? "",
    SOLIDTIME_API_TOKEN: TOKEN ?? "",
  };
  for (const key of ["SOLIDTIME_ORGANIZATION", "SOLIDTIME_MEMBER_ID"]) delete env[key];
  Object.assign(env, smokeEnv, extraEnv);
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
    encoding: "utf8",
    env,
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function json<T>(result: RunResult): T {
  expect(result.status, `command failed: ${result.stderr}`).toBe(0);
  return JSON.parse(result.stdout) as T;
}

const prefix = `smoke-${Date.now().toString(36)}-`;
const createdEntryIds: string[] = [];
const createdTagIds: string[] = [];
let startedTrackId: string | null = null;

beforeAll(() => {
  if (!SMOKE_ENABLED) return;
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "solidtime-smoke-"));
  tracksDir = path.join(workDir, "tracks");
  console.log(`smoke target: ${BASE_URL} (write scenarios ${ALLOW_WRITE ? "ON" : "off"})`);

  // Resolve organization and member id, so the rest of the suite can run in
  // pure environment mode (no saved config).
  const orgs = json<{ id: string; name: string }[]>(run(["organization", "list", "--json"]));
  expect(orgs.length, "smoke account has no organizations").toBeGreaterThan(0);
  const requested = process.env.SOLIDTIME_SMOKE_ORGANIZATION;
  if (requested && !orgs.some((o) => o.id === requested)) {
    throw new Error(
      `SOLIDTIME_SMOKE_ORGANIZATION ${requested} is not one of this account's organizations`,
    );
  }
  const orgId = requested ?? orgs[0].id;
  smokeEnv = { SOLIDTIME_ORGANIZATION: orgId };
  console.log(`smoke organization: ${orgs.find((o) => o.id === orgId)?.name ?? orgId}`);

  const profile = json<{ email: string }>(run(["profile", "--json"]));
  const members = json<{ id: string; email: string }[]>(run(["member", "list", "--json"]));
  const member = members.find((m) => m.email.toLowerCase() === profile.email.toLowerCase());
  if (member) {
    smokeEnv.SOLIDTIME_MEMBER_ID = member.id;
  } else {
    console.log(`smoke note: no member matches ${profile.email}; --mine scenario will fail`);
  }
});

afterAll(() => {
  if (!SMOKE_ENABLED) return;
  if (ALLOW_WRITE) {
    // Best-effort cleanup, also after failures.
    if (createdEntryIds.length > 0) {
      const result = run(["te", "bulk-delete", "--ids", ...createdEntryIds, "--json"]);
      console.log(
        `cleanup: deleted ${createdEntryIds.length} smoke entries (exit ${result.status}) ${result.stderr}`,
      );
    }
    for (const tagId of createdTagIds) {
      const result = run(["tag", "delete", tagId, "--json"]);
      console.log(`cleanup: deleted smoke tag ${tagId} (exit ${result.status})`);
    }
    if (startedTrackId) {
      const result = run(["track", "cancel", startedTrackId, "--json"]);
      console.log(`cleanup: cancelled track ${startedTrackId} (exit ${result.status})`);
    }
  }
  fs.rmSync(workDir, { recursive: true, force: true });
});

describe.skipIf(!SMOKE_ENABLED)("smoke: context family", () => {
  it("profile", () => {
    const out = json<{ name: string; email: string }>(run(["profile", "--json"]));
    expect(out.email).toContain("@");
  });

  it("where", () => {
    const out = json<{ context: { organization: string | null; user: { email: string } | null } }>(
      run(["where", "--json"]),
    );
    expect(out.context.organization).toBeTruthy();
    expect(out.context.user?.email).toContain("@");
  });

  it("organization list and show", () => {
    const orgs = json<{ id: string; name: string }[]>(run(["organization", "list", "--json"]));
    expect(orgs.length).toBeGreaterThan(0);
    const show = json<{ id: string; name: string }>(run(["organization", "show", "--json"]));
    expect(orgs.some((o) => o.id === show.id)).toBe(true);
  });

  it("discover context", () => {
    const result = run(["discover", "context"]);
    expect(result.status).toBe(0);
  });
});

describe.skipIf(!SMOKE_ENABLED)("smoke: resource family (read-only)", () => {
  it("lists every resource type", () => {
    for (const args of [
      ["project", "list", "--json"],
      ["task", "list", "--json"],
      ["tag", "list", "--json"],
      ["client", "list", "--json"],
      ["member", "list", "--json"],
      ["invitation", "list", "--json"],
    ]) {
      const result = run(args);
      expect(result.status, `${args.join(" ")}: ${result.stderr}`).toBe(0);
    }
  });

  it("project show by name", () => {
    const projects = json<{ name: string }[]>(run(["project", "list", "--json"]));
    if (projects.length === 0) return; // empty org: nothing to show
    const result = run(["project", "show", projects[0].name, "--json"]);
    expect(result.status, result.stderr).toBe(0);
  });

  it("discover all", () => {
    const result = run(["discover", "all"]);
    expect(result.status).toBe(0);
  });
});

describe.skipIf(!SMOKE_ENABLED)("smoke: time-entry family (read-only)", () => {
  it("te list with filters and pagination", () => {
    for (const args of [
      ["te", "list", "--limit", "5", "--json"],
      ["te", "list", "--limit", "2", "--offset", "2", "--json"],
      ["te", "list", "--start", "2026-01-01T00:00:00Z", "--limit", "5", "--json"],
      ["te", "list", "--mine", "--limit", "5", "--json"],
    ]) {
      const result = run(args);
      expect(result.status, `${args.join(" ")}: ${result.stderr}`).toBe(0);
    }
  });

  it("te active", () => {
    const result = run(["te", "active", "--json"]);
    expect(result.status).toBe(0);
  });

  it("report and te aggregate", () => {
    for (const args of [
      ["report", "--start", "2026-01-01T00:00:00Z", "--end", "2026-12-31T23:59:59Z", "--json"],
      ["te", "aggregate", "--group", "project", "--json"],
      ["te", "aggregate", "--group", "tag", "--start", "2026-01-01T00:00:00Z", "--json"],
    ]) {
      const result = run(args);
      expect(result.status, `${args.join(" ")}: ${result.stderr}`).toBe(0);
    }
  });
});

describe.skipIf(!SMOKE_ENABLED || !ALLOW_WRITE)("smoke: write round-trips", () => {
  it("tag create / te create with it / te update / te delete / tag delete", () => {
    const tagName = `${prefix}tag`;
    const tag = json<{ id: string }>(run(["tag", "create", "--name", tagName, "--json"]));
    createdTagIds.push(tag.id);

    const start = new Date(Date.now() - 3600 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
    const end = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    const entry = json<{ id: string; tags: string[] }>(
      run([
        "te",
        "create",
        "--description",
        `${prefix}entry`,
        "--start",
        start,
        "--end",
        end,
        "--tags",
        tagName,
        "--create-missing-tags",
        "--json",
      ]),
    );
    createdEntryIds.push(entry.id);
    expect(entry.tags).toContain(tagName);

    const updated = json<{ description: string }>(
      run(["te", "update", entry.id, "--description", `${prefix}updated`, "--json"]),
    );
    expect(updated.description).toBe(`${prefix}updated`);

    const deleted = run(["te", "delete", entry.id, "--json"]);
    expect(deleted.status, deleted.stderr).toBe(0);
    createdEntryIds.pop();
  });

  it("track start / stop posts a real entry that gets cleaned up", () => {
    const started = json<{ id: string; start: string }>(
      run(["track", "start", "--description", `${prefix}track`, "--label", prefix, "--json"]),
    );
    startedTrackId = started.id;
    const stopped = json<{ description: string; id: string }>(
      run(["track", "stop", started.id, "--json"]),
    );
    createdEntryIds.push(stopped.id);
    startedTrackId = null;
    expect(stopped.description).toBe(`${prefix}track`);
  });
});

describe.skipIf(!SMOKE_ENABLED || !ALLOW_WRITE)("smoke: track overlap verdict", () => {
  it("reports whether overlapping entries are accepted on this server", () => {
    const org = json<{ prevent_overlapping_time_entries: boolean }>(
      run(["organization", "show", "--json"]),
    );
    console.log(
      `overlap verdict context: prevent_overlapping_time_entries = ${org.prevent_overlapping_time_entries}`,
    );

    const start = (minutesAgo: number): string =>
      new Date(Date.now() - minutesAgo * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");

    // Check A: two overlapping finished entries.
    const a1 = json<{ id: string }>(
      run([
        "te",
        "create",
        "--description",
        `${prefix}overlap-1`,
        "--start",
        start(60),
        "--end",
        start(30),
        "--json",
      ]),
    );
    createdEntryIds.push(a1.id);
    const a2 = run([
      "te",
      "create",
      "--description",
      `${prefix}overlap-2`,
      "--start",
      start(45),
      "--end",
      start(15),
      "--json",
    ]);
    const a2Accepted = a2.status === 0;
    if (a2Accepted) createdEntryIds.push((JSON.parse(a2.stdout) as { id: string }).id);
    console.log(
      `check A (two overlapping finished entries): ${a2Accepted ? "ACCEPTED" : `REJECTED: ${a2.stderr.trim()}`}`,
    );

    // Check B: a finished entry that overlaps a currently running timer.
    const timer = run(["te", "start", "--description", `${prefix}running`, "--json"]);
    if (timer.status === 0) {
      const running = json<{ id: string }>(timer);
      const b1 = run([
        "te",
        "create",
        "--description",
        `${prefix}over-running`,
        "--start",
        start(10),
        "--end",
        start(5),
        "--json",
      ]);
      const b1Accepted = b1.status === 0;
      if (b1Accepted) createdEntryIds.push((JSON.parse(b1.stdout) as { id: string }).id);
      console.log(
        `check B (finished entry overlapping a running timer): ${b1Accepted ? "ACCEPTED" : `REJECTED: ${b1.stderr.trim()}`}`,
      );
      // stop the running timer; it joins the cleanup list
      const stopped = json<{ id: string }>(run(["te", "stop", running.id, "--json"]));
      createdEntryIds.push(stopped.id);
    } else {
      console.log(`check B skipped: could not start a timer: ${timer.stderr.trim()}`);
    }

    // Expected per the Solidtime source (TimeEntryController::assertNoOverlap):
    // flag off → both checks accepted; flag on → check A rejected, check B
    // still accepted (running entries have end = null and never match).
    if (org.prevent_overlapping_time_entries) {
      expect(a2Accepted).toBe(false);
    } else {
      expect(a2Accepted).toBe(true);
    }
    console.log(
      `README wording ${
        org.prevent_overlapping_time_entries
          ? "must mention prevent_overlapping_time_entries for this org"
          : "overlapping finished entries accepted — current wording is correct"
      }`,
    );
  }, 60000);
});
