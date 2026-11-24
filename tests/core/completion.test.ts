import { describe, expect, it } from "vitest";
import { createProgram } from "../../src/program.js";
import {
  SUPPORTED_SHELLS,
  collectCommandTree,
  generateCompletionScript,
  isSupportedShell,
} from "../../src/core/completion.js";

describe("isSupportedShell", () => {
  it("accepts bash, zsh, fish, powershell", () => {
    for (const shell of ["bash", "zsh", "fish", "powershell"]) {
      expect(isSupportedShell(shell)).toBe(true);
    }
  });

  it("rejects unsupported shells", () => {
    expect(isSupportedShell("nushell")).toBe(false);
    expect(isSupportedShell("")).toBe(false);
  });
});

describe("generateCompletionScript", () => {
  const program = createProgram();
  const tree = collectCommandTree(program);

  it.each(SUPPORTED_SHELLS)(
    "includes every top-level command, alias, subcommand, and key long options for %s",
    (shell) => {
      const script = generateCompletionScript(program, shell);

      for (const cmd of tree.subcommands) {
        expect(script).toContain(cmd.name);
        for (const alias of cmd.aliases) {
          expect(script).toContain(alias);
        }
        for (const sub of cmd.subcommands) {
          expect(script).toContain(sub.name);
        }
      }

      for (const alias of ["te", "org", "pm", "invite"]) {
        expect(script).toContain(alias);
      }

      for (const longOpt of ["--description", "--project", "--create-missing-tags", "--dry-run"]) {
        const expectedToken = shell === "fish" ? `-l "${longOpt.slice(2)}"` : longOpt;
        expect(script).toContain(expectedToken);
      }
    },
  );
});
