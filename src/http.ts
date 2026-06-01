// HTTP helper with browser-like headers, exponential backoff on 403/429/503,
// and an optional on-disk JSON cache. Ported from the distressed-scraper
// enrich_addresses.py fetch loop (pagination/backoff/cache pattern).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const CACHE_DIR = join(process.cwd(), ".cache");

export const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function cacheKey(url: string): string {
  // Hash the FULL url — a truncated prefix collides when the distinguishing
  // part (e.g. a keyset `PIN > '...'` cursor) sits past the cutoff.
  const hash = createHash("sha1").update(url).digest("hex").slice(0, 24);
  const hint = url
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/gi, "_")
    .slice(0, 60);
  return `${hint}_${hash}.json`;
}

export interface FetchOpts {
  headers?: Record<string, string>;
  retries?: number;
  cache?: boolean;
  timeoutMs?: number;
}

// Fetch JSON with retry/backoff. Returns parsed JSON, or throws after retries.
export async function fetchJson<T = unknown>(
  url: string,
  opts: FetchOpts = {},
): Promise<T> {
  const { headers = {}, retries = 5, cache = false, timeoutMs = 25_000 } = opts;

  if (cache) {
    mkdirSync(CACHE_DIR, { recursive: true });
    const cp = join(CACHE_DIR, cacheKey(url));
    if (existsSync(cp)) return JSON.parse(readFileSync(cp, "utf8")) as T;
  }

  let backoff = 1000;
  let lastErr: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { ...BROWSER_HEADERS, ...headers },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.status === 200) {
        const text = await res.text();
        const data = JSON.parse(stripJsonPrefix(text)) as T;
        if (cache) {
          mkdirSync(CACHE_DIR, { recursive: true });
          writeFileSync(join(CACHE_DIR, cacheKey(url)), JSON.stringify(data));
        }
        return data;
      }
      if ([403, 429, 503].includes(res.status)) {
        lastErr = new Error(`HTTP ${res.status} (blocked/rate-limited)`);
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 30_000);
        continue;
      }
      throw new Error(`HTTP ${res.status} for ${url}`);
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 30_000);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

// Redfin and other JSON APIs guard against JSON-hijacking with a leading token
// (`{}&&`, `)]}'`, `while(1);`, `for(;;);`). Strip a known guard, then return.
// Clean JSON (Census/ArcGIS/Socrata) starts with `{`/`[` and passes through.
export function stripJsonPrefix(text: string): string {
  let t = text.trimStart();
  for (const guard of ["{}&&", ")]}'", "while(1);", "for(;;);"]) {
    if (t.startsWith(guard)) {
      t = t.slice(guard.length).trimStart();
      break;
    }
  }
  return t;
}
