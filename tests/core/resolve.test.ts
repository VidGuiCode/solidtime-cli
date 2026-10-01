import { afterEach, describe, it, expect, vi } from "vitest";
import { SolidtimeApiClient } from "../../src/core/api-client.js";
import { isUuid, resolveProject, resolveTask, resolveTagIds } from "../../src/core/resolve.js";

const ORG = "org-1";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

function paginated(items: unknown[]): unknown {
  return {
    data: items,
    links: { first: null, last: null, prev: null, next: null },
    meta: {
      current_page: 1,
      last_page: 1,
      per_page: 15,
      total: items.length,
      from: 1,
      to: items.length,
    },
  };
}

const PROJECTS = [
  { id: "11111111-1111-1111-1111-111111111111", name: "Client Work" },
  { id: "22222222-2222-2222-2222-222222222222", name: "Internal" },
  { id: "33333333-3333-3333-3333-333333333333", name: "internal" },
];

const TASKS = [
  {
    id: "44444444-4444-4444-4444-444444444444",
    name: "Review PR",
    project_id: "11111111-1111-1111-1111-111111111111",
  },
  {
    id: "55555555-5555-5555-5555-555555555555",
    name: "Write docs",
    project_id: "22222222-2222-2222-2222-222222222222",
  },
];

const TAGS = [{ id: "66666666-6666-6666-6666-666666666666", name: "agent" }];

function mockListEndpoints(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (url: string | URL | Request) => {
    const path = String(url instanceof Request ? url.url : url);
    if (path.includes("/projects")) return jsonResponse(200, paginated(PROJECTS));
    if (path.includes("/tasks")) return jsonResponse(200, paginated(TASKS));
    if (path.includes("/tags")) return jsonResponse(200, paginated(TAGS));
    return jsonResponse(404, { message: "not found" });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function makeClient(): SolidtimeApiClient {
  return new SolidtimeApiClient({ baseUrl: "https://x", token: "t", retryDelay: 1 });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("isUuid", () => {
  it("accepts lowercase, uppercase and mixed UUIDs", () => {
    expect(isUuid("0d5adf3c-90c2-4a1f-b4f2-53b50f4b0f0a")).toBe(true);
    expect(isUuid("0D5ADF3C-90C2-4A1F-B4F2-53B50F4B0F0A")).toBe(true);
  });

  it("rejects names and malformed ids", () => {
    expect(isUuid("Client Work")).toBe(false);
    expect(isUuid("not-a-uuid")).toBe(false);
  });
});

describe("resolveProject", () => {
  it("passes UUIDs through without an API call", async () => {
    const fetchMock = mockListEndpoints();
    const id = await resolveProject(makeClient(), ORG, "11111111-1111-1111-1111-111111111111");
    expect(id).toBe("11111111-1111-1111-1111-111111111111");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("matches names case-insensitively", async () => {
    mockListEndpoints();
    const id = await resolveProject(makeClient(), ORG, "client work");
    expect(id).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("throws a validation error for unknown names", async () => {
    mockListEndpoints();
    await expect(resolveProject(makeClient(), ORG, "nope")).rejects.toThrow(/not found/);
  });

  it("lists candidates when a name is ambiguous", async () => {
    mockListEndpoints();
    await expect(resolveProject(makeClient(), ORG, "internal")).rejects.toThrow(
      /22222222[\s\S]*Internal[\s\S]*33333333[\s\S]*internal/,
    );
  });
});

describe("resolveTask", () => {
  it("scopes the lookup to the given project", async () => {
    const fetchMock = mockListEndpoints();
    const id = await resolveTask(
      makeClient(),
      ORG,
      "Review PR",
      "11111111-1111-1111-1111-111111111111",
    );
    expect(id).toBe("44444444-4444-4444-4444-444444444444");
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("project_id=11111111");
  });
});

describe("resolveTagIds", () => {
  it("matches tag names case-insensitively", async () => {
    mockListEndpoints();
    const ids = await resolveTagIds(makeClient(), ORG, ["AGENT"]);
    expect(ids).toEqual(["66666666-6666-6666-6666-666666666666"]);
  });

  it("throws for unknown tags without createMissing", async () => {
    mockListEndpoints();
    await expect(resolveTagIds(makeClient(), ORG, ["unknown"])).rejects.toThrow(/Tag.*not found/);
  });

  it("creates missing tags when createMissing is set", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, paginated(TAGS)))
      .mockResolvedValueOnce(
        jsonResponse(201, { data: { id: "77777777-7777-7777-7777-777777777777", name: "human" } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const ids = await resolveTagIds(makeClient(), ORG, ["agent", "human"], {
      createMissing: true,
    });

    expect(ids).toEqual([
      "66666666-6666-6666-6666-666666666666",
      "77777777-7777-7777-7777-777777777777",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports but does not create missing tags under --dry-run", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(200, paginated(TAGS)));
    vi.stubGlobal("fetch", fetchMock);
    const argv = process.argv;
    process.argv = [...argv, "--dry-run"];

    try {
      const ids = await resolveTagIds(makeClient(), ORG, ["human"], { createMissing: true });
      expect(ids).toEqual([]);
    } finally {
      process.argv = argv;
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
