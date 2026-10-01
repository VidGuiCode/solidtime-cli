import { ValidationError } from "./errors.js";
/**
 * Format a Date object as UTC without milliseconds: YYYY-MM-DDTHH:mm:ssZ
 */
export function toUTCString(date) {
    return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}
/**
 * Parse any ISO 8601 datetime string and return UTC format (YYYY-MM-DDTHH:mm:ssZ).
 * Accepts Z suffix, +HH:MM offset, +HHMM offset, and bare datetimes.
 */
export function normalizeDateTime(input) {
    const d = new Date(input);
    if (isNaN(d.getTime())) {
        throw new ValidationError(`Invalid datetime: "${input}". Expected ISO 8601 (e.g. 2026-04-01T12:00:00Z or 2026-04-01T14:00:00+02:00)`);
    }
    return toUTCString(d);
}
/**
 * Parse a human duration and return seconds.
 * Accepts plain seconds ("5400") or d/h/m/s components ("90m", "1h30m", "2h").
 */
export function parseDurationSeconds(input) {
    const trimmed = input.trim();
    if (/^\d+$/.test(trimmed))
        return Number(trimmed);
    const match = trimmed.match(/^((\d+)d)?((\d+)h)?((\d+)m)?((\d+)s)?$/i);
    const hasComponent = match && match.slice(2).some((g) => g !== undefined);
    if (!match || !hasComponent) {
        throw new ValidationError(`Invalid duration: "${input}". Examples: 90m, 1h30m, 2h, or plain seconds (5400)`);
    }
    const [, , d, , h, , m, , s] = match;
    return Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
}
//# sourceMappingURL=datetime.js.map