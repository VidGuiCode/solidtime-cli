import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  MEMBER_ACME,
  MEMBER_STRICT,
  MOCK_TOKEN,
  MockSolidtimeServer,
  ORG_ACME,
  ORG_STRICT,
  PROJ_B,
  TASK_1,
} from "./mock-server.js";

/**
 * End-to-end tests: every scenario spawns the real CLI binary
 * (dist/cli.js) as a subprocess and talks to a local mock Solidtime
 * server. This exercises the full stack — URL building, pagination,
 * config and track-file handling, retry behaviour, exit codes — which
 * mocked unit tests cannot see.
 *
 * The CLI is spawned asynchronously on purpose: the mock server lives in
 * this process, and a synchronous spawn would block the event loop and
 * starve the server of the very request the child is waiting for.
 */

const CLI_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "dist",
  "cli.js",
);

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

const server = new MockSolidtimeServer();

let workDir = "";
let configPath = "";
let loginConfigPath = "";
let tracksDir = "";

let acmeEnv: Record<string, string> = {};
let strictEnv: Record<string, string> = {};
const noEnv: Record<string, string> = {};

function run(
  args: string[],
  env: Record<string, string | undefined> = acmeEnv,
): Promise<RunResult> {
  const fullEnv: NodeJS.ProcessEnv = {
    ...process.env,
    SOLIDTIME_CONFIG: configPath,
    SOLIDTIME_TRACK_DIR: tracksDir,
  };
  for (const key of [
    "SOLIDTIME_BASE_URL",
    "SOLIDTIME_API_TOKEN",
    "SOLIDTIME_ORGANIZATION",
    "SOLIDTIME_MEMBER_ID",
  ]) {
    delete fullEnv[key];
  }
  Object.assign(fullEnv, env);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args], { env: fullEnv });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr?.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    const timer = setTimeout(() => child.kill("SIGKILL"), 30000);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ status: code, stdout, stderr });
    });
  });
}

function assertOk(result: RunResult): RunResult {
  expect(result.status, `command failed: ${result.stderr}`).toBe(0);
  return result;
}

async function runJson<T>(args: string[], env?: Record<string, string | undefined>): Promise<T> {
  const result = await run(args, env);
  return JSON.parse(assertOk(result).stdout) as T;
}

interface State {
  requests: { method: string; url: string }[];
  faults: unknown;
  entries: { id: string; description: string; start: string; end: string | null; tags: string[] }[];
}

async function state(): Promise<State> {
  return (await server.getState()) as State;
}

beforeAll(async () => {
  if (!fs.existsSync(CLI_PATH)) {
    throw new Error(`dist/cli.js not found at ${CLI_PATH} — run "npm run build" first`);
  }
  await server.start();
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "solidtime-e2e-"));
  configPath = path.join(workDir, "config.json");
  loginConfigPath = path.join(workDir, "login-config.json");
  tracksDir = path.join(workDir, "tracks");
  acmeEnv = {
    SOLIDTIME_BASE_URL: server.baseUrl,
    SOLIDTIME_API_TOKEN: MOCK_TOKEN,
    SOLIDTIME_ORGANIZATION: ORG_ACME,
    SOLIDTIME_MEMBER_ID: MEMBER_ACME,
  };
  strictEnv = {
    SOLIDTIME_BASE_URL: server.baseUrl,
    SOLIDTIME_API_TOKEN: MOCK_TOKEN,
    SOLIDTIME_ORGANIZATION: ORG_STRICT,
    SOLIDTIME_MEMBER_ID: MEMBER_STRICT,
  };
});

afterAll(async () => {
  await server.stop();
  fs.rmSync(workDir, { recursive: true, force: true });
});

beforeEach(() => {
  server.reset();
  fs.rmSync(tracksDir, { recursive: true, force: true });
});

// 15000 ms: some scenarios spawn several CLI processes, one spawns a retry.
const T = 15000;

describe("context family", () => {
  it(
    "profile --json shows the authenticated user",
    async () => {
      const out = await runJson<{ name: string; email: string }>(["profile", "--json"]);
      expect(out.name).toBe("Smoke Tester");
      expect(out.email).toBe("smoke@example.com");
    },
    T,
  );

  it(
    "where --json reports env-based context",
    async () => {
      const out = await runJson<{
        context: { account: unknown; organization: string; user: { name: string } | null };
      }>(["where", "--json"]);
      expect(out.context.account).toBeNull();
      expect(out.context.organization).toBe(ORG_ACME);
      expect(out.context.user?.name).toBe("Smoke Tester");
    },
    T,
  );

  it(
    "organization list --json shows both memberships",
    async () => {
      const out = await runJson<{ id: string; name: string; role: string }[]>([
        "organization",
        "list",
        "--json",
      ]);
      expect(out).toHaveLength(2);
      expect(out.map((o) => o.name)).toEqual(["Acme Ltd", "Strict Org"]);
      expect(out[0].active).toBe(true);
    },
    T,
  );

  it(
    "organization show --json includes the overlap flag",
    async () => {
      const out = await runJson<{ id: string; prevent_overlapping_time_entries: boolean }>([
        "organization",
        "show",
        "--json",
      ]);
      expect(out.id).toBe(ORG_ACME);
      expect(out.prevent_overlapping_time_entries).toBe(false);
      const strict = await runJson<{ prevent_overlapping_time_entries: boolean }>(
        ["organization", "show", "--json"],
        strictEnv,
      );
      expect(strict.prevent_overlapping_time_entries).toBe(true);
    },
    T,
  );
});

describe("resource family (read)", () => {
  it(
    "lists round-trip names containing &, unicode and spaces",
    async () => {
      const projects = await runJson<{ name: string }[]>(["project", "list", "--json"]);
      expect(projects.map((p) => p.name)).toContain("Client & Sons <&>");
      expect(projects.map((p) => p.name)).toContain("Ωmega Ünicode");

      const clients = await runJson<{ name: string }[]>(["client", "list", "--json"]);
      expect(clients.map((c) => c.name)).toContain("Müller & Co.");
    },
    T,
  );

  it(
    "task list --project resolves a project by name",
    async () => {
      const tasks = await runJson<{ name: string }[]>([
        "task",
        "list",
        "--project",
        "Website Redesign",
        "--json",
      ]);
      expect(tasks.map((t) => t.name).sort()).toEqual(["Design", "Implement feature X / v2"]);
    },
    T,
  );

  it(
    "project show resolves a project by name",
    async () => {
      const out = await runJson<{ id: string; name: string }>([
        "project",
        "show",
        "Website Redesign",
        "--json",
      ]);
      expect(out.name).toBe("Website Redesign");
    },
    T,
  );

  it(
    "discover all includes the seeded context",
    async () => {
      const out = await runJson<Record<string, unknown>>(["discover", "all"]);
      const text = JSON.stringify(out);
      expect(text).toContain("Website Redesign");
      expect(text).toContain("filler-tag-01");
    },
    T,
  );
});

describe("pagination", () => {
  it(
    "name resolution walks all tag pages (20 tags, 15 per page)",
    async () => {
      const out = await runJson<{ tags: string[] }>([
        "te",
        "create",
        "--description",
        "pag",
        "--start",
        "2026-10-01T15:00:00Z",
        "--end",
        "2026-10-01T16:00:00Z",
        "--tags",
        "filler-tag-15",
        "--json",
      ]);
      expect(out.tags).toEqual(["filler-tag-15"]);

      const s = await state();
      expect(s.requests.some((r) => r.url.includes("tags?page=2"))).toBe(true);
    },
    T,
  );

  it(
    "list commands return every page",
    async () => {
      const tags = await runJson<{ name: string }[]>(["tag", "list", "--json"]);
      expect(tags).toHaveLength(20);
      expect(tags.map((t) => t.name)).toContain("filler-tag-15");
    },
    T,
  );

  it(
    "te list passes limit and offset through",
    async () => {
      const page = await runJson<{ description: string }[]>([
        "te",
        "list",
        "--limit",
        "2",
        "--offset",
        "1",
        "--json",
      ]);
      expect(page.map((e) => e.description)).toEqual(["Agent build", "Misc"]);
    },
    T,
  );
});

describe("time-entry family (write)", () => {
  it(
    "te create normalizes datetimes to UTC",
    async () => {
      const out = await runJson<{ start: string; end: string }>([
        "te",
        "create",
        "--description",
        "UTC check",
        "--start",
        "2026-10-01T12:00:00+02:00",
        "--end",
        "2026-10-01T14:30:00+02:00",
        "--json",
      ]);
      expect(out.start).toBe("2026-10-01T10:00:00Z");
      expect(out.end).toBe("2026-10-01T12:30:00Z");
    },
    T,
  );

  it(
    "te create resolves project, task and tag names",
    async () => {
      const out = await runJson<{ project_id: string; task_id: string; tags: string[] }>([
        "te",
        "create",
        "--description",
        "Sel",
        "--start",
        "2026-10-01T15:00:00Z",
        "--end",
        "2026-10-01T15:30:00Z",
        "--project",
        "Website Redesign",
        "--task",
        "Design",
        "--tags",
        "tag with spaces",
        "--json",
      ]);
      expect(out.project_id).toBe(PROJ_B);
      expect(out.task_id).toBe(TASK_1);
      expect(out.tags).toEqual(["tag with spaces"]);
    },
    T,
  );

  it(
    "te update changes fields and clears project with --no-project",
    async () => {
      const created = await runJson<{ id: string; project_id: string }>([
        "te",
        "create",
        "--description",
        "orig",
        "--start",
        "2026-10-01T15:00:00Z",
        "--end",
        "2026-10-01T15:30:00Z",
        "--project",
        PROJ_B,
        "--json",
      ]);
      const updated = await runJson<{ description: string; project_id: string | null }>([
        "te",
        "update",
        created.id,
        "--description",
        "rewritten",
        "--no-project",
        "--json",
      ]);
      expect(updated.description).toBe("rewritten");
      expect(updated.project_id).toBeNull();
    },
    T,
  );

  it(
    "te delete removes the entry",
    async () => {
      const created = await runJson<{ id: string }>([
        "te",
        "create",
        "--description",
        "doomed",
        "--start",
        "2026-10-01T15:00:00Z",
        "--end",
        "2026-10-01T15:30:00Z",
        "--json",
      ]);
      const result = await run(["te", "delete", created.id, "--json"]);
      expect(result.status, result.stderr).toBe(0);
      const s = await state();
      expect(s.entries.find((e) => e.description === "doomed")).toBeUndefined();
    },
    T,
  );

  it(
    "bulk-update and bulk-delete apply to all ids",
    async () => {
      const first = await runJson<{ id: string }>([
        "te",
        "create",
        "--description",
        "b1",
        "--start",
        "2026-10-01T15:00:00Z",
        "--end",
        "2026-10-01T15:30:00Z",
        "--json",
      ]);
      const second = await runJson<{ id: string }>([
        "te",
        "create",
        "--description",
        "b2",
        "--start",
        "2026-10-01T16:00:00Z",
        "--end",
        "2026-10-01T16:30:00Z",
        "--json",
      ]);
      const updated = await runJson<{ success: string[]; error: string[] }>([
        "te",
        "bulk-update",
        "--ids",
        first.id,
        second.id,
        "--billable",
        "--json",
      ]);
      expect(updated.success).toEqual([first.id, second.id]);

      const deleted = await runJson<{ success: string[]; error: string[] }>([
        "te",
        "bulk-delete",
        "--ids",
        first.id,
        second.id,
        "--json",
      ]);
      expect(deleted.success).toEqual([first.id, second.id]);
    },
    T,
  );

  it(
    "te start / active / stop lifecycle",
    async () => {
      const started = await runJson<{ id: string; end: string | null }>([
        "te",
        "start",
        "--description",
        "Running thing",
        "--json",
      ]);
      expect(started.end).toBeNull();

      const active = await runJson<{ id: string }>(["te", "active", "--json"]);
      expect(active.id).toBe(started.id);

      const stopped = await runJson<{ id: string; end: string | null }>([
        "te",
        "stop",
        started.id,
        "--json",
      ]);
      expect(stopped.end).not.toBeNull();

      const none = await runJson<{ active: boolean }>(["te", "active", "--json"]);
      expect(none.active).toBe(false);
    },
    T,
  );

  it(
    "te start while a timer runs fails with time_entry_still_running",
    async () => {
      const started = await runJson<{ id: string }>([
        "te",
        "start",
        "--description",
        "first",
        "--json",
      ]);
      expect(started.id).toBeTruthy();
      const second = await run(["te", "start", "--description", "second", "--json"]);
      expect(second.status).toBe(1);
      expect(second.stderr).toContain("time_entry_still_running");
    },
    T,
  );

  it(
    "--dry-run sends nothing",
    async () => {
      const result = await run([
        "te",
        "create",
        "--description",
        "dry",
        "--start",
        "2026-10-01T15:00:00Z",
        "--end",
        "2026-10-01T15:30:00Z",
        "--dry-run",
        "--json",
      ]);
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({ dryRun: true });
      const s = await state();
      expect(
        s.requests.filter((r) => r.method === "POST" && r.url.endsWith("/time-entries")),
      ).toHaveLength(0);
    },
    T,
  );
});

describe("overlap policy (mirrors Solidtime server behaviour)", () => {
  it(
    "accepts overlapping finished entries when the org flag is off",
    async () => {
      const first = await run([
        "te",
        "create",
        "--description",
        "a",
        "--start",
        "2026-10-01T09:00:00Z",
        "--end",
        "2026-10-01T10:00:00Z",
      ]);
      const second = await run([
        "te",
        "create",
        "--description",
        "b",
        "--start",
        "2026-10-01T09:30:00Z",
        "--end",
        "2026-10-01T10:30:00Z",
      ]);
      expect(first.status, first.stderr).toBe(0);
      expect(second.status, second.stderr).toBe(0);
    },
    T,
  );

  it(
    "rejects overlapping finished entries when the org flag is on",
    async () => {
      const first = await run(
        [
          "te",
          "create",
          "--description",
          "a",
          "--start",
          "2026-10-01T09:00:00Z",
          "--end",
          "2026-10-01T10:00:00Z",
        ],
        strictEnv,
      );
      const second = await run(
        [
          "te",
          "create",
          "--description",
          "b",
          "--start",
          "2026-10-01T09:30:00Z",
          "--end",
          "2026-10-01T10:30:00Z",
        ],
        strictEnv,
      );
      expect(first.status, first.stderr).toBe(0);
      expect(second.status).toBe(1);
      expect(second.stderr).toContain("overlapping_time_entry");
    },
    T,
  );

  it(
    "a finished entry overlapping a running timer is accepted even with the flag on",
    async () => {
      const timer = await run(["te", "start", "--description", "live timer"], strictEnv);
      expect(timer.status, timer.stderr).toBe(0);
      const finished = await run(
        [
          "te",
          "create",
          "--description",
          "over the running timer",
          "--start",
          "2026-10-01T09:00:00Z",
          "--end",
          "2026-10-01T10:00:00Z",
        ],
        strictEnv,
      );
      expect(finished.status, finished.stderr).toBe(0);
    },
    T,
  );
});

describe("track family", () => {
  it(
    "start / list / stop posts a finished entry and removes the file",
    async () => {
      const started = await runJson<{ id: string; start: string }>([
        "track",
        "start",
        "--description",
        "Tracked work",
        "--project",
        "Website Redesign",
        "--label",
        "s1",
        "--json",
      ]);
      expect(started.id).toMatch(/^[a-z2-7]{8}$/);
      expect(fs.existsSync(path.join(tracksDir, `${started.id}.json`))).toBe(true);

      const list = await runJson<{ id: string; label: string | null }[]>([
        "track",
        "list",
        "--json",
      ]);
      expect(list).toHaveLength(1);
      expect(list[0].label).toBe("s1");

      const stopped = await runJson<{ description: string; project_id: string; end: string }>([
        "track",
        "stop",
        started.id,
        "--json",
      ]);
      expect(stopped.description).toBe("Tracked work");
      expect(stopped.project_id).toBe(PROJ_B);
      expect(stopped.end).toBeTruthy();
      expect(fs.existsSync(path.join(tracksDir, `${started.id}.json`))).toBe(false);
    },
    T,
  );

  it(
    "stop --all --label only stops that label",
    async () => {
      const first = await runJson<{ id: string }>([
        "track",
        "start",
        "--description",
        "one",
        "--label",
        "s1",
        "--json",
      ]);
      const second = await runJson<{ id: string }>([
        "track",
        "start",
        "--description",
        "two",
        "--label",
        "s2",
        "--json",
      ]);
      const stopped = await runJson<{ stopped: { id: string }[]; failed: unknown[] }>([
        "track",
        "stop",
        "--all",
        "--label",
        "s2",
        "--json",
      ]);
      expect(stopped.stopped.map((t) => t.id)).toEqual([second.id]);
      expect(stopped.failed).toHaveLength(0);
      const remaining = await runJson<{ id: string }[]>(["track", "list", "--json"]);
      expect(remaining.map((t) => t.id)).toEqual([first.id]);
    },
    T,
  );

  it(
    "a 500 after the server processed the POST recovers the entry without duplicating it",
    async () => {
      const started = await runJson<{ id: string; start: string }>([
        "track",
        "start",
        "--description",
        "recover me",
        "--json",
      ]);
      await server.setFaults({ postTimeEntries500: 1 });

      const result = assertOk(await run(["track", "stop", started.id, "--json"]));
      const entry = JSON.parse(result.stdout) as { start: string; description: string };
      expect(entry.start).toBe(started.start);
      expect(entry.description).toBe("recover me");
      expect(fs.existsSync(path.join(tracksDir, `${started.id}.json`))).toBe(false);

      const s = await state();
      const posts = s.requests.filter(
        (r) => r.method === "POST" && r.url.endsWith("/time-entries"),
      );
      expect(posts).toHaveLength(1); // no blind retry
      const matching = s.entries.filter((e) => e.description === "recover me");
      expect(matching).toHaveLength(1); // no duplicate
    },
    T,
  );

  it(
    "a rejected POST (400) keeps the local file and exits 1, and a re-run succeeds",
    async () => {
      const started = await runJson<{ id: string }>([
        "track",
        "start",
        "--description",
        "keep me",
        "--json",
      ]);
      await server.setFaults({ postTimeEntries400: 1 });

      const failed = await run(["track", "stop", started.id, "--json"]);
      expect(failed.status).toBe(1);
      expect(fs.existsSync(path.join(tracksDir, `${started.id}.json`))).toBe(true);

      const retried = await run(["track", "stop", started.id, "--json"]);
      expect(retried.status, retried.stderr).toBe(0);
      expect(fs.existsSync(path.join(tracksDir, `${started.id}.json`))).toBe(false);
    },
    T,
  );

  it(
    "stale tracks need --force when non-interactive",
    async () => {
      const started = await runJson<{ id: string }>([
        "track",
        "start",
        "--description",
        "stale one",
        "--json",
      ]);
      // STALE_HOURS=0 makes a track stale after 1s; ensure elapsed > 0.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const refused = await run(["track", "stop", started.id, "--no-interactive", "--json"], {
        ...acmeEnv,
        SOLIDTIME_TRACK_STALE_HOURS: "0",
      });
      expect(refused.status).toBe(3);
      expect(refused.stderr).toContain("stale");

      const forced = await run(["track", "stop", started.id, "--force", "--json"], {
        ...acmeEnv,
        SOLIDTIME_TRACK_STALE_HOURS: "0",
      });
      expect(forced.status, forced.stderr).toBe(0);
    },
    T,
  );

  it(
    "cancel deletes the file and sends nothing",
    async () => {
      const started = await runJson<{ id: string }>([
        "track",
        "start",
        "--description",
        "cancel me",
        "--json",
      ]);
      const result = await run(["track", "cancel", started.id, "--json"]);
      expect(result.status).toBe(0);
      expect(fs.existsSync(path.join(tracksDir, `${started.id}.json`))).toBe(false);
      const s = await state();
      expect(s.requests.filter((r) => r.method === "POST")).toHaveLength(0);
    },
    T,
  );

  it(
    "--dry-run prints the body and keeps the file",
    async () => {
      const started = await runJson<{ id: string }>([
        "track",
        "start",
        "--description",
        "dry track",
        "--json",
      ]);
      const result = await run(["track", "stop", started.id, "--dry-run", "--json"]);
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({ dryRun: true, action: "track.stop" });
      expect(fs.existsSync(path.join(tracksDir, `${started.id}.json`))).toBe(true);
    },
    T,
  );
});

describe("report family", () => {
  it(
    "report splits human / agent / other per project",
    async () => {
      const out = await runJson<{
        total_seconds: number;
        projects: {
          project_name: string;
          human_seconds: number;
          agent_seconds: number;
          other_seconds: number;
          total_seconds: number;
        }[];
      }>(["report", "--start", "2026-10-01T00:00:00Z", "--end", "2026-10-01T23:59:59Z", "--json"]);

      expect(out.total_seconds).toBe(16200);
      const byName = Object.fromEntries(out.projects.map((p) => [p.project_name, p]));
      expect(byName["Client & Sons <&>"]).toMatchObject({
        human_seconds: 3600,
        agent_seconds: 0,
        other_seconds: 0,
        total_seconds: 3600,
      });
      expect(byName["Website Redesign"]).toMatchObject({
        human_seconds: 0,
        agent_seconds: 7200,
        other_seconds: 1800,
        total_seconds: 9000,
      });
      expect(byName["(no project)"].total_seconds).toBe(3600);
    },
    T,
  );

  it(
    "te aggregate groups by project and tag",
    async () => {
      const byProject = await runJson<{ data: { key: string | null; seconds: number }[] }>([
        "te",
        "aggregate",
        "--group",
        "project",
        "--json",
      ]);
      const projB = byProject.data.find((r) => r.key === PROJ_B);
      expect(projB?.seconds).toBe(9000);

      const byTag = await runJson<{ data: { key: string | null; seconds: number }[] }>([
        "te",
        "aggregate",
        "--group",
        "tag",
        "--json",
      ]);
      const agent = byTag.data.find((r) => r.key === "agent");
      expect(agent?.seconds).toBe(7200);
    },
    T,
  );
});

describe("error handling and exit codes", () => {
  it(
    "bad token exits with code 2",
    async () => {
      const result = await run(["profile"], { ...acmeEnv, SOLIDTIME_API_TOKEN: "wrong-token" });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("Authentication failed");
    },
    T,
  );

  it(
    "unknown project id exits with code 1 and a project hint",
    async () => {
      const result = await run(["project", "show", "0d000000-0000-4000-8000-999999999999"]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Project not found");
    },
    T,
  );

  it("429 responses are retried and succeed", async () => {
    await server.setFaults({ get429Remaining: 1, get429RetryAfter: 0 });
    const out = await runJson<{ name: string }>(["profile", "--json"]);
    expect(out.name).toBe("Smoke Tester");
    const s = await state();
    const gets = s.requests.filter((r) => r.method === "GET" && r.url.endsWith("/users/me"));
    expect(gets.length).toBeGreaterThanOrEqual(2);
  }, 20000);

  it(
    "missing account exits with code 1",
    async () => {
      const result = await run(["profile"], noEnv);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("No active account");
    },
    T,
  );

  it(
    "corrupt config exits with code 3 and never falls back to empty",
    async () => {
      fs.writeFileSync(configPath, "{ this is not json", "utf-8");
      const result = await run(["profile"], noEnv);
      expect(result.status).toBe(3);
      expect(result.stderr).toContain("not valid JSON");
      fs.rmSync(configPath, { force: true });
    },
    T,
  );
});

describe("login and config-driven operation", () => {
  it(
    "non-interactive login saves a profile and subsequent commands use it",
    async () => {
      const loginEnv = { SOLIDTIME_CONFIG: loginConfigPath, SOLIDTIME_TRACK_DIR: tracksDir };
      const login = await run(
        ["login", "--url", server.baseUrl, "--token", MOCK_TOKEN, "--json"],
        loginEnv,
      );
      expect(login.status, login.stderr).toBe(0);
      // two memberships: non-interactive login picks the first (Acme Ltd)
      expect(login.stdout).toContain('"acme-ltd"');

      const accounts = await run(["account", "list", "--json"], loginEnv);
      expect(accounts.status).toBe(0);
      expect(accounts.stdout).toContain("acme-ltd");

      // config-driven client: no SOLIDTIME_BASE_URL/TOKEN in the environment
      const entries = await runJson<unknown[]>(["te", "list", "--limit", "1", "--json"], loginEnv);
      expect(entries).toHaveLength(1);
    },
    T,
  );
});
