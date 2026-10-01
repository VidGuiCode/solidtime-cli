/**
 * Format a Date object as UTC without milliseconds: YYYY-MM-DDTHH:mm:ssZ
 */
export declare function toUTCString(date: Date): string;
/**
 * Parse any ISO 8601 datetime string and return UTC format (YYYY-MM-DDTHH:mm:ssZ).
 * Accepts Z suffix, +HH:MM offset, +HHMM offset, and bare datetimes.
 */
export declare function normalizeDateTime(input: string): string;
/**
 * Parse a human duration and return seconds.
 * Accepts plain seconds ("5400") or d/h/m/s components ("90m", "1h30m", "2h").
 */
export declare function parseDurationSeconds(input: string): number;
//# sourceMappingURL=datetime.d.ts.map