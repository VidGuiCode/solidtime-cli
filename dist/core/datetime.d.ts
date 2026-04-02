/**
 * Format a Date object as UTC without milliseconds: YYYY-MM-DDTHH:mm:ssZ
 */
export declare function toUTCString(date: Date): string;
/**
 * Parse any ISO 8601 datetime string and return UTC format (YYYY-MM-DDTHH:mm:ssZ).
 * Accepts Z suffix, +HH:MM offset, +HHMM offset, and bare datetimes.
 */
export declare function normalizeDateTime(input: string): string;
//# sourceMappingURL=datetime.d.ts.map