import { ValidationError } from "./errors.js";

/**
 * Format a Date object as UTC without milliseconds: YYYY-MM-DDTHH:mm:ssZ
 */
export function toUTCString(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Parse any ISO 8601 datetime string and return UTC format (YYYY-MM-DDTHH:mm:ssZ).
 * Accepts Z suffix, +HH:MM offset, +HHMM offset, and bare datetimes.
 */
export function normalizeDateTime(input: string): string {
  const d = new Date(input);
  if (isNaN(d.getTime())) {
    throw new ValidationError(
      `Invalid datetime: "${input}". Expected ISO 8601 (e.g. 2026-04-01T12:00:00Z or 2026-04-01T14:00:00+02:00)`,
    );
  }
  return toUTCString(d);
}
