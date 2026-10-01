import { SolidtimeApiClient } from "./api-client.js";
export declare function isUuid(value: string): boolean;
/** Resolve a single project given as UUID (passed through) or name
 * (case-insensitive; ambiguous names are a validation error). */
export declare function resolveProject(client: SolidtimeApiClient, org: string, value: string): Promise<string>;
/** Resolve a list of project filters with a single project lookup. */
export declare function resolveProjectIds(client: SolidtimeApiClient, org: string, values: string[]): Promise<string[]>;
/** Resolve a single task, optionally scoped to a project. */
export declare function resolveTask(client: SolidtimeApiClient, org: string, value: string, projectId?: string | null): Promise<string>;
/** Resolve a list of task filters with a single task lookup. */
export declare function resolveTaskIds(client: SolidtimeApiClient, org: string, values: string[], projectId?: string | null): Promise<string[]>;
export interface ResolveTagsOptions {
    createMissing?: boolean;
}
/** Resolve tag values (IDs passed through, names matched case-insensitively).
 * Unknown names raise a validation error unless createMissing is set, in
 * which case they are created. Under --dry-run nothing is created and the
 * missing names are reported on stderr. */
export declare function resolveTagIds(client: SolidtimeApiClient, org: string, values: string[], opts?: ResolveTagsOptions): Promise<string[]>;
//# sourceMappingURL=resolve.d.ts.map