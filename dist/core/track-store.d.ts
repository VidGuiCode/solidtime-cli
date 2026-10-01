import { SolidtimeApiClient } from "./api-client.js";
import type { SolidtimeConfig } from "./types.js";
/** One locally running timer. Only finished entries are sent to Solidtime,
 * so several tracks can run in parallel on one account. */
export interface SolidtimeTrack {
    id: string;
    /** UTC start time (YYYY-MM-DDTHH:mm:ssZ). */
    start: string;
    description: string;
    project_id: string | null;
    task_id: string | null;
    tags: string[];
    billable: boolean;
    label: string | null;
    /** Profile name the track was started with, so stop posts to the same
     * account even if `account use` changed in between. Null when the track
     * was started from environment variables. */
    account: string | null;
    organization: string;
    member_id: string;
    created_by_pid: number;
    hostname: string;
}
export declare function isValidTrackId(id: string): boolean;
export declare function newTrackId(): string;
export declare function getTrackDir(): string;
export declare function writeTrack(track: SolidtimeTrack): void;
export declare function readTrack(id: string): SolidtimeTrack | null;
/** List all running tracks. Files that do not look like track files are
 * ignored; unparseable track files are skipped with a warning on stderr. */
export declare function listTracks(): SolidtimeTrack[];
export declare function deleteTrack(id: string): void;
export declare function trackElapsedSeconds(track: SolidtimeTrack, now?: Date): number;
export declare function getStaleHours(): number;
export declare function isTrackStale(track: SolidtimeTrack, staleHours: number, now?: Date): boolean;
export declare function formatElapsed(seconds: number): string;
/** Build a track record for `track start`. */
export declare function createTrackRecord(fields: {
    description: string;
    projectId: string | null;
    taskId: string | null;
    tags: string[];
    billable: boolean;
    label: string | null;
    account: string | null;
    organization: string;
    memberId: string;
}): SolidtimeTrack;
/** Client for posting a finished track: the stored profile wins over env vars,
 * so `stop` posts to the same account the track was started with even if the
 * environment or `account use` changed in between. */
export declare function createClientForTrack(config: SolidtimeConfig, track: SolidtimeTrack): SolidtimeApiClient;
//# sourceMappingURL=track-store.d.ts.map