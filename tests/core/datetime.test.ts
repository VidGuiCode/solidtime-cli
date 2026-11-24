import { describe, it, expect } from "vitest";
import { assertEndAfterStart, normalizeDateTime, toUTCString } from "../../src/core/datetime.js";
import { ValidationError } from "../../src/core/errors.js";

describe("toUTCString", () => {
  it("formats a Date without milliseconds", () => {
    const d = new Date("2026-04-01T10:00:00.000Z");
    expect(toUTCString(d)).toBe("2026-04-01T10:00:00Z");
  });
});

describe("normalizeDateTime", () => {
  it("passes through UTC Z-suffix unchanged", () => {
    expect(normalizeDateTime("2026-04-01T10:00:00Z")).toBe("2026-04-01T10:00:00Z");
  });

  it("converts +02:00 offset to UTC", () => {
    expect(normalizeDateTime("2026-04-01T12:00:00+02:00")).toBe("2026-04-01T10:00:00Z");
  });

  it("converts -05:00 offset to UTC", () => {
    expect(normalizeDateTime("2026-04-01T08:00:00-05:00")).toBe("2026-04-01T13:00:00Z");
  });

  it("strips milliseconds", () => {
    expect(normalizeDateTime("2026-04-01T10:00:00.123Z")).toBe("2026-04-01T10:00:00Z");
  });

  it("handles date-only input", () => {
    expect(normalizeDateTime("2026-04-01")).toBe("2026-04-01T00:00:00Z");
  });

  it("throws ValidationError for garbage input", () => {
    expect(() => normalizeDateTime("not-a-date")).toThrow(ValidationError);
  });

  it("throws ValidationError for empty string", () => {
    expect(() => normalizeDateTime("")).toThrow(ValidationError);
  });
});

describe("assertEndAfterStart", () => {
  it("accepts end strictly after start", () => {
    expect(() => assertEndAfterStart("2026-04-01T10:00:00Z", "2026-04-01T11:00:00Z")).not.toThrow();
  });

  it("rejects end before start", () => {
    expect(() => assertEndAfterStart("2026-04-01T10:00:00Z", "2026-04-01T09:00:00Z")).toThrow(
      ValidationError,
    );
  });

  it("rejects equal start and end by default", () => {
    expect(() => assertEndAfterStart("2026-04-01T10:00:00Z", "2026-04-01T10:00:00Z")).toThrow(
      ValidationError,
    );
  });

  it("rejects equivalent timestamps across different timezone offsets", () => {
    expect(() => assertEndAfterStart("2026-04-01T12:00:00+02:00", "2026-04-01T10:00:00Z")).toThrow(
      ValidationError,
    );
  });

  it("allows equal start and end when allowEqual is true", () => {
    expect(() =>
      assertEndAfterStart("2026-04-01T10:00:00Z", "2026-04-01T10:00:00Z", { allowEqual: true }),
    ).not.toThrow();
  });

  it("still rejects end before start when allowEqual is true", () => {
    expect(() =>
      assertEndAfterStart("2026-04-01T10:00:00Z", "2026-04-01T09:59:59Z", { allowEqual: true }),
    ).toThrow(ValidationError);
  });
});
