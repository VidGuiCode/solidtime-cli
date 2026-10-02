import crypto from "node:crypto";
import http from "node:http";

/**
 * Minimal in-process stand-in for a Solidtime server, used by the end-to-end
 * tests that drive the real CLI binary. It mirrors the parts of the Solidtime
 * API the CLI consumes, including the behaviours verified against the
 * Solidtime source code:
 * - one running entry per member (`time_entry_still_running`),
 * - `prevent_overlapping_time_entries` rejects overlapping finished entries of
 *   the same member (`overlapping_time_entry`, HTTP 400), while a running
 *   entry (end = null) never counts as overlapping,
 * - page-based pagination (`?page=N` with meta) for resources and
 *   offset/limit pagination for time entries.
 */

export const MOCK_TOKEN = "mock-api-token-123";

export interface MockFaults {
  /** Number of subsequent POSTs to time-entries that record the entry but
   * respond 500, simulating a lost response after the server processed it. */
  postTimeEntries500: number;
  /** Number of subsequent POSTs to time-entries that respond 400 (rejected,
   * never processed) without recording anything. */
  postTimeEntries400: number;
  /** Number of subsequent GETs that respond 429 with a Retry-After header. */
  get429Remaining: number;
  get429RetryAfter: number;
}

export interface MockRequestLog {
  method: string;
  url: string;
}

interface MockOrg {
  id: string;
  name: string;
  prevent_overlapping_time_entries: boolean;
  currency: string;
  currency_symbol: string;
}

interface MockEntry {
  id: string;
  member_id: string;
  description: string;
  start: string;
  end: string | null;
  project_id: string | null;
  task_id: string | null;
  tagIds: string[];
  billable: boolean;
}

interface MockNamed {
  id: string;
  name: string;
  [key: string]: unknown;
}

function uuid(suffix: number, group: string): string {
  return `${group}000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
}

const ORG_ACME = uuid(1, "0a");
const ORG_STRICT = uuid(2, "0a");
const USER_ID = uuid(1, "0b");
const MEMBER_ACME = uuid(1, "0c");
const MEMBER_STRICT = uuid(2, "0c");
const PROJ_A = uuid(1, "0d");
const PROJ_B = uuid(2, "0d");
const PROJ_C = uuid(3, "0d");
const TASK_1 = uuid(1, "0e");
const TASK_2 = uuid(2, "0e");
const TASK_3 = uuid(3, "0e");

export {
  ORG_ACME,
  ORG_STRICT,
  MEMBER_ACME,
  MEMBER_STRICT,
  PROJ_A,
  PROJ_B,
  PROJ_C,
  TASK_1,
  TASK_2,
  TASK_3,
};
const CLIENT_1 = uuid(1, "11");
const TAG_BASE = 0x100;
const ENTRY_BASE = 0x200;

const PER_PAGE = 15;

export class MockSolidtimeServer {
  private server: http.Server;
  private faults: MockFaults = {
    postTimeEntries500: 0,
    postTimeEntries400: 0,
    get429Remaining: 0,
    get429RetryAfter: 0,
  };
  private requests: MockRequestLog[] = [];
  private port: number | null = null;

  private orgs: MockOrg[] = [];
  private projects = new Map<string, MockNamed[]>();
  private tasks = new Map<string, MockNamed[]>();
  private tags = new Map<string, MockNamed[]>();
  private clients = new Map<string, MockNamed[]>();
  private entries = new Map<string, MockEntry[]>();

  constructor() {
    this.seed();
    this.server = http.createServer((req, res) => {
      void this.handle(req, res).catch((err: unknown) => {
        this.json(res, 500, { error: true, message: `mock failure: ${String(err)}` });
      });
    });
  }

  /** Bind to an ephemeral localhost port; call once before the tests run. */
  async start(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = this.server.address();
    if (!address || typeof address === "string") {
      throw new Error("Mock server did not bind to a TCP port");
    }
    this.port = address.port;
  }

  get baseUrl(): string {
    if (this.port === null) throw new Error("Mock server not started");
    return `http://127.0.0.1:${this.port}`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  /** Reset all data and faults to the seed state. */
  reset(): void {
    this.faults = {
      postTimeEntries500: 0,
      postTimeEntries400: 0,
      get429Remaining: 0,
      get429RetryAfter: 0,
    };
    this.requests = [];
    this.seed();
  }

  async getState(): Promise<{
    requests: MockRequestLog[];
    faults: MockFaults;
    entries: ReturnType<MockSolidtimeServer["entryJson"]>[];
  }> {
    return {
      requests: this.requests,
      faults: this.faults,
      entries: [...this.entries.values()].flatMap((list) => list.map((e) => this.entryJson(e))),
    };
  }

  async setFaults(patch: Partial<MockFaults>): Promise<void> {
    Object.assign(this.faults, patch);
  }

  private seed(): void {
    this.orgs = [
      {
        id: ORG_ACME,
        name: "Acme Ltd",
        prevent_overlapping_time_entries: false,
        currency: "EUR",
        currency_symbol: "€",
      },
      {
        id: ORG_STRICT,
        name: "Strict Org",
        prevent_overlapping_time_entries: true,
        currency: "USD",
        currency_symbol: "$",
      },
    ];
    this.projects = new Map([
      [
        ORG_ACME,
        [
          { id: PROJ_A, name: "Client & Sons <&>", color: "#ff0000", client_id: CLIENT_1 },
          { id: PROJ_B, name: "Website Redesign", color: "#00ff00", client_id: null },
          { id: PROJ_C, name: "Ωmega Ünicode", color: "#0000ff", client_id: null },
        ],
      ],
      [ORG_STRICT, []],
    ]);
    this.tasks = new Map([
      [
        ORG_ACME,
        [
          { id: TASK_1, name: "Design", project_id: PROJ_B, is_done: false },
          { id: TASK_2, name: "Implement feature X / v2", project_id: PROJ_B, is_done: false },
          { id: TASK_3, name: "Code review", project_id: PROJ_A, is_done: false },
        ],
      ],
      [ORG_STRICT, []],
    ]);
    this.clients = new Map([
      [
        ORG_ACME,
        [
          { id: CLIENT_1, name: "Müller & Co." },
          { id: uuid(2, "11"), name: "Acme <test>" },
        ],
      ],
      [ORG_STRICT, []],
    ]);
    const tagNames = [
      "human",
      "agent",
      "claude",
      "tag with spaces",
      "日本語 + 🕐",
      ...Array.from({ length: 15 }, (_, i) => `filler-tag-${String(i + 1).padStart(2, "0")}`),
    ];
    this.tags = new Map([
      [
        ORG_ACME,
        tagNames.map((name, i) => ({
          id: uuid(TAG_BASE + i + 1, "0f"),
          name,
        })),
      ],
      [ORG_STRICT, []],
    ]);
    this.entries = new Map([[ORG_ACME, this.seedEntries()]]);
  }

  private seedEntries(): MockEntry[] {
    const mk = (n: number, fields: Omit<MockEntry, "id">): MockEntry => ({
      id: uuid(ENTRY_BASE + n, "10"),
      ...fields,
    });
    const tagId = (name: string): string => {
      const found = this.tags.get(ORG_ACME)?.find((t) => t.name === name);
      if (!found) throw new Error(`seed tag missing: ${name}`);
      return found.id;
    };
    return [
      mk(1, {
        member_id: MEMBER_ACME,
        description: "Morning work",
        start: "2026-10-01T08:00:00Z",
        end: "2026-10-01T09:00:00Z",
        project_id: PROJ_A,
        task_id: TASK_3,
        tagIds: [tagId("human")],
        billable: true,
      }),
      mk(2, {
        member_id: MEMBER_ACME,
        description: "Agent build",
        start: "2026-10-01T09:00:00Z",
        end: "2026-10-01T11:00:00Z",
        project_id: PROJ_B,
        task_id: TASK_2,
        tagIds: [tagId("agent"), tagId("claude")],
        billable: false,
      }),
      mk(3, {
        member_id: MEMBER_ACME,
        description: "Misc",
        start: "2026-10-01T11:00:00Z",
        end: "2026-10-01T11:30:00Z",
        project_id: PROJ_B,
        task_id: null,
        tagIds: [tagId("tag with spaces")],
        billable: false,
      }),
      mk(4, {
        member_id: MEMBER_ACME,
        description: "Untracked admin",
        start: "2026-10-01T12:00:00Z",
        end: "2026-10-01T13:00:00Z",
        project_id: null,
        task_id: null,
        tagIds: [],
        billable: false,
      }),
    ];
  }

  private json(res: http.ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  }

  private paginated(res: http.ServerResponse, items: unknown[], page: number): void {
    const lastPage = Math.max(1, Math.ceil(items.length / PER_PAGE));
    const slice = items.slice((page - 1) * PER_PAGE, page * PER_PAGE);
    this.json(res, 200, {
      data: slice,
      links: {
        first: null,
        last: null,
        prev: page > 1 ? "prev" : null,
        next: page < lastPage ? "next" : null,
      },
      meta: {
        current_page: page,
        from: slice.length > 0 ? (page - 1) * PER_PAGE + 1 : null,
        last_page: lastPage,
        per_page: PER_PAGE,
        to: slice.length > 0 ? (page - 1) * PER_PAGE + slice.length : null,
        total: items.length,
      },
    });
  }

  private entryJson(e: MockEntry): Record<string, unknown> {
    const tagNames = (this.tags.get(ORG_ACME) ?? [])
      .filter((t) => e.tagIds.includes(t.id))
      .map((t) => t.name);
    return {
      id: e.id,
      member_id: e.member_id,
      user_id: USER_ID,
      description: e.description,
      start: e.start,
      end: e.end,
      duration: e.end ? (new Date(e.end).getTime() - new Date(e.start).getTime()) / 1000 : 0,
      project_id: e.project_id,
      task_id: e.task_id,
      organization_id: ORG_ACME,
      tags: tagNames,
      billable: e.billable,
    };
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const segments = url.pathname
      .split("/")
      .filter(Boolean)
      .map((s) => decodeURIComponent(s));

    this.requests.push({ method: req.method ?? "GET", url: url.pathname + url.search });

    if (segments[0] === "__control") {
      await this.handleControl(req, res, segments[1] ?? "");
      return;
    }

    if (segments[0] !== "api" || segments[1] !== "v1") {
      this.json(res, 404, { error: true, message: "Not found (mock)" });
      return;
    }
    const rest = segments.slice(2);

    const auth = req.headers.authorization;
    if (auth !== `Bearer ${MOCK_TOKEN}`) {
      this.json(res, 401, { error: true, message: "Unauthenticated." });
      return;
    }

    const body = await this.readBody(req);

    if (req.method === "GET" && this.faults.get429Remaining > 0) {
      this.faults.get429Remaining -= 1;
      res.writeHead(429, {
        "Content-Type": "text/plain",
        "Retry-After": String(this.faults.get429RetryAfter),
      });
      res.end("Too Many Attempts.");
      return;
    }

    this.route(req, res, rest, url, body);
  }

  private readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf-8");
        if (!raw) {
          resolve({});
          return;
        }
        try {
          resolve(JSON.parse(raw) as Record<string, unknown>);
        } catch {
          reject(new Error("invalid JSON body"));
        }
      });
      req.on("error", reject);
    });
  }

  private async handleControl(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    action: string,
  ): Promise<void> {
    if (action === "state" && req.method === "GET") {
      this.json(res, 200, await this.getState());
      return;
    }
    if (action === "faults" && req.method === "POST") {
      const body = await this.readBody(req);
      await this.setFaults(body as Partial<MockFaults>);
      this.json(res, 200, { ok: true, faults: this.faults });
      return;
    }
    if (action === "reset" && req.method === "POST") {
      this.reset();
      this.json(res, 200, { ok: true });
      return;
    }
    this.json(res, 404, { error: true, message: "Unknown control action" });
  }

  private route(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    rest: string[],
    url: URL,
    body: Record<string, unknown>,
  ): void {
    // users/me, users/me/memberships, users/me/time-entries/active
    if (rest[0] === "users" && rest[1] === "me") {
      if (rest[2] === "memberships" && req.method === "GET") {
        this.json(res, 200, {
          data: [
            {
              id: MEMBER_ACME,
              role: "owner",
              organization: { ...this.orgs[0], is_personal: true },
            },
            {
              id: MEMBER_STRICT,
              role: "owner",
              organization: { ...this.orgs[1], is_personal: false },
            },
          ],
        });
        return;
      }
      if (rest[2] === "time-entries" && rest[3] === "active" && req.method === "GET") {
        const all = [...this.entries.values()].flat();
        const running = all.find((e) => e.end === null);
        if (!running) {
          this.json(res, 404, { error: true, message: "No active time entry" });
          return;
        }
        this.json(res, 200, { data: this.entryJson(running) });
        return;
      }
      if (rest[2] === undefined && req.method === "GET") {
        this.json(res, 200, {
          data: {
            id: USER_ID,
            name: "Smoke Tester",
            email: "smoke@example.com",
            timezone: "UTC",
            week_start: "monday",
          },
        });
        return;
      }
    }

    if (rest[0] === "organizations" && rest[1]) {
      const orgId = rest[1];
      const org = this.orgs.find((o) => o.id === orgId);
      if (!org) {
        this.json(res, 404, { error: true, message: "Organization not found (mock)" });
        return;
      }
      this.routeOrg(req, res, org, rest.slice(2), url, body);
      return;
    }

    this.json(res, 404, {
      error: true,
      message: `No mock handler for ${req.method} ${url.pathname}`,
    });
  }

  private routeOrg(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    org: MockOrg,
    rest: string[],
    url: URL,
    body: Record<string, unknown>,
  ): void {
    // organizations/:org
    if (rest.length === 0) {
      if (req.method === "GET") {
        this.json(res, 200, { data: org });
        return;
      }
      if (req.method === "PUT") {
        Object.assign(org, body);
        this.json(res, 200, { data: org });
        return;
      }
    }

    // organizations/:org/members
    if (rest[0] === "members" && req.method === "GET") {
      this.paginated(
        res,
        [
          {
            id: MEMBER_ACME,
            user_id: USER_ID,
            name: "Smoke Tester",
            email: "smoke@example.com",
            role: "owner",
            is_placeholder: false,
            billable_rate: null,
          },
        ],
        1,
      );
      return;
    }

    // organizations/:org/invitations
    if (rest[0] === "invitations" && req.method === "GET") {
      this.paginated(res, [], 1);
      return;
    }

    // organizations/:org/projects/:id/project-members
    if (rest[0] === "projects" && rest[2] === "project-members" && req.method === "GET") {
      this.paginated(res, [], 1);
      return;
    }

    if (
      rest[0] === "projects" ||
      rest[0] === "tasks" ||
      rest[0] === "tags" ||
      rest[0] === "clients"
    ) {
      this.routeNamedCollection(req, res, org, rest[0], rest.slice(1), url, body);
      return;
    }

    if (rest[0] === "time-entries") {
      this.routeTimeEntries(req, res, org, rest.slice(1), url, body);
      return;
    }

    this.json(res, 404, {
      error: true,
      message: `No mock org handler for ${req.method} ${url.pathname}`,
    });
  }

  private collectionKey(kind: string): Map<string, MockNamed[]> {
    if (kind === "projects") return this.projects;
    if (kind === "tasks") return this.tasks;
    if (kind === "tags") return this.tags;
    return this.clients;
  }

  private routeNamedCollection(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    org: MockOrg,
    kind: string,
    rest: string[],
    url: URL,
    body: Record<string, unknown>,
  ): void {
    const store = this.collectionKey(kind);
    const items = store.get(org.id) ?? [];

    if (rest.length === 0 && req.method === "GET") {
      const page = Number(url.searchParams.get("page") ?? "1");
      let filtered = items;
      if (kind === "tasks" && url.searchParams.get("project_id")) {
        const pid = url.searchParams.get("project_id");
        filtered = items.filter((t) => t.project_id === pid);
      }
      this.paginated(res, filtered, page);
      return;
    }

    if (rest.length === 0 && req.method === "POST") {
      const name = body.name;
      if (typeof name !== "string" || name.length === 0) {
        this.json(res, 422, { message: "The name field is required." });
        return;
      }
      const created: MockNamed = { id: crypto.randomUUID(), name, ...body };
      if (kind === "tasks") {
        created.project_id = body.project_id ?? null;
      }
      items.push(created);
      store.set(org.id, items);
      this.json(res, 201, { data: created });
      return;
    }

    const id = rest[0];
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) {
      this.json(res, 404, { error: true, message: `${kind} not found (mock)` });
      return;
    }
    if (req.method === "GET") {
      this.json(res, 200, { data: items[index] });
      return;
    }
    if (req.method === "PUT" || req.method === "PATCH") {
      items[index] = { ...items[index], ...body };
      this.json(res, 200, { data: items[index] });
      return;
    }
    if (req.method === "DELETE") {
      items.splice(index, 1);
      res.writeHead(204).end();
      return;
    }
    this.json(res, 405, { error: true, message: "Method not allowed (mock)" });
  }

  /** Overlap check mirroring Solidtime's TimeEntryController::assertNoOverlap:
   * only active when the org flag is set, scoped to one member, and running
   * entries (end = null) are never an overlap. */
  private overlapsExisting(
    org: MockOrg,
    memberId: string,
    start: string,
    end: string | null,
    excludeId?: string,
  ): boolean {
    if (!org.prevent_overlapping_time_entries) return false;
    const entries = this.entries.get(org.id) ?? [];
    const startDate = new Date(start).getTime();
    const endDate = end === null ? null : new Date(end).getTime();
    return entries.some((e) => {
      if (e.member_id !== memberId || e.id === excludeId || e.end === null) return false;
      const eStart = new Date(e.start).getTime();
      const eEnd = new Date(e.end).getTime();
      const straddlesStart = eEnd > startDate && eStart < startDate;
      if (endDate === null) return straddlesStart;
      const straddlesEnd = eStart < endDate && eEnd > endDate;
      const containedInNew = eStart >= startDate && eEnd <= endDate;
      return straddlesStart || straddlesEnd || containedInNew;
    });
  }

  private routeTimeEntries(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    org: MockOrg,
    rest: string[],
    url: URL,
    body: Record<string, unknown>,
  ): void {
    const entries = this.entries.get(org.id) ?? [];

    // aggregate
    if (rest[0] === "aggregate" && req.method === "GET") {
      this.aggregate(res, org, url);
      return;
    }

    if (rest.length === 0 && req.method === "GET") {
      const memberId = url.searchParams.get("member_id");
      const start = url.searchParams.get("start");
      const end = url.searchParams.get("end");
      const active = url.searchParams.get("active") === "true";
      const billable = url.searchParams.get("billable");
      const projectIds = url.searchParams.getAll("project_ids[]");
      const taskIds = url.searchParams.getAll("task_ids[]");
      const tagIds = url.searchParams.getAll("tag_ids[]");
      const limit = Number(url.searchParams.get("limit") ?? "500");
      const offset = Number(url.searchParams.get("offset") ?? "0");

      let filtered = entries;
      if (memberId) filtered = filtered.filter((e) => e.member_id === memberId);
      if (start) filtered = filtered.filter((e) => e.start >= start);
      if (end) filtered = filtered.filter((e) => e.end !== null && e.end <= end);
      if (active) filtered = filtered.filter((e) => e.end === null);
      if (billable === "true") filtered = filtered.filter((e) => e.billable);
      if (billable === "false") filtered = filtered.filter((e) => !e.billable);
      if (projectIds.length > 0)
        filtered = filtered.filter(
          (e) => e.project_id !== null && projectIds.includes(e.project_id),
        );
      if (taskIds.length > 0)
        filtered = filtered.filter((e) => e.task_id !== null && taskIds.includes(e.task_id));
      if (tagIds.length > 0)
        filtered = filtered.filter((e) => e.tagIds.some((t) => tagIds.includes(t)));

      this.json(res, 200, {
        data: filtered.slice(offset, offset + limit).map((e) => this.entryJson(e)),
      });
      return;
    }

    if (rest.length === 0 && req.method === "POST") {
      const memberId = String(body.member_id ?? MEMBER_ACME);
      const description = typeof body.description === "string" ? body.description : "";
      const start = String(body.start ?? "");
      const end = body.end === undefined || body.end === null ? null : String(body.end);

      if (this.faults.postTimeEntries400 > 0) {
        this.faults.postTimeEntries400 -= 1;
        this.json(res, 400, {
          error: true,
          key: "overlapping_time_entry",
          message: "Forced 400 fault (mock)",
        });
        return;
      }

      if (this.faults.postTimeEntries500 > 0) {
        this.faults.postTimeEntries500 -= 1;
        // Record the entry first: the server "processed" the request, only the
        // response was lost.
        entries.push({
          id: crypto.randomUUID(),
          member_id: memberId,
          description,
          start,
          end,
          project_id: (body.project_id as string | null) ?? null,
          task_id: (body.task_id as string | null) ?? null,
          tagIds: Array.isArray(body.tags) ? (body.tags as string[]) : [],
          billable: Boolean(body.billable),
        });
        this.entries.set(org.id, entries);
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Internal Server Error (mock)");
        return;
      }

      if (end === null && entries.some((e) => e.member_id === memberId && e.end === null)) {
        this.json(res, 400, {
          error: true,
          key: "time_entry_still_running",
          message: "A time entry is already running for this member.",
        });
        return;
      }

      if (this.overlapsExisting(org, memberId, start, end)) {
        this.json(res, 400, {
          error: true,
          key: "overlapping_time_entry",
          message: "The time entry overlaps an existing time entry.",
        });
        return;
      }

      const entry: MockEntry = {
        id: crypto.randomUUID(),
        member_id: memberId,
        description,
        start,
        end,
        project_id: (body.project_id as string | null) ?? null,
        task_id: (body.task_id as string | null) ?? null,
        tagIds: Array.isArray(body.tags) ? (body.tags as string[]) : [],
        billable: Boolean(body.billable),
      };
      entries.push(entry);
      this.entries.set(org.id, entries);
      this.json(res, 201, { data: this.entryJson(entry) });
      return;
    }

    if (rest.length === 0 && (req.method === "PATCH" || req.method === "DELETE")) {
      const ids = Array.isArray(body.ids) ? (body.ids as string[]) : [];
      const success: string[] = [];
      const error: string[] = [];
      if (req.method === "PATCH") {
        const changes = (body.changes ?? {}) as Record<string, unknown>;
        for (const id of ids) {
          const entry = entries.find((e) => e.id === id);
          if (!entry) {
            error.push(id);
            continue;
          }
          if (typeof changes.description === "string") entry.description = changes.description;
          if (typeof changes.project_id !== "undefined")
            entry.project_id = changes.project_id as string | null;
          if (typeof changes.task_id !== "undefined")
            entry.task_id = changes.task_id as string | null;
          if (typeof changes.billable !== "undefined") entry.billable = Boolean(changes.billable);
          if (Array.isArray(changes.tags)) entry.tagIds = changes.tags as string[];
          success.push(id);
        }
      } else {
        for (const id of ids) {
          const index = entries.findIndex((e) => e.id === id);
          if (index === -1) {
            error.push(id);
            continue;
          }
          entries.splice(index, 1);
          success.push(id);
        }
      }
      this.entries.set(org.id, entries);
      this.json(res, 200, { success, error });
      return;
    }

    const id = rest[0];
    const index = entries.findIndex((e) => e.id === id);
    if (index === -1) {
      this.json(res, 404, { error: true, message: "Time entry not found (mock)" });
      return;
    }
    const entry = entries[index];
    if (req.method === "PUT" || req.method === "PATCH") {
      const start = typeof body.start === "string" ? body.start : entry.start;
      const end = body.end === undefined ? entry.end : body.end === null ? null : String(body.end);
      if (this.overlapsExisting(org, entry.member_id, start, end, entry.id)) {
        this.json(res, 400, {
          error: true,
          key: "overlapping_time_entry",
          message: "The time entry overlaps an existing time entry.",
        });
        return;
      }
      entry.start = start;
      entry.end = end;
      if (typeof body.description === "string") entry.description = body.description;
      if (body.project_id !== undefined) entry.project_id = body.project_id as string | null;
      if (body.task_id !== undefined) entry.task_id = body.task_id as string | null;
      if (body.billable !== undefined) entry.billable = Boolean(body.billable);
      if (Array.isArray(body.tags)) entry.tagIds = body.tags as string[];
      this.json(res, 200, { data: this.entryJson(entry) });
      return;
    }
    if (req.method === "DELETE") {
      entries.splice(index, 1);
      this.entries.set(org.id, entries);
      res.writeHead(204).end();
      return;
    }
    this.json(res, 405, { error: true, message: "Method not allowed (mock)" });
  }

  private aggregate(res: http.ServerResponse, org: MockOrg, url: URL): void {
    const group = url.searchParams.get("group") ?? "project";
    const subGroup = url.searchParams.get("sub_group");
    const start = url.searchParams.get("start");
    const end = url.searchParams.get("end");

    let filtered = this.entries.get(org.id) ?? [];
    if (start) filtered = filtered.filter((e) => e.start >= start);
    if (end) filtered = filtered.filter((e) => e.end !== null && e.end <= end);

    const tagNames = (e: MockEntry): string[] =>
      (this.tags.get(org.id) ?? []).filter((t) => e.tagIds.includes(t.id)).map((t) => t.name);

    const keyOf = (e: MockEntry): string | null => {
      switch (group) {
        case "project":
          return e.project_id;
        case "task":
          return e.task_id;
        case "tag":
          return null; // handled below: one row per tag name
        case "user":
          return e.member_id;
        default:
          return null;
      }
    };

    const secondsOf = (list: MockEntry[]): number =>
      list.reduce(
        (sum, e) =>
          sum + (e.end ? (new Date(e.end).getTime() - new Date(e.start).getTime()) / 1000 : 0),
        0,
      );

    const rows: Record<string, unknown>[] = [];

    if (group === "tag") {
      const byName = new Map<string, MockEntry[]>();
      for (const e of filtered) {
        for (const name of tagNames(e)) {
          byName.set(name, [...(byName.get(name) ?? []), e]);
        }
      }
      for (const [name, list] of byName) {
        rows.push({
          key: name,
          seconds: secondsOf(list),
          cost: null,
          grouped_type: null,
          grouped_data: null,
        });
      }
    } else {
      const byKey = new Map<string, MockEntry[]>();
      const nullKey = "null";
      for (const e of filtered) {
        const k = keyOf(e) ?? nullKey;
        byKey.set(k, [...(byKey.get(k) ?? []), e]);
      }
      for (const [k, list] of byKey) {
        const key = k === nullKey ? null : k;
        if (subGroup === "tag") {
          const subByTag = new Map<string, number>();
          for (const e of list) {
            for (const name of tagNames(e)) {
              subByTag.set(
                name,
                (subByTag.get(name) ?? 0) +
                  (e.end ? (new Date(e.end).getTime() - new Date(e.start).getTime()) / 1000 : 0),
              );
            }
          }
          rows.push({
            key,
            seconds: secondsOf(list),
            cost: null,
            grouped_type: "tag",
            grouped_data: [...subByTag.entries()].map(([name, seconds]) => ({
              key: name,
              seconds,
              cost: null,
              grouped_type: null,
              grouped_data: null,
            })),
          });
        } else {
          rows.push({
            key,
            seconds: secondsOf(list),
            cost: null,
            grouped_type: null,
            grouped_data: null,
          });
        }
      }
    }

    this.json(res, 200, { data: rows });
  }
}
