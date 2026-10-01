import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SolidtimeApiClient } from "./api-client.js";
import { ValidationError } from "./errors.js";
import { toUTCString } from "./datetime.js";
import { requireActiveAccount } from "./config-store.js";
const TRACK_ID_RE = /^[a-z2-7]{8}$/;
const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";
export function isValidTrackId(id) {
    return TRACK_ID_RE.test(id);
}
export function newTrackId() {
    const bytes = crypto.randomBytes(8);
    let id = "";
    for (let i = 0; i < 8; i++) {
        id += BASE32[bytes[i] % 32];
    }
    return id;
}
export function getTrackDir() {
    if (process.env.SOLIDTIME_TRACK_DIR) {
        return process.env.SOLIDTIME_TRACK_DIR;
    }
    return path.join(os.homedir(), ".solidtime-cli", "tracks");
}
function trackPath(id) {
    if (!isValidTrackId(id)) {
        throw new ValidationError(`Invalid track id "${id}". Track ids are 8 characters from a-z and 2-7.`);
    }
    return path.join(getTrackDir(), `${id}.json`);
}
export function writeTrack(track) {
    const dir = getTrackDir();
    fs.mkdirSync(dir, { recursive: true });
    // Atomic write: temp file + rename, so a crash mid-write cannot leave a
    // half-written track file behind.
    const tmp = path.join(dir, `${track.id}.json.tmp-${process.pid}-${crypto.randomBytes(4).toString("hex")}`);
    fs.writeFileSync(tmp, JSON.stringify(track, null, 2), "utf-8");
    fs.renameSync(tmp, path.join(dir, `${track.id}.json`));
}
export function readTrack(id) {
    const file = trackPath(id);
    if (!fs.existsSync(file))
        return null;
    return parseTrackFile(file);
}
function parseTrackFile(file) {
    let parsed;
    try {
        parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    }
    catch {
        throw new ValidationError(`Track file is not valid JSON: ${file}. Fix or delete it, or run: solidtime track cancel <id>`);
    }
    return parsed;
}
/** List all running tracks. Files that do not look like track files are
 * ignored; unparseable track files are skipped with a warning on stderr. */
export function listTracks() {
    const dir = getTrackDir();
    if (!fs.existsSync(dir))
        return [];
    const tracks = [];
    for (const entry of fs.readdirSync(dir)) {
        if (!entry.endsWith(".json"))
            continue;
        const base = entry.slice(0, -".json".length);
        if (!TRACK_ID_RE.test(base))
            continue;
        // base is strictly ^[a-z2-7]{8}$, so it cannot traverse directories.
        const file = path.join(dir, `${base}.json`);
        try {
            tracks.push(parseTrackFile(file));
        }
        catch (err) {
            if (err instanceof ValidationError) {
                console.error(`Warning: skipping ${entry}: ${err.message}`);
                continue;
            }
            throw err;
        }
    }
    return tracks.sort((a, b) => a.start.localeCompare(b.start));
}
export function deleteTrack(id) {
    fs.rmSync(trackPath(id), { force: true });
}
export function trackElapsedSeconds(track, now = new Date()) {
    return Math.max(0, Math.floor((now.getTime() - new Date(track.start).getTime()) / 1000));
}
export function getStaleHours() {
    const raw = process.env.SOLIDTIME_TRACK_STALE_HOURS;
    if (raw === undefined || raw === "")
        return 12;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
        throw new ValidationError(`Invalid SOLIDTIME_TRACK_STALE_HOURS: "${raw}". Expected a number of hours (e.g. 12).`);
    }
    return value;
}
export function isTrackStale(track, staleHours, now = new Date()) {
    return trackElapsedSeconds(track, now) > staleHours * 3600;
}
export function formatElapsed(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0)
        return `${h}h ${m}m`;
    if (m > 0)
        return `${m}m ${s}s`;
    return `${s}s`;
}
/** Build a track record for `track start`. */
export function createTrackRecord(fields) {
    return {
        id: newTrackId(),
        start: toUTCString(new Date()),
        description: fields.description,
        project_id: fields.projectId,
        task_id: fields.taskId,
        tags: fields.tags,
        billable: fields.billable,
        label: fields.label,
        account: fields.account,
        organization: fields.organization,
        member_id: fields.memberId,
        created_by_pid: process.pid,
        hostname: os.hostname(),
    };
}
/** Client for posting a finished track: the stored profile wins over env vars,
 * so `stop` posts to the same account the track was started with even if the
 * environment or `account use` changed in between. */
export function createClientForTrack(config, track) {
    if (track.account) {
        const profile = config.profiles.find((p) => p.name === track.account);
        if (!profile) {
            throw new ValidationError(`Track was started with account "${track.account}", which no longer exists. ` +
                `Re-add or select that account, or delete the track with: solidtime track cancel ${track.id}`);
        }
        return new SolidtimeApiClient({ baseUrl: profile.baseUrl, token: profile.token });
    }
    const envUrl = process.env.SOLIDTIME_BASE_URL;
    const envToken = process.env.SOLIDTIME_API_TOKEN;
    if (envUrl && envToken) {
        return new SolidtimeApiClient({ baseUrl: envUrl, token: envToken });
    }
    const account = requireActiveAccount(config);
    return new SolidtimeApiClient({ baseUrl: account.baseUrl, token: account.token });
}
//# sourceMappingURL=track-store.js.map