import { afterEach, describe, it, expect, vi } from "vitest";
import { SolidtimeApiClient } from "../../src/core/api-client.js";
import { createTimeEntryWithDedupe } from "../../src/core/time-entries.js";
import type { SolidtimeTimeEntry } from "../../src/core/types.js";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

const ORG = "org-1";
const BODY = {
  member_id: "member-1",
  description: "agent work",
  start: "2026-10-01T09:00:00Z",
  end: "2026-10-01T10:00:00Z",
  project_id: null,
  task_id: null,
  tags: [],
  billable: false,
};

function existingEntry(): SolidtimeTimeEntry {
  return {
    id: "entry-1",
    start: BODY.start,
    end: BODY.end,
    duration: 3600,
    description: BODY.description,
    task_id: null,
    project_id: null,
    organization_id: ORG,
    user_id: "user-1",
    tags: [],
    billable: false,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createTimeEntryWithDedupe", () => {
  it("posts normally when the server responds 2xx", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(201, { data: existingEntry() }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new SolidtimeApiClient({ baseUrl: "https://x", token: "t", retryDelay: 1 });

    const { entry, deduped } = await createTimeEntryWithDedupe(client, ORG, BODY);

    expect(deduped).toBe(false);
    expect(entry.id).toBe("entry-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("recovers an existing entry when the POST failed with 5xx", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, { message: "boom" }))
      .mockResolvedValueOnce(jsonResponse(200, { data: [existingEntry()] }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new SolidtimeApiClient({ baseUrl: "https://x", token: "t", retryDelay: 1 });

    const { entry, deduped } = await createTimeEntryWithDedupe(client, ORG, BODY);

    expect(deduped).toBe(true);
    expect(entry.id).toBe("entry-1");
    // Exactly one POST; the second call is the dedupe lookup (fetch's default method is GET).
    const methods = fetchMock.mock.calls.map((c) => (c[1] as RequestInit).method ?? "GET");
    expect(methods).toEqual(["POST", "GET"]);
  });

  it("does not dedupe when the found entry does not match start and description", async () => {
    const other = { ...existingEntry(), description: "different" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, { message: "boom" }))
      .mockResolvedValueOnce(jsonResponse(200, { data: [other] }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new SolidtimeApiClient({ baseUrl: "https://x", token: "t", retryDelay: 1 });

    await expect(createTimeEntryWithDedupe(client, ORG, BODY)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws the original error when the dedupe lookup finds nothing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, { message: "boom" }))
      .mockResolvedValueOnce(jsonResponse(200, { data: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new SolidtimeApiClient({ baseUrl: "https://x", token: "t", retryDelay: 1 });

    await expect(createTimeEntryWithDedupe(client, ORG, BODY)).rejects.toThrow(/500/);
  });

  it("does not run the dedupe lookup for validation errors (4xx)", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(422, { message: "invalid" }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new SolidtimeApiClient({ baseUrl: "https://x", token: "t", retryDelay: 1 });

    await expect(createTimeEntryWithDedupe(client, ORG, BODY)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
