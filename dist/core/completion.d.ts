import type { Command } from "commander";
export type Shell = "bash" | "zsh" | "fish" | "powershell";
export declare const SUPPORTED_SHELLS: readonly Shell[];
export interface CompletionOption {
    long: string;
    description: string;
}
export interface CompletionCommandNode {
    name: string;
    aliases: string[];
    description: string;
    options: CompletionOption[];
    subcommands: CompletionCommandNode[];
}
export declare function isSupportedShell(value: string): value is Shell;
/**
 * Recursively walk a Commander command tree into a static data structure for
 * shell completion generators.
 */
export declare function collectCommandTree(cmd: Command): CompletionCommandNode;
export declare function generateCompletionScript(program: Command, shell: Shell): string;
//# sourceMappingURL=completion.d.ts.map