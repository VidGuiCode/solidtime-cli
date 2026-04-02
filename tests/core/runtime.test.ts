import { describe, it, expect, beforeEach } from "vitest";

describe("runtime flag detection", () => {
  let originalArgv: string[];

  beforeEach(() => {
    originalArgv = process.argv;
  });

  it("hasArg detects present flags", async () => {
    process.argv = ["node", "cli.js", "--dry-run"];
    // Re-import to get fresh module
    const { hasArg } = await import("../../src/core/runtime.js");
    expect(hasArg("--dry-run")).toBe(true);
    process.argv = originalArgv;
  });

  it("hasArg returns false for missing flags", async () => {
    process.argv = ["node", "cli.js"];
    const { hasArg } = await import("../../src/core/runtime.js");
    expect(hasArg("--dry-run")).toBe(false);
    process.argv = originalArgv;
  });
});
