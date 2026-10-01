import { SolidtimeApiError, SolidtimeApiRateLimitError } from "./api-client.js";
import { printError, printErrorJson } from "./output.js";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class NonInteractiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonInteractiveError";
  }
}

export function getExitCode(error: unknown): number {
  if (error instanceof SolidtimeApiRateLimitError) return 4;
  if (error instanceof SolidtimeApiError && (error.status === 401 || error.status === 403))
    return 2;
  if (error instanceof ValidationError || error instanceof NonInteractiveError) return 3;
  return 1;
}

function getStatusHint(status: number, path?: string): string | null {
  switch (status) {
    case 401:
      return "Authentication failed. Your API token may be expired or invalid. Run: solidtime login";
    case 403:
      return "Access denied. You may not have permission for this resource.";
    case 404: {
      if (path?.includes("time-entries/")) return "Time entry not found.";
      if (path?.includes("projects/"))
        return "Project not found. Check with: solidtime project list";
      if (path?.includes("tasks/")) return "Task not found. Check with: solidtime task list";
      return "Resource not found. Verify the organization and resource identifiers.";
    }
    case 429:
      return "Rate limited. Wait a moment and retry.";
    default:
      return null;
  }
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof SolidtimeApiError) {
    const hint = getStatusHint(error.status, error.path);
    return hint ? `${error.message}\n  Hint: ${hint}` : error.message;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

export function exitWithError(error: unknown, json = false): never {
  if (json) {
    printErrorJson(error);
  } else {
    printError(getErrorMessage(error));
  }
  process.exit(getExitCode(error));
}
