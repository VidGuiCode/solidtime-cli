import { describe, it, expect } from "vitest";
import { SolidtimeApiError, SolidtimeApiRateLimitError } from "../../src/core/api-client.js";
import {
  getExitCode,
  getErrorMessage,
  ValidationError,
  NonInteractiveError,
} from "../../src/core/errors.js";

describe("getExitCode", () => {
  it("returns 4 for rate limit errors", () => {
    const err = new SolidtimeApiRateLimitError(429, "Too many requests", 60);
    expect(getExitCode(err)).toBe(4);
  });

  it("returns 2 for 401 auth errors", () => {
    const err = new SolidtimeApiError(401, "Unauthorized");
    expect(getExitCode(err)).toBe(2);
  });

  it("returns 2 for 403 auth errors", () => {
    const err = new SolidtimeApiError(403, "Forbidden");
    expect(getExitCode(err)).toBe(2);
  });

  it("returns 3 for validation errors", () => {
    expect(getExitCode(new ValidationError("bad input"))).toBe(3);
  });

  it("returns 3 for non-interactive errors", () => {
    expect(getExitCode(new NonInteractiveError("missing input"))).toBe(3);
  });

  it("returns 1 for generic errors", () => {
    expect(getExitCode(new Error("something broke"))).toBe(1);
  });

  it("returns 1 for non-error values", () => {
    expect(getExitCode("string error")).toBe(1);
  });
});

describe("getErrorMessage", () => {
  it("includes hint for 401 errors", () => {
    const err = new SolidtimeApiError(401, "Unauthorized");
    const msg = getErrorMessage(err);
    expect(msg).toContain("Unauthorized");
    expect(msg).toContain("solidtime login");
  });

  it("includes hint for 404 time-entry errors", () => {
    const err = new SolidtimeApiError(404, "Not found", "GET", "organizations/x/time-entries/y");
    const msg = getErrorMessage(err);
    expect(msg).toContain("Time entry not found");
  });

  it("includes hint for 404 project errors", () => {
    const err = new SolidtimeApiError(404, "Not found", "GET", "organizations/x/projects/y");
    const msg = getErrorMessage(err);
    expect(msg).toContain("solidtime project list");
  });

  it("returns plain message for generic errors", () => {
    expect(getErrorMessage(new Error("oops"))).toBe("oops");
  });

  it("stringifies non-error values", () => {
    expect(getErrorMessage(42)).toBe("42");
  });
});
