import { Command } from "commander";
import { SUPPORTED_SHELLS, generateCompletionScript, isSupportedShell, } from "../core/completion.js";
import { exitWithError, ValidationError } from "../core/errors.js";
export function createCompletionCommand(program) {
    return new Command("completion")
        .description("Generate shell completion script")
        .argument("<shell>", `shell type (${SUPPORTED_SHELLS.join(" | ")})`)
        .action((shell) => {
        try {
            if (!isSupportedShell(shell)) {
                throw new ValidationError(`Unsupported shell: "${shell}". Supported shells: ${SUPPORTED_SHELLS.join(", ")}`);
            }
            const script = generateCompletionScript(program, shell);
            console.log(script);
        }
        catch (error) {
            if (error instanceof ValidationError) {
                exitWithError(error);
                return;
            }
            const message = error instanceof Error ? error.message : String(error);
            exitWithError(new Error(`Failed to generate completion script: ${message}`));
        }
    });
}
//# sourceMappingURL=completion.js.map