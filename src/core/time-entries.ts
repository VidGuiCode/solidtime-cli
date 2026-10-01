import { SolidtimeApiClient, fetchAllOffsetLimit, mayHaveReachedServer } from "./api-client.js";
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
export async function findExistingTimeEntry(
  client: SolidtimeApiClient,
  org: string,
  match: { memberId: string; start: string; end: string; description: string },
): Promise<SolidtimeTimeEntry | null> {
  const params = new URLSearchParams();
  params.append("member_id", match.memberId);
  params.append("start", match.start);
  params.append("end", match.end);

  const entries = await fetchAllOffsetLimit<SolidtimeTimeEntry>(
    client,
    `organizations/${org}/time-entries?${params.toString()}`,
    100,
  );

  return (
    entries.find((e) => e.start === match.start && e.description === match.description) ?? null
  );
}

/**
 * POST a finished time entry with duplicate protection: when the request
 * fails in a way that may have reached the server (5xx, lost connection), look
 * for the entry before reporting failure. Returns the created entry and
 * whether it was recovered from the server instead of newly created.
 */
export async function createTimeEntryWithDedupe(
  client: SolidtimeApiClient,
  org: string,
  body: TimeEntryCreateBody,
): Promise<{ entry: SolidtimeTimeEntry; deduped: boolean }> {
  try {
    const res = await client.post<{ data: SolidtimeTimeEntry }>(
      `organizations/${org}/time-entries`,
      body,
    );
    return { entry: res.data, deduped: false };
  } catch (err) {
    if (!mayHaveReachedServer(err)) throw err;

    let existing: SolidtimeTimeEntry | null = null;
    try {
      existing = await findExistingTimeEntry(client, org, {
        memberId: body.member_id,
        start: body.start,
        end: body.end,
        description: body.description,
      });
    } catch {
      // Cannot verify against the server; report the original failure.
    }

    if (existing) return { entry: existing, deduped: true };
    throw err;
  }
}
