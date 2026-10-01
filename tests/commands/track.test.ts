import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createTrackCommand } from "../../src/commands/track.js";
import {
  listTracks,
  readTrack,
  writeTrack,
  type SolidtimeTrack,
} from "../../src/core/track-store.js";
import type { SolidtimeTimeEntry } from "../../src/core/types.js";

const ORG = "org-1";
const MEMBER = "member-1";

let trackDir: string;
let homeDir: string;
const envBackup: Record<string, string | undefined> = {};

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

function entryResponse(entry: SolidtimeTimeEntry): Response {
  return jsonResponse(201, { data: entry });
}

function makeEntry(id: string, start = "2026-10-01T09:00:00Z"): SolidtimeTimeEntry {
  return {
    id,
    start,
    end: "2026-10-01T10:00:00Z",
    duration: 3600,
    description: "agent work",
    task_id: null,
    project_id: null,
    organization_id: ORG,
    user_id: "user-1",
    tags: [],
    billable: false,
  };
}

function makeRecord(overrides: Partial<SolidtimeTrack> = {}): SolidtimeTrack {
  return {
    id: "abcd2345",
    start: new Date(Date.now() - 60_000).toISOString().replace(/\.\d{3}Z$/, "Z"),
    description: "agent work",
    project_id: null,
    task_id: null,
    tags: [],
    billable: false,
    label: null,
    account: null,
    organization: ORG,
    member_id: MEMBER,
    created_by_pid: process.pid,
    hostname: "test-host",
    ...overrides,
  };
}

async function runTrack(args: string[]): Promise<void> {
  await createTrackCommand().parseAsync(["node", "track", ...args]);
}

beforeEach(() => {
  trackDir = fs.mkdtempSync(path.join(os.tmpdir(), "solidtime-tracks-cmd-"));
  homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "solidtime-home-cmd-"));

  const env: Record<string, string> = {
    SOLIDTIME_TRACK_DIR: trackDir,
    SOLIDTIME_BASE_URL: "https://x.example.com",
    SOLIDTIME_API_TOKEN: "token",
    SOLIDTIME_ORGANIZATION: ORG,
    SOLIDTIME_MEMBER_ID: MEMBER,
  };
  for (const [key, value] of Object.entries(env)) {
    envBackup[key] = process.env[key];
    process.env[key] = value;
  }
  delete process.env.SOLIDTIME_TRACK_STALE_HOURS;

  (os as { homedir(): string }).homedir = () => homeDir;
});

afterEach(() => {
  (os as { homedir(): string }).homedir = os.homedir;
  for (const [key, value] of Object.entries(envBackup)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  fs.rmSync(trackDir, { recursive: true, force: true });
  fs.rmSync(homeDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function captureConsole(): { logs: string[]; errors: string[] } {
  const logs: string[] = [];
  const errors: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  });
  return { logs, errors };
}

function lastJson(logs: string[]): unknown {
  return JSON.parse(logs[logs.length - 1]);
}

function stubExit(): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
}

describe("track start and list", () => {
  it("starts two timers, lists both, and stopping one leaves the other", async () => {
    captureConsole();
    await runTrack(["start", "--description", "agent A", "--label", "a", "--json"]);
    await runTrack(["start", "--description", "agent B", "--label", "b", "--json"]);

    const running = listTracks();
    expect(running).toHaveLength(2);
    expect(running.map((t) => t.label).sort()).toEqual(["a", "b"]);

    const ids = listTracks().map((t) => t.id);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: RequestInit) =>
        init?.method === "POST" ? entryResponse(makeEntry("entry-a")) : jsonResponse(400),
      ),
    );
    await runTrack(["stop", ids[0], "--json"]);

    expect(listTracks().map((t) => t.id)).toEqual([ids[1]]);
  });

  it("start resolves nothing on the server and prints { id, start } in JSON", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { logs } = captureConsole();

    await runTrack(["start", "--description", "work", "--json"]);

    expect(fetchMock).not.toHaveBeenCalled();
    const printed = lastJson(logs) as { id: string; start: string };
    expect(printed.id).toMatch(/^[a-z2-7]{8}$/);
    expect(printed.start).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });
});

describe("track stop", () => {
  it("keeps the file and exits non-zero when the POST fails with 5xx", async () => {
    // POST fails with 5xx; the dedupe lookup gets a 4xx so it fails fast
    // instead of retrying with real backoff delays.
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) =>
      init?.method === "POST" ? jsonResponse(500, { message: "boom" }) : jsonResponse(400),
    );
    vi.stubGlobal("fetch", fetchMock);
    const exit = stubExit();
    captureConsole();

    const record = makeRecord();
    writeTrack(record);
    await runTrack(["stop", record.id, "--json"]);

    expect(readTrack(record.id)).toEqual(record);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("succeeds on a second attempt and deletes the file", async () => {
    let postCount = 0;
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.method !== "POST") return jsonResponse(400);
      postCount++;
      return postCount === 1
        ? jsonResponse(500, { message: "boom" })
        : entryResponse(makeEntry("entry-1"));
    });
    vi.stubGlobal("fetch", fetchMock);
    const exit = stubExit();
    const { logs } = captureConsole();

    const record = makeRecord();
    writeTrack(record);
    await runTrack(["stop", record.id, "--json"]);
    expect(readTrack(record.id)).not.toBeNull();

    await runTrack(["stop", record.id, "--json"]);

    expect(readTrack(record.id)).toBeNull();
    expect(lastJson(logs)).toMatchObject({ id: "entry-1" });
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("recovers via dedupe lookup after a lost response and creates exactly one entry", async () => {
    const record = makeRecord();
    const entry = makeEntry("entry-1", record.start);
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => {
        const cause = Object.assign(new Error("connection reset"), { code: "ECONNRESET" });
        throw new TypeError("fetch failed", { cause });
      })
      .mockResolvedValueOnce(jsonResponse(200, { data: [entry] }));
    vi.stubGlobal("fetch", fetchMock);
    const { logs } = captureConsole();

    writeTrack(record);
    await runTrack(["stop", record.id, "--json"]);

    // Exactly one POST (no blind retry); the second call is the dedupe lookup.
    const methods = fetchMock.mock.calls.map((c) => (c[1] as RequestInit).method ?? "GET");
    expect(methods).toEqual(["POST", "GET"]);
    expect(readTrack(record.id)).toBeNull();
    expect(lastJson(logs)).toMatchObject({ id: "entry-1" });
  });

  it("--dry-run sends nothing and keeps the file", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { logs } = captureConsole();
    const argv = process.argv;
    process.argv = [...argv, "--dry-run"];

    try {
      const record = makeRecord();
      writeTrack(record);
      await runTrack(["stop", record.id, "--json"]);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(readTrack(record.id)).toEqual(record);
      expect(lastJson(logs)).toMatchObject({ dryRun: true, action: "track.stop" });
    } finally {
      process.argv = argv;
    }
  });

  it("refuses a stale timer when non-interactive without --end or --force (exit 3)", async () => {
    const staleRecord = makeRecord({
      start: new Date(Date.now() - 13 * 3600 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z"),
    });
    writeTrack(staleRecord);

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const exit = stubExit();
    captureConsole();

    await runTrack(["stop", staleRecord.id, "--json"]);

    expect(exit).toHaveBeenCalledWith(3);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(readTrack(staleRecord.id)).toEqual(staleRecord);

    // --force bypasses the stale guard.
    fetchMock.mockImplementation(async (_url: unknown, init?: RequestInit) =>
      init?.method === "POST" ? entryResponse(makeEntry("entry-2")) : jsonResponse(400),
    );
    await runTrack(["stop", staleRecord.id, "--force", "--json"]);
    expect(readTrack(staleRecord.id)).toBeNull();
  });

  it("--all --label x only stops tracks with that label and reports failures", async () => {
    const older = new Date(Date.now() - 120_000).toISOString().replace(/\.\d{3}Z$/, "Z");
    const newer = new Date(Date.now() - 60_000).toISOString().replace(/\.\d{3}Z$/, "Z");
    writeTrack(makeRecord({ id: "aaaa2222", label: "x", start: older }));
    writeTrack(makeRecord({ id: "bbbb3333", label: "y", start: older }));
    writeTrack(makeRecord({ id: "cccc4444", label: "x", start: newer }));

    let postCount = 0;
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.method !== "POST") return jsonResponse(400);
      postCount++;
      return postCount === 1 ? entryResponse(makeEntry(`e${postCount}`)) : jsonResponse(500);
    });
    vi.stubGlobal("fetch", fetchMock);
    const exit = stubExit();
    const { logs } = captureConsole();

    await runTrack(["stop", "--all", "--label", "x", "--json"]);

    const printed = lastJson(logs) as {
      stopped: Array<{ id: string }>;
      failed: Array<{ id: string; error: string }>;
    };
    // Tracks are processed oldest first: aaaa2222 stops, cccc4444 fails.
    expect(printed.stopped.map((s) => s.id)).toEqual(["aaaa2222"]);
    expect(printed.failed.map((f) => f.id)).toEqual(["cccc4444"]);
    expect(exit).toHaveBeenCalledWith(1);
    // The differently-labelled track is untouched.
    expect(readTrack("bbbb3333")).not.toBeNull();
    expect(readTrack("aaaa2222")).toBeNull();
  });

  it("rejects an end time before the track start", async () => {
    const record = makeRecord({ start: "2026-10-01T09:00:00Z" });
    writeTrack(record);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const exit = stubExit();
    captureConsole();

    await runTrack(["stop", record.id, "--end", "2026-10-01T08:00:00Z", "--json"]);

    expect(exit).toHaveBeenCalledWith(3);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(readTrack(record.id)).toEqual(record);
  });
});

describe("track cancel and show", () => {
  it("cancel deletes the local timer without any request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { logs } = captureConsole();

    const record = makeRecord();
    writeTrack(record);
    await runTrack(["cancel", record.id, "--json"]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(readTrack(record.id)).toBeNull();
    expect(lastJson(logs)).toMatchObject({ success: true, action: "track.cancel" });
  });

  it("show prints the stored record with elapsed time", async () => {
    const { logs } = captureConsole();

    const record = makeRecord();
    writeTrack(record);
    await runTrack(["show", record.id, "--json"]);

    const printed = lastJson(logs) as Record<string, unknown>;
    expect(printed).toMatchObject({ id: record.id, organization: ORG, member_id: MEMBER });
    expect(printed.elapsed_seconds).toBeGreaterThan(0);
  });
});
