import { SolidtimeApiError, SolidtimeApiRateLimitError } from "./api-client.js";
import { printError, printErrorJson } from "./output.js";
export class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = "ValidationError";
    }
}
export class NonInteractiveError extends Error {
    constructor(message) {
        super(message);
        this.name = "NonInteractiveError";
    }
}
const API_ERROR_KEY_MESSAGES = {
    time_entry_still_running: "A timer is already running, stop it with `te stop` (check `te active` for its ID).",
    time_entry_can_not_be_restarted: "A finished time entry cannot be restarted. Start a new timer with `te start`.",
    time_entry_member_can_not_be_changed_while_running: "Cannot change the member of a running time entry. Stop it first with `te stop`.",
    overlapping_time_entry: "Time entry overlaps an existing entry (prevent_overlapping_time_entries is enabled for this organization).",
    feature_is_not_available_in_free_plan: "This feature is not available on the current Solidtime plan.",
};
export function isKnownApiErrorKey(key) {
    return key !== undefined && Object.prototype.hasOwnProperty.call(API_ERROR_KEY_MESSAGES, key);
}
export function getExitCode(error) {
    if (error instanceof SolidtimeApiRateLimitError)
        return 4;
    if (error instanceof SolidtimeApiError && (error.status === 401 || error.status === 403))
        return 2;
    if (error instanceof SolidtimeApiError && isKnownApiErrorKey(error.key))
        return 3;
    if (error instanceof ValidationError || error instanceof NonInteractiveError)
        return 3;
    return 1;
}
function getMappedApiErrorMessage(error) {
    if (!error.key || !isKnownApiErrorKey(error.key))
        return null;
    if (error.key === "time_entry_still_running" &&
        error.details &&
        typeof error.details === "object" &&
        "active_time_entry_id" in error.details &&
        typeof error.details.active_time_entry_id ===
            "string" &&
        error.details.active_time_entry_id.length > 0) {
        const activeId = error.details.active_time_entry_id;
        return `A timer is already running (${activeId}), stop it with \`te stop\``;
    }
    return API_ERROR_KEY_MESSAGES[error.key];
}
function getStatusHint(status, path) {
    switch (status) {
        case 401:
            return "Authentication failed. Your API token may be expired or invalid. Run: solidtime login";
        case 403:
            return "Access denied. You may not have permission for this resource.";
        case 404: {
            if (path?.includes("time-entries/"))
                return "Time entry not found.";
            if (path?.includes("projects/"))
                return "Project not found. Check with: solidtime project list";
            if (path?.includes("tasks/"))
                return "Task not found. Check with: solidtime task list";
            return "Resource not found. Verify the organization and resource identifiers.";
        }
        case 429:
            return "Rate limited. Wait a moment and retry.";
        default:
            return null;
    }
}
export function getErrorMessage(error) {
    if (error instanceof SolidtimeApiError) {
        const mapped = getMappedApiErrorMessage(error);
        if (mapped)
            return mapped;
        const hint = getStatusHint(error.status, error.path);
        return hint ? `${error.message}\n  Hint: ${hint}` : error.message;
    }
    if (error instanceof Error)
        return error.message;
    return String(error);
}
export function exitWithError(error, json = false) {
    if (json) {
        printErrorJson(error, getErrorMessage(error));
    }
    else {
        printError(getErrorMessage(error));
    }
    process.exitCode = getExitCode(error);
}
//# sourceMappingURL=errors.js.map