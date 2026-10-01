import { Command } from "commander";
import {
  createClient,
  getActiveAccount,
  loadConfig,
  requireActiveMemberId,
  requireActiveOrganization,
} from "../core/config-store.js";
import { printInfo, printJson, printTable } from "../core/output.js";
import { exitWithError, ValidationError, getErrorMessage } from "../core/errors.js";
import { isDryRunEnabled, isNonInteractiveMode } from "../core/runtime.js";
import { normalizeDateTime, toUTCString } from "../core/datetime.js";
import { resolveProject, resolveTask, resolveTagIds } from "../core/resolve.js";
import { createTimeEntryWithDedupe } from "../core/time-entries.js";
import { confirm } from "../core/prompt.js";
import {
  createTrackRecord,
  createClientForTrack,
  deleteTrack,
  formatElapsed,
  getStaleHours,
  isTrackStale,
  listTracks,
  readTrack,
  trackElapsedSeconds,
  writeTrack,
  type SolidtimeTrack,
} from "../core/track-store.js";
import type { SolidtimeConfig, SolidtimeTimeEntry } from "../core/types.js";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function requireTrack(id: string): SolidtimeTrack {
  const track = readTrack(id);
  if (!track) {
    throw new ValidationError(
      `No running track with id "${id}". Run: solidtime track list`,
    );
  }
  return track;
}

interface StopOptions {
  end?: string;
  force?: boolean;
  description?: string;
  staleHours: number;
}

type StopResult =
  | { dryRun: true; body: unknown }
  | { dryRun: false; entry: SolidtimeTimeEntry; deduped: boolean };

/** Build the finished-entry body from a track, apply the stale rules, POST it,
 * and delete the local file only after success (2xx or a dedupe match).
 * Under --dry-run nothing is sent and the file is kept. */
async function stopTrack(
  config: SolidtimeConfig,
  track: SolidtimeTrack,
  opts: StopOptions,
): Promise<StopResult> {
  const stale = isTrackStale(track, opts.staleHours);
  if (stale && !opts.force && !opts.end) {
    const elapsed = formatElapsed(trackElapsedSeconds(track));
    if (isNonInteractiveMode()) {
      throw new ValidationError(
        `Track ${track.id} is stale (running for ${elapsed}). ` +
          `Pass --end to set the end time, or --force to stop it now.`,
      );
    }
    const ok = await confirm(
      `Track ${track.id} has been running for ${elapsed}. Stop it with end = now?`,
    );
    if (!ok) {
      throw new ValidationError(`Track ${track.id} left running.`);
    }
  }

  const end = opts.end ? normalizeDateTime(opts.end) : toUTCString(new Date());
  if (end < track.start) {
    throw new ValidationError(
      `End time (${end}) is before the track start (${track.start}). Use --end with a later time.`,
    );
  }

  const body = {
    member_id: track.member_id,
    description: opts.description ?? track.description,
    start: track.start,
    end,
    project_id: track.project_id,
    task_id: track.task_id,
    tags: track.tags,
    billable: track.billable,
  };

  if (isDryRunEnabled()) {
    return { dryRun: true, body: { dryRun: true, action: "track.stop", id: track.id, body } };
  }

  const client = createClientForTrack(config, track);
  const { entry, deduped } = await createTimeEntryWithDedupe(client, track.organization, body);
  deleteTrack(track.id);
  return { dryRun: false, entry, deduped };
}

export function createTrackCommand(): Command {
  const cmd = new Command("track").description(
    "Run several local timers in parallel (only finished entries are sent to Solidtime)",
  );

  cmd
    .command("start")
    .description("Start a local timer (nothing is sent to the server yet)")
    .requiredOption("--description <text>", "Description")
    .option("--project <id|name>", "Project ID or name")
    .option("--task <id|name>", "Task ID or name")
    .option("--tags <ids...>", "Tag IDs or names (space-separated)")
    .option("--create-missing-tags", "Create tags that do not exist yet")
    .option("--billable", "Mark as billable")
    .option("--label <text>", "Label to group this timer (e.g. one label per agent session)")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      try {
        const config = loadConfig();
        const client = createClient(config);
        const org = requireActiveOrganization(config);
        const memberId = requireActiveMemberId(config);
        const account = getActiveAccount(config);

        const projectId = opts.project ? await resolveProject(client, org, opts.project) : null;
        const taskId = opts.task ? await resolveTask(client, org, opts.task, projectId) : null;
        const tagIds = opts.tags
          ? await resolveTagIds(client, org, opts.tags, {
              createMissing: Boolean(opts.createMissingTags),
            })
          : [];

        const track = createTrackRecord({
          description: opts.description,
          projectId,
          taskId,
          tags: tagIds,
          billable: Boolean(opts.billable),
          label: opts.label ?? null,
          account: account?.name ?? null,
          organization: org,
          memberId,
        });

        if (isDryRunEnabled()) {
          printJson({ dryRun: true, action: "track.start", track });
          return;
        }

        writeTrack(track);

        if (opts.json) {
          printJson({ id: track.id, start: track.start });
          return;
        }

        const label = track.label ? ` (label: ${track.label})` : "";
        console.log(`Tracking started: ${track.id} — ${track.description}${label}`);
      } catch (err) {
        exitWithError(err, Boolean(opts.json));
      }
    });

  cmd
    .command("stop")
    .description("Stop a local timer and send the finished entry to Solidtime")
    .argument("[id]", "Track ID (required unless --all)")
    .option("--all", "Stop every running track")
    .option("--label <text>", "With --all: only stop tracks with this label")
    .option("--end <iso>", "End time (default: now; e.g. 2026-04-01T17:00:00Z)")
    .option("--description <text>", "Override the description")
    .option("--force", "Stop even if the timer is stale")
    .option("--json", "Output raw JSON")
    .action(async (id, opts) => {
      try {
        const config = loadConfig();
        const staleHours = getStaleHours();

        if (opts.all) {
          const tracks = listTracks().filter((t) => !opts.label || t.label === opts.label);
          const stopped: Array<Record<string, unknown>> = [];
          const failed: Array<{ id: string; error: string }> = [];

          for (const track of tracks) {
            try {
              const result = await stopTrack(config, track, {
                end: opts.end,
                force: Boolean(opts.force),
                description: opts.description,
                staleHours,
              });
              if (result.dryRun) {
                stopped.push({ id: track.id, dryRun: true });
                if (!opts.json) {
                  console.log(`Would stop ${track.id} (dry run)`);
                }
              } else {
                stopped.push({ id: track.id, entry_id: result.entry.id, deduped: result.deduped });
                if (!opts.json) {
                  console.log(
                    `Stopped ${track.id}: ${result.entry.description} (${formatDuration(result.entry.duration)})${result.deduped ? " [recovered existing entry]" : ""}`,
                  );
                }
              }
            } catch (err) {
              failed.push({ id: track.id, error: getErrorMessage(err) });
              if (!opts.json) {
                console.error(`Failed ${track.id}: ${getErrorMessage(err)}`);
                console.error(`  Track kept. Retry with: solidtime track stop ${track.id}`);
              }
            }
          }

          if (opts.json) {
            printJson({ stopped, failed });
          } else if (tracks.length === 0) {
            console.log(
              opts.label
                ? `No running tracks with label "${opts.label}".`
                : "No running tracks.",
            );
          }

          if (failed.length > 0) process.exit(1);
          return;
        }

        if (!id) {
          throw new ValidationError("Provide a track id, or use --all.");
        }

        const track = requireTrack(id);

        try {
          const result = await stopTrack(config, track, {
            end: opts.end,
            force: Boolean(opts.force),
            description: opts.description,
            staleHours,
          });

          if (result.dryRun) {
            printJson(result.body);
            return;
          }

          if (opts.json) {
            printJson(result.entry);
            return;
          }
          if (result.deduped) {
            printInfo(
              "Found an existing entry with the same start and description — not creating a duplicate:",
            );
          }
          console.log(
            `Timer stopped: ${result.entry.description} (${formatDuration(result.entry.duration)})`,
          );
        } catch (err) {
          if (!opts.json) {
            console.error(`The local track file was kept. Re-run: solidtime track stop ${id}`);
          }
          throw err;
        }
      } catch (err) {
        exitWithError(err, Boolean(opts.json));
      }
    });

  cmd
    .command("list")
    .description("List running local timers with elapsed time")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      try {
        const staleHours = getStaleHours();
        const now = new Date();
        const tracks = listTracks().map((t) => ({
          id: t.id,
          description: t.description,
          label: t.label,
          start: t.start,
          elapsed_seconds: trackElapsedSeconds(t, now),
          elapsed: formatElapsed(trackElapsedSeconds(t, now)),
          stale: isTrackStale(t, staleHours, now),
          project_id: t.project_id,
          task_id: t.task_id,
          tags: t.tags,
          billable: t.billable,
          account: t.account,
          organization: t.organization,
        }));

        if (opts.json) {
          printJson(tracks);
          return;
        }

        if (tracks.length === 0) {
          console.log("No running tracks.");
          return;
        }

        printTable(
          tracks.map((t) => [
            t.id,
            t.description || "(no description)",
            t.label ?? "",
            t.elapsed,
            t.stale ? "STALE" : "",
          ]),
          ["ID", "Description", "Label", "Elapsed", "Status"],
        );
      } catch (err) {
        exitWithError(err, Boolean(opts.json));
      }
    });

  cmd
    .command("show")
    .description("Show one running local timer")
    .argument("<id>", "Track ID")
    .option("--json", "Output raw JSON")
    .action(async (id, opts) => {
      try {
        const track = requireTrack(id);
        const staleHours = getStaleHours();
        const elapsed = trackElapsedSeconds(track);
        const payload = {
          ...track,
          elapsed_seconds: elapsed,
          elapsed: formatElapsed(elapsed),
          stale: isTrackStale(track, staleHours),
        };

        if (opts.json) {
          printJson(payload);
          return;
        }

        console.log(`ID:          ${track.id}`);
        console.log(`Description: ${track.description || "(no description)"}`);
        console.log(`Label:       ${track.label ?? ""}`);
        console.log(`Start:       ${track.start}`);
        console.log(`Elapsed:     ${formatElapsed(elapsed)}${isTrackStale(track, staleHours) ? " (STALE)" : ""}`);
        console.log(`Project:     ${track.project_id ?? "-"}`);
        console.log(`Task:        ${track.task_id ?? "-"}`);
        console.log(`Tags:        ${track.tags.join(", ") || "-"}`);
        console.log(`Billable:    ${track.billable ? "yes" : "no"}`);
        console.log(`Account:     ${track.account ?? "(environment)"}`);
        console.log(`Org:         ${track.organization}`);
      } catch (err) {
        exitWithError(err, Boolean(opts.json));
      }
    });

  cmd
    .command("cancel")
    .description("Cancel a local timer without sending anything")
    .argument("<id>", "Track ID")
    .option("--json", "Output raw JSON")
    .action(async (id, opts) => {
      try {
        requireTrack(id);
        deleteTrack(id);

        if (opts.json) {
          printJson({ success: true, action: "track.cancel", id });
          return;
        }

        console.log(`Cancelled track: ${id}`);
      } catch (err) {
        exitWithError(err, Boolean(opts.json));
      }
    });

  return cmd;
}
