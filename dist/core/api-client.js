export class SolidtimeApiError extends Error {
    status;
    method;
    path;
    details;
    constructor(status, message, method, path, details) {
        super(`API error ${status}: ${message}`);
        this.status = status;
        this.method = method;
        this.path = path;
        this.details = details;
        this.name = "SolidtimeApiError";
    }
}
export class SolidtimeApiRateLimitError extends SolidtimeApiError {
    retryAfter;
    constructor(status, message, retryAfter, method, path, details) {
        super(status, message, method, path, details);
        this.retryAfter = retryAfter;
        this.name = "SolidtimeApiRateLimitError";
    }
}
/** Network error codes that mean the request never left the machine:
 * DNS lookup failure, connection refused, or a connect timeout. */
const CONNECT_ONLY_ERROR_CODES = new Set([
    "ECONNREFUSED",
    "ENOTFOUND",
    "EAI_AGAIN",
    "UND_ERR_CONNECT_TIMEOUT",
]);
/** POST and PATCH, and DELETE with a body, can create or change server state,
 * so retrying them blindly risks duplicates. */
function isNonIdempotent(method, hasBody) {
    if (method === "POST" || method === "PATCH")
        return true;
    return method === "DELETE" && hasBody;
}
/** True when the fetch failure happened before any bytes were sent
 * (Node's fetch throws TypeError with error.cause.code for these). */
function connectionNeverMade(error) {
    if (!(error instanceof TypeError))
        return false;
    const cause = error.cause;
    if (!cause || typeof cause !== "object")
        return false;
    const code = cause.code;
    return typeof code === "string" && CONNECT_ONLY_ERROR_CODES.has(code);
}
/** True when a failed request may still have been processed by the server:
 * a 5xx response, or a connection drop after the request was sent. Callers
 * doing non-idempotent writes should check for an existing entry before
 * retrying. */
export function mayHaveReachedServer(error) {
    if (error instanceof SolidtimeApiError)
        return error.status >= 500;
    if (error instanceof TypeError)
        return !connectionNeverMade(error);
    return error instanceof Error && error.name === "AbortError";
}
export class SolidtimeApiClient {
    options;
    maxRetries;
    baseDelay;
    constructor(options) {
        this.options = options;
        this.maxRetries = options.retries ?? 3;
        this.baseDelay = options.retryDelay ?? 1000;
    }
    get baseUrl() {
        return this.options.baseUrl;
    }
    get token() {
        return this.options.token;
    }
    get headers() {
        return {
            Authorization: `Bearer ${this.options.token}`,
            Accept: "application/json",
            "Content-Type": "application/json",
        };
    }
    url(path) {
        const base = this.options.baseUrl.replace(/\/$/, "");
        const p = path.replace(/^\//, "");
        return `${base}/api/v1/${p}`;
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    calculateDelay(attempt, retryAfter) {
        if (retryAfter !== null && retryAfter > 0) {
            return retryAfter * 1000;
        }
        const exponentialDelay = this.baseDelay * Math.pow(2, attempt);
        const jitter = Math.random() * exponentialDelay;
        return exponentialDelay + jitter;
    }
    isRetryableError(status) {
        if (status >= 500 && status < 600)
            return true;
        if (status === 429)
            return true;
        return false;
    }
    async fetchWithRetry(path, options = {}) {
        const url = this.url(path);
        const fetchOptions = {
            headers: this.headers,
            ...options,
        };
        const method = (options.method ?? "GET").toUpperCase();
        const noBlindRetry = isNonIdempotent(method, options.body !== undefined);
        let lastError = null;
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                const res = await fetch(url, fetchOptions);
                if (res.ok)
                    return res;
                if (res.status === 429) {
                    // 429 means the server rejected the request without processing it,
                    // so it is safe to retry any method.
                    const retryAfterHeader = res.headers.get("Retry-After");
                    const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : null;
                    if (attempt === this.maxRetries) {
                        const errorText = await res.text();
                        throw new SolidtimeApiRateLimitError(res.status, errorText, retryAfter, method, path, {
                            response: errorText,
                        });
                    }
                    await this.sleep(this.calculateDelay(attempt, retryAfter));
                    continue;
                }
                // A 5xx on a non-idempotent request may mean the server already
                // processed it; a blind retry could create a duplicate. Fail and let
                // the caller check for an existing entry instead.
                if (noBlindRetry && res.status >= 500 && res.status < 600) {
                    const errorText = await res.text();
                    throw new SolidtimeApiError(res.status, errorText, method, path, {
                        response: errorText,
                    });
                }
                if (this.isRetryableError(res.status) && attempt < this.maxRetries) {
                    await this.sleep(this.calculateDelay(attempt, null));
                    continue;
                }
                const errorText = await res.text();
                throw new SolidtimeApiError(res.status, errorText, method, path, {
                    response: errorText,
                });
            }
            catch (error) {
                if (error instanceof SolidtimeApiError)
                    throw error;
                const isNetworkError = error instanceof TypeError || (error instanceof Error && error.name === "AbortError");
                const canRetry = isNetworkError &&
                    attempt < this.maxRetries &&
                    (!noBlindRetry || connectionNeverMade(error));
                if (canRetry) {
                    lastError = error instanceof Error ? error : new Error(String(error));
                    await this.sleep(this.calculateDelay(attempt, null));
                    continue;
                }
                if (isNetworkError && attempt === this.maxRetries && !noBlindRetry) {
                    throw new Error(`Request failed after ${this.maxRetries} retries: ${error instanceof Error ? error.message : String(error)}`);
                }
                throw error instanceof Error ? error : new Error(String(error));
            }
        }
        throw lastError || new Error(`Request failed after ${this.maxRetries} retries`);
    }
    async get(path) {
        const res = await this.fetchWithRetry(path);
        if (!res.ok) {
            const errorText = await res.text();
            throw new SolidtimeApiError(res.status, errorText, "GET", path, { response: errorText });
        }
        return res.json();
    }
    async post(path, body) {
        const res = await this.fetchWithRetry(path, {
            method: "POST",
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const errorText = await res.text();
            throw new SolidtimeApiError(res.status, errorText, "POST", path, {
                request: body,
                response: errorText,
            });
        }
        return res.json();
    }
    async put(path, body) {
        const res = await this.fetchWithRetry(path, {
            method: "PUT",
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const errorText = await res.text();
            throw new SolidtimeApiError(res.status, errorText, "PUT", path, {
                request: body,
                response: errorText,
            });
        }
        return res.json();
    }
    async patch(path, body) {
        const res = await this.fetchWithRetry(path, {
            method: "PATCH",
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const errorText = await res.text();
            throw new SolidtimeApiError(res.status, errorText, "PATCH", path, {
                request: body,
                response: errorText,
            });
        }
        return res.json();
    }
    async delete(path) {
        const res = await this.fetchWithRetry(path, {
            method: "DELETE",
        });
        if (!res.ok) {
            const errorText = await res.text();
            throw new SolidtimeApiError(res.status, errorText, "DELETE", path, { response: errorText });
        }
    }
    async deleteWithBody(path, body) {
        const res = await this.fetchWithRetry(path, {
            method: "DELETE",
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const errorText = await res.text();
            throw new SolidtimeApiError(res.status, errorText, "DELETE", path, {
                request: body,
                response: errorText,
            });
        }
        return res.json();
    }
}
/** Unwrap Solidtime's { data: T[] } paginated response. */
export function unwrap(res) {
    if (Array.isArray(res))
        return res;
    if (res &&
        typeof res === "object" &&
        "data" in res &&
        Array.isArray(res.data)) {
        return res.data;
    }
    return [];
}
/** Fetch all items from an offset/limit endpoint (time entries). */
export async function fetchAllOffsetLimit(client, path, batchSize = 500) {
    const sep = path.includes("?") ? "&" : "?";
    let offset = 0;
    const results = [];
    while (true) {
        const res = await client.get(`${path}${sep}limit=${batchSize}&offset=${offset}`);
        const page = unwrap(res);
        results.push(...page);
        if (page.length < batchSize)
            break;
        offset += page.length;
    }
    return results;
}
/** Fetch all pages of a page-based paginated endpoint (projects, tasks, tags, etc.). */
export async function fetchAll(client, path) {
    const sep = path.includes("?") ? "&" : "?";
    let page = 1;
    const results = [];
    while (true) {
        const res = await client.get(`${path}${sep}page=${page}`);
        results.push(...unwrap(res));
        const meta = res && typeof res === "object" && "meta" in res
            ? res.meta
            : null;
        if (meta && meta.current_page < meta.last_page) {
            page++;
        }
        else {
            break;
        }
    }
    return results;
}
//# sourceMappingURL=api-client.js.map