import { afterEach, describe, it, expect, vi } from "vitest";
import { SolidtimeApiClient, SolidtimeApiError, unwrap } from "../../src/core/api-client.js";

function errorResponse(status: number, body = "error"): Response {
  return {
    ok: false,
    status,
    headers: { get: () => null },
    text: async () => body,
    json: async () => ({ message: body }),
  } as unknown as Response;
}

function networkError(code: string): TypeError {
  const cause = Object.assign(new Error(`connect ${code}`), { code });
  return new TypeError("fetch failed", { cause });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchWithRetry", () => {
  it("does not retry POST on 5xx (may have been processed)", async () => {
    const fetchMock = vi.fn(async () => errorResponse(500));
    vi.stubGlobal("fetch", fetchMock);
    const client = new SolidtimeApiClient({ baseUrl: "https://x", token: "t", retryDelay: 1 });

    await expect(client.post("/things", { a: 1 })).rejects.toThrow(SolidtimeApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry PATCH on 5xx", async () => {
    const fetchMock = vi.fn(async () => errorResponse(500));
    vi.stubGlobal("fetch", fetchMock);
    const client = new SolidtimeApiClient({ baseUrl: "https://x", token: "t", retryDelay: 1 });

    await expect(client.patch("/things", { a: 1 })).rejects.toThrow(SolidtimeApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry DELETE with a body on 5xx", async () => {
    const fetchMock = vi.fn(async () => errorResponse(500));
    vi.stubGlobal("fetch", fetchMock);
    const client = new SolidtimeApiClient({ baseUrl: "https://x", token: "t", retryDelay: 1 });

    await expect(client.deleteWithBody("/things", { ids: ["1"] })).rejects.toThrow(SolidtimeApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries POST on connection refused (request never sent)", async () => {
    const fetchMock = vi.fn(async () => {
      throw networkError("ECONNREFUSED");
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new SolidtimeApiClient({
      baseUrl: "https://x",
      token: "t",
      retries: 2,
      retryDelay: 1,
    });

    await expect(client.post("/things", { a: 1 })).rejects.toThrow(TypeError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries POST on DNS failure", async () => {
    const fetchMock = vi.fn(async () => {
      throw networkError("ENOTFOUND");
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new SolidtimeApiClient({
      baseUrl: "https://x",
      token: "t",
      retries: 2,
      retryDelay: 1,
    });

    await expect(client.post("/things", { a: 1 })).rejects.toThrow(TypeError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry POST on connection reset (request may have reached the server)", async () => {
    const fetchMock = vi.fn(async () => {
      throw networkError("ECONNRESET");
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new SolidtimeApiClient({ baseUrl: "https://x", token: "t", retryDelay: 1 });

    await expect(client.post("/things", { a: 1 })).rejects.toThrow(TypeError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries GET on 5xx", async () => {
    const fetchMock = vi.fn(async () => errorResponse(500));
    vi.stubGlobal("fetch", fetchMock);
    const client = new SolidtimeApiClient({
      baseUrl: "https://x",
      token: "t",
      retries: 2,
      retryDelay: 1,
    });

    await expect(client.get("/things")).rejects.toThrow(SolidtimeApiError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries PUT on 5xx", async () => {
    const fetchMock = vi.fn(async () => errorResponse(500));
    vi.stubGlobal("fetch", fetchMock);
    const client = new SolidtimeApiClient({
      baseUrl: "https://x",
      token: "t",
      retries: 2,
      retryDelay: 1,
    });

    await expect(client.put("/things/1", { a: 1 })).rejects.toThrow(SolidtimeApiError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries POST on 429 (rejected before processing)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(429))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { id: "1" } }),
      } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);
    const client = new SolidtimeApiClient({ baseUrl: "https://x", token: "t", retryDelay: 1 });

    const res = await client.post<{ data: { id: string } }>("/things", { a: 1 });
    expect(res.data.id).toBe("1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("unwrap", () => {
  it("returns array from { data: [] } wrapper", () => {
    const res = { data: [{ id: "1" }, { id: "2" }] };
    expect(unwrap(res)).toEqual([{ id: "1" }, { id: "2" }]);
  });

  it("returns raw array unchanged", () => {
    const arr = [{ id: "1" }];
    expect(unwrap(arr)).toEqual([{ id: "1" }]);
  });

  it("returns empty array for null", () => {
    expect(unwrap(null)).toEqual([]);
  });

  it("returns empty array for undefined", () => {
    expect(unwrap(undefined)).toEqual([]);
  });

  it("returns empty array for object without data key", () => {
    expect(unwrap({ meta: {} })).toEqual([]);
  });

  it("returns empty array for { data: 'not-array' }", () => {
    expect(unwrap({ data: "string" })).toEqual([]);
  });

  it("handles paginated response with meta and links", () => {
    const res = {
      data: [{ id: "a" }],
      links: { first: null, last: null, prev: null, next: null },
      meta: { current_page: 1, last_page: 1, per_page: 15, total: 1, from: 1, to: 1 },
    };
    expect(unwrap(res)).toEqual([{ id: "a" }]);
  });

  it("returns empty array for empty data array", () => {
    expect(unwrap({ data: [] })).toEqual([]);
  });
});
