import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createTrackRecord,
  deleteTrack,
  getStaleHours,
  isTrackStale,
  isValidTrackId,
  listTracks,
  newTrackId,
  readTrack,
  trackElapsedSeconds,
  writeTrack,
  type SolidtimeTrack,
} from "../../src/core/track-store.js";

let trackDir: string;
const envBackup: Record<string, string | undefined> = {};

beforeEach(() => {
  trackDir = fs.mkdtempSync(path.join(os.tmpdir(), "solidtime-tracks-"));
  envBackup.SOLIDTIME_TRACK_DIR = process.env.SOLIDTIME_TRACK_DIR;
  envBackup.SOLIDTIME_TRACK_STALE_HOURS = process.env.SOLIDTIME_TRACK_STALE_HOURS;
  process.env.SOLIDTIME_TRACK_DIR = trackDir;
  delete process.env.SOLIDTIME_TRACK_STALE_HOURS;
});

afterEach(() => {
  for (const [key, value] of Object.entries(envBackup)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  fs.rmSync(trackDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function makeRecord(overrides: Partial<SolidtimeTrack> = {}): SolidtimeTrack {
  const record = createTrackRecord({
    description: "agent work",
    projectId: null,
    taskId: null,
    tags: ["agent"],
    billable: false,
    label: "session-1",
    account: null,
    organization: "org-1",
    memberId: "member-1",
  });
  return { ...record, ...overrides };
}

describe("track ids", () => {
  it("generates 8 base32 characters", () => {
    for (let i = 0; i < 20; i++) {
      expect(newTrackId()).toMatch(/^[a-z2-7]{8}$/);
      expect(isValidTrackId(newTrackId())).toBe(true);
    }
  });

  it("rejects ids that are not 8 base32 characters", () => {
    expect(isValidTrackId("../evil")).toBe(false);
    expect(isValidTrackId("short")).toBe(false);
    expect(isValidTrackId("abcd12341")).toBe(false);
  });
});

describe("track files", () => {
  it("writes, reads and deletes tracks round-trip", () => {
    const record = makeRecord();
    writeTrack(record);

    expect(readTrack(record.id)).toEqual(record);

    deleteTrack(record.id);
    expect(readTrack(record.id)).toBeNull();
  });

  it("returns null for unknown ids", () => {
    expect(readTrack("abcd2345")).toBeNull();
  });

  it("ignores files that are not track files when listing", () => {
    writeTrack(makeRecord());
    // Leftover temp file from a partially written atomic write.
    fs.writeFileSync(path.join(trackDir, "zzzz9999.json.tmp-123-ab"), "{ partial", "utf-8");
    // Unrelated file.
    fs.writeFileSync(path.join(trackDir, "notes.txt"), "hello", "utf-8");

    const tracks = listTracks();
    expect(tracks).toHaveLength(1);
    expect(tracks[0].description).toBe("agent work");
  });

  it("skips unparseable track files with a warning instead of failing", () => {
    writeTrack(makeRecord());
    fs.writeFileSync(path.join(trackDir, "abcd2345.json"), "{not json", "utf-8");

    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    const tracks = listTracks();

    expect(tracks).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("abcd2345.json"));
  });

  it("rejects invalid ids for path safety", () => {
    expect(() => readTrack("../evil")).toThrow(/Invalid track id/);
  });
});

describe("stale tracks", () => {
  it("defaults the stale threshold to 12 hours", () => {
    expect(getStaleHours()).toBe(12);
  });

  it("reads SOLIDTIME_TRACK_STALE_HOURS and rejects invalid values", () => {
    process.env.SOLIDTIME_TRACK_STALE_HOURS = "24";
    expect(getStaleHours()).toBe(24);

    process.env.SOLIDTIME_TRACK_STALE_HOURS = "banana";
    expect(() => getStaleHours()).toThrow(/SOLIDTIME_TRACK_STALE_HOURS/);
  });

  it("flags tracks older than the threshold", () => {
    const record = makeRecord({
      start: new Date(Date.now() - 13 * 3600 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z"),
    });
    expect(isTrackStale(record, 12)).toBe(true);
    expect(isTrackStale(record, 14)).toBe(false);
  });

  it("computes elapsed seconds from the start", () => {
    const record = makeRecord({
      start: new Date(Date.now() - 90 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z"),
    });
    const elapsed = trackElapsedSeconds(record);
    expect(elapsed).toBeGreaterThanOrEqual(89);
    expect(elapsed).toBeLessThan(95);
  });
});
