import { Command } from "commander";
import { createClient, loadConfig, requireActiveOrganization } from "../core/config-store.js";
import { printJson, printTable } from "../core/output.js";
import { exitWithError } from "../core/errors.js";
import { normalizeDateTime } from "../core/datetime.js";
import { fetchAll } from "../core/api-client.js";
/** Format seconds as hh:mm. */
function formatHours(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    return `${h}:${String(m).padStart(2, "0")}`;
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
            params.append("group", "project");
            params.append("sub_group", "tag");
            if (opts.start)
                params.append("start", normalizeDateTime(opts.start));
            if (opts.end)
                params.append("end", normalizeDateTime(opts.end));
            const res = await client.get(`organizations/${org}/time-entries/aggregate?${params.toString()}`);
            const rows = res.data ?? [];
            const projects = await fetchAll(client, `organizations/${org}/projects`);
            const nameById = new Map(projects.map((p) => [p.id, p.name]));
            const report = rows.map((row) => {
                const tags = {};
                for (const sub of row.grouped_data ?? []) {
                    const tag = sub.key ?? "(no tag)";
                    tags[tag] = (tags[tag] ?? 0) + sub.seconds;
                }
                let human = 0;
                let agent = 0;
                let other = 0;
                let total = 0;
                for (const [tag, seconds] of Object.entries(tags)) {
                    total += seconds;
                    const normalized = tag.toLowerCase();
                    if (normalized === "human")
                        human += seconds;
                    else if (normalized === "agent")
                        agent += seconds;
                    else
                        other += seconds;
                }
                return {
                    project_id: row.key,
                    project_name: row.key ? (nameById.get(row.key) ?? row.key) : "(no project)",
                    human_seconds: human,
                    agent_seconds: agent,
                    other_seconds: other,
                    total_seconds: total,
                    tags,
                };
            });
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