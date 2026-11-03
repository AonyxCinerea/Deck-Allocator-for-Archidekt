/** Archidekt API access from the content script: JWT from the site's own cookie, throttled, 429-aware. */

const MIN_GAP_MS = 1200;
let lastRequest = 0;
let queue: Promise<unknown> = Promise.resolve();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function jwt(): string | undefined {
  for (const part of document.cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === "tbJwt") return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export class AuthError extends Error {}

export function getJson<T = any>(path: string, onWait?: (s: number) => void): Promise<T> {
  return enqueue(() => request<T>(path, onWait));
}

export function patchJson<T = any>(path: string, body: unknown): Promise<T> {
  return enqueue(() => request<T>(path, undefined, { method: "PATCH", body: JSON.stringify(body) }));
}

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  // serialize all requests so the gap holds across callers
  const p = queue.then(fn);
  queue = p.catch(() => undefined);
  return p;
}

async function request<T>(path: string, onWait?: (s: number) => void, init: { method?: string; body?: string } = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const wait = lastRequest + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    const token = jwt();
    const res = await fetch(new URL(path, location.origin).toString(), {
      method: init.method ?? "GET",
      body: init.body,
      credentials: "include",
      headers: {
        accept: "application/json",
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `JWT ${token}` } : {}),
      },
    });
    if (res.status === 401 || res.status === 403) throw new AuthError(`Not logged in (${res.status})`);
    if (res.status === 429 && attempt < 5) {
      const s = Number(res.headers.get("retry-after")) || 2 * 2 ** attempt;
      onWait?.(s);
      await sleep(s * 1000);
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} for ${path}`);
    return res.json();
  }
}
