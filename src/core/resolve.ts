import { SolidtimeApiClient, fetchAll } from "./api-client.js";
import { ValidationError } from "./errors.js";
import { isDryRunEnabled } from "./runtime.js";
import type { SolidtimeProject, SolidtimeTask, SolidtimeTag } from "./types.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

interface NamedResource {
  id: string;
  name: string;
}

function ambiguousMessage(kind: string, value: string, matches: NamedResource[]): string {
  const list = matches.map((m) => `  - ${m.id}  ${m.name}`).join("\n");
  return `Multiple ${kind} names match "${value}". Use the ID instead:\n${list}`;
}

function matchByName<T extends NamedResource>(
  items: T[],
  value: string,
  kind: string,
  hint: string,
): string {
  const matches = items.filter((item) => item.name.toLowerCase() === value.toLowerCase());
  if (matches.length === 1) return matches[0].id;
  if (matches.length > 1) throw new ValidationError(ambiguousMessage(kind, value, matches));
  throw new ValidationError(`${kind} "${value}" not found. ${hint}`);
}

async function fetchProjects(client: SolidtimeApiClient, org: string): Promise<SolidtimeProject[]> {
  return fetchAll<SolidtimeProject>(client, `organizations/${org}/projects`);
}

async function fetchTasks(
  client: SolidtimeApiClient,
  org: string,
  projectId?: string | null,
): Promise<SolidtimeTask[]> {
  const params = new URLSearchParams();
  if (projectId) params.append("project_id", projectId);
  const query = params.toString();
  const path = `organizations/${org}/tasks` + (query ? `?${query}` : "");
  return fetchAll<SolidtimeTask>(client, path);
}

/** Resolve a single project given as UUID (passed through) or name
 * (case-insensitive; ambiguous names are a validation error). */
export async function resolveProject(
  client: SolidtimeApiClient,
  org: string,
  value: string,
): Promise<string> {
  if (isUuid(value)) return value;
  const projects = await fetchProjects(client, org);
  return matchByName(projects, value, "Project", "Check with: solidtime project list");
}

/** Resolve a list of project filters with a single project lookup. */
export async function resolveProjectIds(
  client: SolidtimeApiClient,
  org: string,
  values: string[],
): Promise<string[]> {
  if (values.every((v) => isUuid(v))) return values;
  const projects = await fetchProjects(client, org);
  return values.map((v) =>
    isUuid(v) ? v : matchByName(projects, v, "Project", "Check with: solidtime project list"),
  );
}

/** Resolve a single task, optionally scoped to a project. */
export async function resolveTask(
  client: SolidtimeApiClient,
  org: string,
  value: string,
  projectId?: string | null,
): Promise<string> {
  if (isUuid(value)) return value;
  const tasks = await fetchTasks(client, org, projectId);
  return matchByName(tasks, value, "Task", "Check with: solidtime task list");
}

/** Resolve a list of task filters with a single task lookup. */
export async function resolveTaskIds(
  client: SolidtimeApiClient,
  org: string,
  values: string[],
  projectId?: string | null,
): Promise<string[]> {
  if (values.every((v) => isUuid(v))) return values;
  const tasks = await fetchTasks(client, org, projectId);
  return values.map((v) =>
    isUuid(v) ? v : matchByName(tasks, v, "Task", "Check with: solidtime task list"),
  );
}

export interface ResolveTagsOptions {
  createMissing?: boolean;
}

/** Resolve tag values (IDs passed through, names matched case-insensitively).
 * Unknown names raise a validation error unless createMissing is set, in
 * which case they are created. Under --dry-run nothing is created and the
 * missing names are reported on stderr. */
export async function resolveTagIds(
  client: SolidtimeApiClient,
  org: string,
  values: string[],
  opts: ResolveTagsOptions = {},
): Promise<string[]> {
  if (values.length === 0) return [];
  if (values.every((v) => isUuid(v))) return values;

  const tags = await fetchAll<SolidtimeTag>(client, `organizations/${org}/tags`);
  const resolved: string[] = [];
  const missing: string[] = [];

  for (const value of values) {
    if (isUuid(value)) {
      resolved.push(value);
      continue;
    }
    const matches = tags.filter((t) => t.name.toLowerCase() === value.toLowerCase());
    if (matches.length === 1) {
      resolved.push(matches[0].id);
      continue;
    }
    if (matches.length > 1) {
      throw new ValidationError(ambiguousMessage("Tag", value, matches));
    }
    missing.push(value);
  }

  if (missing.length === 0) return resolved;

  if (!opts.createMissing) {
    throw new ValidationError(
      `Tag${missing.length > 1 ? "s" : ""} not found: ${missing.map((m) => `"${m}"`).join(", ")}. ` +
        `Create them with: solidtime tag create --name <name>, or pass --create-missing-tags.`,
    );
  }

  if (isDryRunEnabled()) {
    for (const name of missing) console.error(`Would create tag: ${name}`);
    return resolved;
  }

  for (const name of missing) {
    const res = await client.post<{ data: SolidtimeTag }>(`organizations/${org}/tags`, { name });
    resolved.push(res.data.id);
  }
  return resolved;
}
