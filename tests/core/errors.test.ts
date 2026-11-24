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

  it("returns 3 for known Solidtime 0.22 API error keys", () => {
    for (const key of [
      "time_entry_still_running",
      "time_entry_can_not_be_restarted",
      "time_entry_member_can_not_be_changed_while_running",
      "overlapping_time_entry",
      "feature_is_not_available_in_free_plan",
    ]) {
      const err = new SolidtimeApiError(400, "error", "POST", "time-entries", {}, key);
      expect(getExitCode(err)).toBe(3);
    }
  });

  it("returns 1 for unknown API error keys", () => {
    const err = new SolidtimeApiError(400, "error", "POST", "time-entries", {}, "some_other_key");
    expect(getExitCode(err)).toBe(1);
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

  it("maps time_entry_still_running with active ID", () => {
    const err = new SolidtimeApiError(
      400,
      "{}",
      "POST",
      "time-entries",
      { active_time_entry_id: "entry-123" },
      "time_entry_still_running",
    );
    expect(getErrorMessage(err)).toBe(
      "A timer is already running (entry-123), stop it with `te stop`",
    );
  });

  it("maps all known 0.22 API error keys to clear one-line messages", () => {
    const cases: Array<[string, string]> = [
      ["time_entry_still_running", "timer is already running"],
      ["time_entry_can_not_be_restarted", "cannot be restarted"],
      ["time_entry_member_can_not_be_changed_while_running", "Cannot change the member"],
      ["overlapping_time_entry", "overlaps an existing entry"],
      ["feature_is_not_available_in_free_plan", "not available on the current Solidtime plan"],
    ];
    for (const [key, expected] of cases) {
      const err = new SolidtimeApiError(400, "{}", "POST", "time-entries", {}, key);
      const msg = getErrorMessage(err);
      expect(msg).toContain(expected);
      expect(msg).not.toContain("\n");
    }
  });

  it("falls back to raw message for unknown API error keys", () => {
    const err = new SolidtimeApiError(
      400,
      "raw failure",
      "POST",
      "time-entries",
      {},
      "unknown_key",
    );
    expect(getErrorMessage(err)).toBe("API error 400: raw failure");
  });

  it("returns plain message for generic errors", () => {
    expect(getErrorMessage(new Error("oops"))).toBe("oops");
  });

  it("stringifies non-error values", () => {
    expect(getErrorMessage(42)).toBe("42");
  });
});
