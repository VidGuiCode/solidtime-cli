export interface SolidtimeClientOptions {
    baseUrl: string;
    token: string;
    retries?: number;
    retryDelay?: number;
}
export declare class SolidtimeApiError extends Error {
    readonly status: number;
    readonly method?: string | undefined;
    readonly path?: string | undefined;
    readonly details?: unknown | undefined;
    constructor(status: number, message: string, method?: string | undefined, path?: string | undefined, details?: unknown | undefined);
}
export declare class SolidtimeApiRateLimitError extends SolidtimeApiError {
    readonly retryAfter: number | null;
    constructor(status: number, message: string, retryAfter: number | null, method?: string, path?: string, details?: unknown);
}
export declare class SolidtimeApiClient {
    private readonly options;
    private readonly maxRetries;
    private readonly baseDelay;
    constructor(options: SolidtimeClientOptions);
    get baseUrl(): string;
    get token(): string;
    private get headers();
    private url;
    private sleep;
    private calculateDelay;
    private isRetryableError;
    private fetchWithRetry;
    get<T>(path: string): Promise<T>;
    post<T>(path: string, body: unknown): Promise<T>;
    put<T>(path: string, body: unknown): Promise<T>;
    patch<T>(path: string, body: unknown): Promise<T>;
    delete(path: string): Promise<void>;
    deleteWithBody<T>(path: string, body: unknown): Promise<T>;
}
/** Unwrap Solidtime's { data: T[] } paginated response. */
export declare function unwrap<T>(res: unknown): T[];
/** Fetch all items from an offset/limit endpoint (time entries). */
export declare function fetchAllOffsetLimit<T>(client: SolidtimeApiClient, path: string, batchSize?: number): Promise<T[]>;
/** Fetch all pages of a page-based paginated endpoint (projects, tasks, tags, etc.). */
export declare function fetchAll<T>(client: SolidtimeApiClient, path: string): Promise<T[]>;
//# sourceMappingURL=api-client.d.ts.map