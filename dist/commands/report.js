import { Command } from "commander";
import { createClient, loadConfig, requireActiveOrganization } from "../core/config-store.js";
import { printJson, printTable } from "../core/output.js";
import { exitWithError } from "../core/errors.js";
import { normalizeDateTime } from "../core/datetime.js";
import { fetchAll, fetchAllOffsetLimit } from "../core/api-client.js";
/** Format seconds as hh:mm. */
function formatHours(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    return `${h}:${String(m).padStart(2, "0")}`;
}
/** Every entry counts exactly once: an entry tagged both `agent` and `human`
 * counts as agent time, an untagged entry counts as other. */
function bucketFor(tagNames) {
    const lower = tagNames.map((t) => t.toLowerCase());
    if (lower.includes("agent"))
        return "agent";
    if (lower.includes("human"))
        return "human";
    return "other";
}
export function createReportCommand() {
    const cmd = new Command("report").description("Time report grouped by project and human/agent tags");
    cmd
        .description("Totals for a period, split by project and by the human/agent tag convention")
        .option("--start <datetime>", "Start of the period (e.g. 2026-04-01T00:00:00Z)")
        .option("--end <datetime>", "End of the period (e.g. 2026-04-30T23:59:59Z)")
        .option("--json", "Output raw JSON")
        .action(async (opts) => {
        try {
            const config = loadConfig();
            const client = createClient(config);
            const org = requireActiveOrganization(config);
            const params = new URLSearchParams();
            if (opts.start)
                params.append("start", normalizeDateTime(opts.start));
            if (opts.end)
                params.append("end", normalizeDateTime(opts.end));
            const query = params.toString();
            const entries = await fetchAllOffsetLimit(client, `organizations/${org}/time-entries` + (query ? `?${query}` : ""));
            const [projects, tags] = await Promise.all([
                fetchAll(client, `organizations/${org}/projects`),
                fetchAll(client, `organizations/${org}/tags`),
            ]);
            const projectNameById = new Map(projects.map((p) => [p.id, p.name]));
            const tagNameById = new Map(tags.map((t) => [t.id, t.name]));
            const byProject = new Map();
            for (const entry of entries) {
                const seconds = Math.max(0, entry.duration ?? 0);
                const key = entry.project_id ?? "(no project)";
                let row = byProject.get(key);
                if (!row) {
                    row = {
                        project_id: entry.project_id,
                        project_name: entry.project_id
                            ? (projectNameById.get(entry.project_id) ?? entry.project_id)
                            : "(no project)",
                        human_seconds: 0,
                        agent_seconds: 0,
                        other_seconds: 0,
                        total_seconds: 0,
                        tags: {},
                    };
                    byProject.set(key, row);
                }
                row.total_seconds += seconds;
                const tagNames = entry.tags.map((t) => tagNameById.get(t) ?? t);
                const bucket = bucketFor(tagNames);
                if (bucket === "human")
                    row.human_seconds += seconds;
                else if (bucket === "agent")
                    row.agent_seconds += seconds;
                else
                    row.other_seconds += seconds;
                for (const name of tagNames) {
                    row.tags[name] = (row.tags[name] ?? 0) + seconds;
                }
            }
            const report = [...byProject.values()].sort((a, b) => b.total_seconds - a.total_seconds);
            if (opts.json) {
                const total = report.reduce((sum, r) => sum + r.total_seconds, 0);
                printJson({
                    start: opts.start ? normalizeDateTime(opts.start) : null,
                    end: opts.end ? normalizeDateTime(opts.end) : null,
                    total_seconds: total,
                    projects: report,
                });
                return;
            }
            if (report.length === 0) {
                console.log("No time entries in this period.");
                return;
            }
            printTable(report.map((r) => [
                r.project_name,
                formatHours(r.human_seconds),
                formatHours(r.agent_seconds),
                formatHours(r.other_seconds),
                formatHours(r.total_seconds),
            ]), ["Project", "human", "agent", "other", "total"]);
            const sum = (key) => report.reduce((acc, r) => acc + r[key], 0);
            printTable([
                [
                    "",
                    formatHours(sum("human_seconds")),
                    formatHours(sum("agent_seconds")),
                    formatHours(sum("other_seconds")),
                    formatHours(sum("total_seconds")),
                ],
            ]);
        }
        catch (err) {
            exitWithError(err, Boolean(opts.json));
        }
    });
    return cmd;
}
//# sourceMappingURL=report.js.map