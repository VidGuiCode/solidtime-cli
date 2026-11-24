import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const UPSTREAM_REPO = "solidtime-io/solidtime";
const UPSTREAM_BRANCH = "main";
const DEFAULT_SNAPSHOT = "docs/api-snapshot.json";
const REQUEST_PREFIX = "app/Http/Requests/V1/";
const FETCH_CONCURRENCY = 8;

/**
 * Strip PHP comments while preserving string literals (including escapes) so
 * braces, quotes, and keywords inside comments cannot confuse parsing.
 */
function stripPhpComments(source) {
  let out = "";
  let i = 0;
  const len = source.length;

  while (i < len) {
    const ch = source[i];
    const next = source[i + 1];

    if (ch === "'" || ch === '"') {
      const quote = ch;
      out += ch;
      i++;
      while (i < len) {
        const sc = source[i];
        out += sc;
        if (sc === "\\" && i + 1 < len) {
          i++;
          out += source[i];
          i++;
          continue;
        }
        i++;
        if (sc === quote) break;
      }
      continue;
    }

    if (ch === "/" && next === "/") {
      while (i < len && source[i] !== "\n") i++;
      continue;
    }

    if (ch === "#") {
      while (i < len && source[i] !== "\n") i++;
      continue;
    }

    if (ch === "/" && next === "*") {
      i += 2;
      while (i < len && !(source[i] === "*" && source[i + 1] === "/")) {
        if (source[i] === "\n") out += "\n";
        i++;
      }
      i += 2;
      continue;
    }

    out += ch;
    i++;
  }

  return out;
}

function readQuotedString(source, startIndex) {
  const quote = source[startIndex];
  let value = "";
  let i = startIndex + 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "\\" && i + 1 < source.length) {
      value += source[i + 1];
      i += 2;
      continue;
    }
    if (ch === quote) {
      return { value, endIndex: i + 1 };
    }
    value += ch;
    i++;
  }
  return { value, endIndex: i };
}

function normalizePath(...parts) {
  const joined = parts
    .map((p) => p.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
  return "/" + joined;
}

/**
 * Extract all V1 API routes ("METHOD /path") from Laravel routes/api.php.
 */
export function parseRoutes(phpSource) {
  const src = stripPhpComments(phpSource);
  const routes = new Set();
  const groupStack = [];
  let pendingHeader = "";

  const isInV1Group = () =>
    groupStack.some((g) => g.prefix && g.prefix.replace(/^\/+|\/+$/g, "") === "v1");

  let i = 0;
  while (i < src.length) {
    const ch = src[i];

    if (ch === "'" || ch === '"') {
      const str = readQuotedString(src, i);
      pendingHeader += src.slice(i, str.endIndex);
      i = str.endIndex;
      continue;
    }

    if (ch === "{") {
      const isGroup = /\bRoute\b[\s\S]*\bgroup\s*\(\s*(?:static\s+)?function\b/.test(pendingHeader);
      let prefix = "";
      if (isGroup) {
        const prefixMatch = pendingHeader.match(/prefix\s*\(\s*(['"])([^'"]*)\1\s*\)/);
        if (prefixMatch) prefix = prefixMatch[2];
      }
      groupStack.push({ isGroup, prefix });
      pendingHeader = "";
      i++;
      continue;
    }

    if (ch === "}") {
      groupStack.pop();
      pendingHeader = "";
      i++;
      continue;
    }

    if (ch === ";") {
      if (isInV1Group()) {
        const routeMatch = pendingHeader.match(
          /\bRoute\s*::\s*(get|post|put|patch|delete)\s*\(\s*(['"])([^'"]*)\2/i,
        );
        if (routeMatch) {
          const method = routeMatch[1].toUpperCase();
          const rawPath = routeMatch[3];
          const activePrefixes = groupStack.filter((g) => g.isGroup && g.prefix).map((g) => g.prefix);
          let fullPath = normalizePath(...activePrefixes, rawPath);
          if (fullPath === "/v1") fullPath = "/";
          else if (fullPath.startsWith("/v1/")) fullPath = fullPath.slice(3);
          routes.add(`${method} ${fullPath}`);
        }
      }
      pendingHeader = "";
      i++;
      continue;
    }

    pendingHeader += ch;
    i++;
  }

  return [...routes].sort();
}

function skipWhitespace(src, idx) {
  let i = idx;
  while (i < src.length && /\s/.test(src[i])) i++;
  return i;
}

function extractTopLevelKeysFromArray(src, openBracketIdx) {
  const keys = [];
  let relArrayDepth = 1;
  let relBraceDepth = 0;
  let relParenDepth = 0;
  let i = openBracketIdx + 1;

  while (i < src.length && relArrayDepth > 0) {
    const ch = src[i];

    if (ch === "'" || ch === '"') {
      const str = readQuotedString(src, i);
      const after = skipWhitespace(src, str.endIndex);
      if (relArrayDepth === 1 && relBraceDepth === 0 && relParenDepth === 0 && src.slice(after, after + 2) === "=>") {
        keys.push(str.value);
      }
      i = str.endIndex;
      continue;
    }

    if (ch === "[") relArrayDepth++;
    else if (ch === "]") relArrayDepth--;
    else if (ch === "{") relBraceDepth++;
    else if (ch === "}") relBraceDepth = Math.max(0, relBraceDepth - 1);
    else if (ch === "(") relParenDepth++;
    else if (ch === ")") relParenDepth = Math.max(0, relParenDepth - 1);

    i++;
  }

  return { keys, endIndex: i };
}

function extractTopLevelKeysFromArrayMerge(src, openParenIdx) {
  const keys = [];
  let relParenDepth = 1;
  let relArrayDepth = 0;
  let relBraceDepth = 0;
  let expectingArgStart = true;
  let i = openParenIdx + 1;

  while (i < src.length && relParenDepth > 0) {
    const ch = src[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (ch === "'" || ch === '"') {
      expectingArgStart = false;
      const str = readQuotedString(src, i);
      i = str.endIndex;
      continue;
    }

    if (ch === "[" && expectingArgStart && relParenDepth === 1 && relBraceDepth === 0 && relArrayDepth === 0) {
      const res = extractTopLevelKeysFromArray(src, i);
      keys.push(...res.keys);
      i = res.endIndex;
      expectingArgStart = false;
      continue;
    }

    if (ch === "," && relParenDepth === 1 && relArrayDepth === 0 && relBraceDepth === 0) {
      expectingArgStart = true;
      i++;
      continue;
    }

    expectingArgStart = false;
    if (ch === "(") relParenDepth++;
    else if (ch === ")") relParenDepth--;
    else if (ch === "[") relArrayDepth++;
    else if (ch === "]") relArrayDepth = Math.max(0, relArrayDepth - 1);
    else if (ch === "{") relBraceDepth++;
    else if (ch === "}") relBraceDepth = Math.max(0, relBraceDepth - 1);

    i++;
  }

  return { keys, endIndex: i };
}

/**
 * Extract top-level validated request field names from a FormRequest / trait.
 * Returns null when the file defines neither rules() nor filterRules().
 */
export function parseRequestFields(phpSource) {
  const src = stripPhpComments(phpSource);
  const fnRegex = /\bfunction\s+(?:rules|filterRules)\s*\(/g;
  const fields = new Set();
  let foundAnyFn = false;
  let match;

  while ((match = fnRegex.exec(src)) !== null) {
    foundAnyFn = true;
    // Advance past parameter list and optional return type to the opening '{'
    let i = match.index + match[0].length;
    let parenDepth = 1;
    while (i < src.length && parenDepth > 0) {
      const ch = src[i];
      if (ch === "'" || ch === '"') {
        i = readQuotedString(src, i).endIndex;
        continue;
      }
      if (ch === "(") parenDepth++;
      else if (ch === ")") parenDepth--;
      i++;
    }
    while (i < src.length && src[i] !== "{") {
      if (src[i] === ";") {
        i = -1;
        break;
      }
      i++;
    }
    if (i < 0 || i >= src.length) continue;

    // Scan the method body
    let braceDepth = 1;
    let arrayDepth = 0;
    i++;

    while (i < src.length && braceDepth > 0) {
      const ch = src[i];

      if (ch === "'" || ch === '"') {
        i = readQuotedString(src, i).endIndex;
        continue;
      }

      if (ch === "{") {
        braceDepth++;
        i++;
        continue;
      }
      if (ch === "}") {
        braceDepth--;
        i++;
        continue;
      }
      if (ch === "[") {
        arrayDepth++;
        i++;
        continue;
      }
      if (ch === "]") {
        arrayDepth = Math.max(0, arrayDepth - 1);
        i++;
        continue;
      }

      if (arrayDepth === 0 && /\breturn\b/.test(src.slice(i, i + 6))) {
        const prev = i > 0 ? src[i - 1] : " ";
        const next = src[i + 6] ?? " ";
        if (!/[A-Za-z0-9_$]/.test(prev) && !/[A-Za-z0-9_$]/.test(next)) {
          let after = skipWhitespace(src, i + 6);
          if (src[after] === "[") {
            const res = extractTopLevelKeysFromArray(src, after);
            for (const k of res.keys) fields.add(k);
            i = res.endIndex;
            continue;
          }
          if (src.slice(after).startsWith("array_merge")) {
            const parenIdx = skipWhitespace(src, after + "array_merge".length);
            if (src[parenIdx] === "(") {
              const res = extractTopLevelKeysFromArrayMerge(src, parenIdx);
              for (const k of res.keys) fields.add(k);
              i = res.endIndex;
              continue;
            }
          }
        }
      }

      i++;
    }
  }

  if (!foundAnyFn) return null;
  return [...fields].sort();
}

function githubHeaders(accept) {
  const headers = {
    Accept: accept,
    "User-Agent": "solidtime-cli-api-drift",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

async function fetchText(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}: ${await res.text()}`);
  }
  return res.text();
}

async function mapConcurrent(items, limit, fn) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const idx = nextIndex++;
      results[idx] = await fn(items[idx]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

async function fetchUpstreamSnapshot() {
  const treeUrl = `https://api.github.com/repos/${UPSTREAM_REPO}/git/trees/${UPSTREAM_BRANCH}?recursive=1`;
  const treeText = await fetchText(treeUrl, githubHeaders("application/vnd.github+json"));
  const treeData = JSON.parse(treeText);
  if (!Array.isArray(treeData.tree)) {
    throw new Error(`Unexpected tree response from GitHub API for ${UPSTREAM_REPO}`);
  }

  const requestPaths = treeData.tree
    .filter((entry) => entry.type === "blob" && entry.path.startsWith(REQUEST_PREFIX) && entry.path.endsWith(".php"))
    .map((entry) => entry.path)
    .sort();

  const rawHeaders = githubHeaders("text/plain");
  const rawBase = `https://raw.githubusercontent.com/${UPSTREAM_REPO}/${UPSTREAM_BRANCH}`;

  const [routesPhp, requestContents] = await Promise.all([
    fetchText(`${rawBase}/routes/api.php`, rawHeaders),
    mapConcurrent(requestPaths, FETCH_CONCURRENCY, async (p) => ({
      relPath: p.slice(REQUEST_PREFIX.length),
      source: await fetchText(`${rawBase}/${p}`, rawHeaders),
    })),
  ]);

  const routes = parseRoutes(routesPhp);
  const requests = {};
  for (const { relPath, source } of requestContents) {
    const fields = parseRequestFields(source);
    if (fields !== null) {
      requests[relPath] = fields;
    }
  }

  return {
    upstream: UPSTREAM_REPO,
    branch: UPSTREAM_BRANCH,
    routes,
    requests,
  };
}

export function diffSnapshots(expected, actual) {
  const lines = [];

  const expRoutes = new Set(expected.routes ?? []);
  const actRoutes = new Set(actual.routes ?? []);
  for (const r of [...expRoutes].sort()) {
    if (!actRoutes.has(r)) lines.push(`- route: ${r}`);
  }
  for (const r of [...actRoutes].sort()) {
    if (!expRoutes.has(r)) lines.push(`+ route: ${r}`);
  }

  const expReqs = expected.requests ?? {};
  const actReqs = actual.requests ?? {};
  const allReqFiles = new Set([...Object.keys(expReqs), ...Object.keys(actReqs)]);
  for (const file of [...allReqFiles].sort()) {
    if (!(file in actReqs)) {
      lines.push(`- request: ${file}`);
      continue;
    }
    if (!(file in expReqs)) {
      lines.push(`+ request: ${file}`);
      continue;
    }
    const expFields = new Set(expReqs[file]);
    const actFields = new Set(actReqs[file]);
    for (const f of [...expFields].sort()) {
      if (!actFields.has(f)) lines.push(`- request ${file}: ${f}`);
    }
    for (const f of [...actFields].sort()) {
      if (!expFields.has(f)) lines.push(`+ request ${file}: ${f}`);
    }
  }

  return lines;
}

function parseArgs(argv) {
  const opts = {
    update: false,
    snapshot: DEFAULT_SNAPSHOT,
    compare: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--update") {
      opts.update = true;
    } else if (arg === "--snapshot") {
      opts.snapshot = argv[++i];
      if (!opts.snapshot) throw new Error("--snapshot requires a path");
    } else if (arg === "--compare") {
      opts.compare = argv[++i];
      if (!opts.compare) throw new Error("--compare requires a path");
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const snapshotPath = resolve(opts.snapshot);

  if (opts.update) {
    const snapshot = await fetchUpstreamSnapshot();
    writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2) + "\n", "utf-8");
    console.log(
      `Updated ${opts.snapshot} (${snapshot.routes.length} routes, ${Object.keys(snapshot.requests).length} request schemas).`,
    );
    return;
  }

  const expected = JSON.parse(readFileSync(snapshotPath, "utf-8"));
  const actual = opts.compare
    ? JSON.parse(readFileSync(resolve(opts.compare), "utf-8"))
    : await fetchUpstreamSnapshot();

  const diff = diffSnapshots(expected, actual);
  if (diff.length > 0) {
    console.error(`API drift detected against ${opts.snapshot}:`);
    for (const line of diff) {
      console.error(`  ${line}`);
    }
    process.exit(1);
  }

  console.log(
    `No API drift detected (${actual.routes.length} routes, ${Object.keys(actual.requests).length} request schemas match ${opts.snapshot}).`,
  );
}

const isCliEntry = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
if (isCliEntry) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
