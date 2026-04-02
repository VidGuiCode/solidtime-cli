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
        const jitter = Math.random() * 100;
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
        let lastError = null;
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                const res = await fetch(url, fetchOptions);
                if (res.ok || !this.isRetryableError(res.status)) {
                    return res;
                }
                if (res.status === 429) {
                    const retryAfterHeader = res.headers.get("Retry-After");
                    const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : null;
                    if (attempt === this.maxRetries) {
                        const errorText = await res.text();
                        throw new SolidtimeApiRateLimitError(res.status, errorText, retryAfter, options.method, path, { response: errorText });
                    }
                    const delay = this.calculateDelay(attempt, retryAfter);
                    await this.sleep(delay);
                    continue;
                }
                if (attempt === this.maxRetries) {
                    const errorText = await res.text();
                    throw new SolidtimeApiError(res.status, errorText, options.method, path, {
                        response: errorText,
                    });
                }
                const delay = this.calculateDelay(attempt, null);
                await this.sleep(delay);
            }
            catch (error) {
                if (error instanceof TypeError || error instanceof Error) {
                    const isNetworkError = error instanceof TypeError ||
                        error.message.includes("fetch") ||
                        error.message.includes("network");
                    if (isNetworkError && attempt < this.maxRetries) {
                        const delay = this.calculateDelay(attempt, null);
                        await this.sleep(delay);
                        lastError = error;
                        continue;
                    }
                }
                if (error instanceof SolidtimeApiError) {
                    throw error;
                }
                if (attempt === this.maxRetries) {
                    throw new Error(`Request failed after ${this.maxRetries} retries: ${error instanceof Error ? error.message : String(error)}`);
                }
                lastError = error instanceof Error ? error : new Error(String(error));
                const delay = this.calculateDelay(attempt, null);
                await this.sleep(delay);
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
    async delete(path) {
        const res = await this.fetchWithRetry(path, {
            method: "DELETE",
        });
        if (!res.ok) {
            const errorText = await res.text();
            throw new SolidtimeApiError(res.status, errorText, "DELETE", path, { response: errorText });
        }
    }
}
/** Unwrap Solidtime's { data: T[] } paginated response. */
export function unwrap(res) {
    if (Array.isArray(res))
        return res;
    if (res && typeof res === "object" && "data" in res && Array.isArray(res.data)) {
        return res.data;
    }
    return [];
}
/** Fetch all pages of a paginated Solidtime endpoint. */
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