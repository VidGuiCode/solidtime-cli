import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import os from "node:os";
import { createReportCommand } from "../../src/commands/report.js";
import { createTimeEntryCommand } from "../../src/commands/time-entry.js";

const ORG = "org-1";
const PROJECT_ID = "11111111-1111-1111-1111-111111111111";

const envBackup: Record<string, string | undefined> = {};

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

const AGGREGATE_RESPONSE = {
  data: [
    {
      key: PROJECT_ID,
      seconds: 7200,
      cost: null,
      grouped_type: "tag",
      grouped_data: [
        { key: "human", seconds: 3600, cost: null, grouped_type: null, grouped_data: null },
        { key: "agent", seconds: 3600, cost: null, grouped_type: null, grouped_data: null },
      ],
    },
    {
      key: null,
      seconds: 1800,
      cost: null,
      grouped_type: "tag",
      grouped_data: [
        { key: null, seconds: 1800, cost: null, grouped_type: null, grouped_data: null },
      ],
    },
  ],
};

beforeEach(() => {
  const env: Record<string, string> = {
    SOLIDTIME_BASE_URL: "https://x.example.com",
    SOLIDTIME_API_TOKEN: "token",
    SOLIDTIME_ORGANIZATION: ORG,
    SOLIDTIME_MEMBER_ID: "member-1",
  };
  for (const [key, value] of Object.entries(env)) {
    envBackup[key] = process.env[key];
    process.env[key] = value;
  }
  (os as { homedir(): string }).homedir = () => os.tmpdir();
});

afterEach(() => {
  (os as { homedir(): string }).homedir = os.homedir;
  for (const [key, value] of Object.entries(envBackup)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function capture(): { logs: string[]; errors: string[] } {
  const logs: string[] = [];
  const errors: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  });
  return { logs, errors };
}

function lastJson(logs: string[]): unknown {
  return JSON.parse(logs[logs.length - 1]);
}

function mockFetch(): ReturnType<typeof vi.fn> {
  return vi.fn(async (url: string | URL | Request) => {
    const path = String(url instanceof Request ? url.url : url);
    if (path.includes("/time-entries/aggregate")) return jsonResponse(200, AGGREGATE_RESPONSE);
    if (path.includes("/projects"))
      return jsonResponse(200, {
        data: [
          {
            id: PROJECT_ID,
            name: "Client Work",
            color: "#000000",
            client_id: null,
            is_archived: false,
            billable_rate: null,
            is_billable: false,
            estimated_time: null,
            spent_time: 0,
            is_public: false,
          },
        ],
        links: { first: null, last: null, prev: null, next: null },
        meta: { current_page: 1, last_page: 1, per_page: 15, total: 1, from: 1, to: 1 },
      });
    return jsonResponse(404, { message: "not found" });
  });
}

describe("report", () => {
  it("splits project totals into human/agent/other columns (JSON)", async () => {
    const fetchMock = mockFetch();
    vi.stubGlobal("fetch", fetchMock);
    const { logs } = capture();

    await createReportCommand().parseAsync(["node", "report", "--json"]);

    const printed = lastJson(logs) as {
      total_seconds: number;
      projects: Array<{
        project_name: string;
        human_seconds: number;
        agent_seconds: number;
        other_seconds: number;
        total_seconds: number;
      }>;
    };

    expect(printed.total_seconds).toBe(9000);
    const named = printed.projects.find((p) => p.project_name === "Client Work");
    expect(named).toMatchObject({
      human_seconds: 3600,
      agent_seconds: 3600,
      other_seconds: 0,
      total_seconds: 7200,
    });
    const untagged = printed.projects.find((p) => p.project_id === null);
    expect(untagged).toMatchObject({ project_name: "(no project)", other_seconds: 1800 });

    const paths = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(paths[0]).toContain("group=project");
    expect(paths[0]).toContain("sub_group=tag");
  });

  it("prints a readable table without --json", async () => {
    vi.stubGlobal("fetch", mockFetch());
    const { logs } = capture();

    await createReportCommand().parseAsync(["node", "report"]);

    const output = logs.join("\n");
    expect(output).toContain("Project");
    expect(output).toContain("human");
    expect(output).toContain("agent");
    expect(output).toContain("Client Work");
    expect(output).toContain("(no project)");
  });
});

describe("te aggregate", () => {
  it("--json prints the raw aggregate response", async () => {
    mockFetch();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(200, AGGREGATE_RESPONSE)),
    );
    const { logs } = capture();

    await createTimeEntryCommand().parseAsync([
      "node",
      "te",
      "aggregate",
      "--group",
      "project",
      "--sub-group",
      "tag",
      "--json",
    ]);

    expect(lastJson(logs)).toEqual(AGGREGATE_RESPONSE);
  });

  it("prints a table without --json", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(200, AGGREGATE_RESPONSE)),
    );
    const { logs } = capture();

    await createTimeEntryCommand().parseAsync(["node", "te", "aggregate", "--group", "project"]);

    const output = logs.join("\n");
    expect(output).toContain("Group");
    expect(output).toContain("Sub-group");
    expect(output).toContain("Duration");
  });
});
