import { describe, it, expect } from "vitest";
import { unwrap } from "../../src/core/api-client.js";

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
