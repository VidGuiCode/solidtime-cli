import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("runtime flag detection", () => {
  let originalArgv: string[];

  beforeEach(() => {
    originalArgv = process.argv;
  });

  afterEach(() => {
    process.argv = originalArgv;
  });

  it("hasArg detects present flags", async () => {
    process.argv = ["node", "cli.js", "--dry-run"];
    // Re-import to get fresh module
    const { hasArg } = await import("../../src/core/runtime.js");
    expect(hasArg("--dry-run")).toBe(true);
  });

  it("hasArg returns false for missing flags", async () => {
    process.argv = ["node", "cli.js"];
    const { hasArg } = await import("../../src/core/runtime.js");
    expect(hasArg("--dry-run")).toBe(false);
  });

  it("wantsJson detects explicit and compact JSON modes", async () => {
    process.argv = ["node", "cli.js", "account", "list", "--compact"];
    const { wantsJson } = await import("../../src/core/runtime.js");
    expect(wantsJson()).toBe(true);
    expect(wantsJson({ json: true })).toBe(true);

    process.argv = ["node", "cli.js", "account", "list"];
    expect(wantsJson()).toBe(false);
  });
});
