import { SolidtimeApiClient } from "./api-client.js";
import type { SolidtimeTimeEntry } from "./types.js";
export interface TimeEntryCreateBody {
    member_id: string;
    description: string;
    start: string;
    end: string;
    project_id: string | null;
    task_id: string | null;
    tags: string[];
    billable: boolean;
}
/**
 * Look for an existing finished entry with the same member, start and
 * description — the signature a retried or lost-response create would leave
 * behind. The start/end query is a window filter; the exact match happens
 * client-side.
 */
export declare function findExistingTimeEntry(client: SolidtimeApiClient, org: string, match: {
    memberId: string;
    start: string;
    end: string;
    description: string;
}): Promise<SolidtimeTimeEntry | null>;
/**
 * POST a finished time entry with duplicate protection: when the request
 * fails in a way that may have reached the server (5xx, lost connection), look
 * for the entry before reporting failure. Returns the created entry and
 * whether it was recovered from the server instead of newly created.
 */
export declare function createTimeEntryWithDedupe(client: SolidtimeApiClient, org: string, body: TimeEntryCreateBody): Promise<{
    entry: SolidtimeTimeEntry;
    deduped: boolean;
}>;
//# sourceMappingURL=time-entries.d.ts.map