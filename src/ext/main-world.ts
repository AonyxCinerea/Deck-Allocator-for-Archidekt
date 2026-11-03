import { classifySearch, transformCardResults, type OwnedIndex } from "../search-transform";
/**
 * Runs in the page's MAIN world (needed to read React internals).
 * Stamps each collection row with the Archidekt collection record id: data-da-record-id="560683989".
 * The isolated content script reads that attribute and renders the badge.
 */

const ROW_SELECTOR = '[class*="textCollectionCard_cardRow"]';

function looksLikeRecord(o: any): o is { id: number } {
  return o && typeof o === "object" && typeof o.id === "number" && "quantity" in o && ("condition" in o || "modifier" in o) && "card" in o;
}

function findRecord(props: any, depth = 0): number | undefined {
  if (!props || typeof props !== "object" || depth > 2) return;
  if (looksLikeRecord(props)) return props.id;
  for (const v of Object.values(props)) {
    if (v && typeof v === "object" && !(v instanceof Node) && !Array.isArray(v)) {
      const id = findRecord(v, depth + 1);
      if (id) return id;
    }
  }
}

function recordIdFor(row: Element): number | undefined {
  const key = Object.keys(row).find((k) => k.startsWith("__reactFiber$"));
  let fiber = key ? (row as any)[key] : undefined;
  for (let i = 0; fiber && i < 25; i++, fiber = fiber.return) {
    const id = findRecord(fiber.memoizedProps);
    if (id) return id;
  }
}

function scan() {
  let found = 0;
  let failed = 0;
  for (const row of document.querySelectorAll(ROW_SELECTOR)) {
    const id = recordIdFor(row);
    const v = id ? String(id) : "";
    if (row.getAttribute("data-da-record-id") !== v) row.setAttribute("data-da-record-id", v);
    id ? found++ : failed++;
  }
  document.documentElement.setAttribute("data-da-scan", `${found}/${found + failed}`);
}

let pending = false;
new MutationObserver(() => {
  if (pending) return;
  pending = true;
  setTimeout(() => {
    pending = false;
    scan();
  }, 250);
}).observe(document.documentElement, { childList: true, subtree: true });

// --- fetch hook: rewrite card searches, report cards added to decks -------------------------------

const MSG = "deck-allocator";
let index: OwnedIndex | undefined;
let opts = { reorder: true, swap: true };

window.addEventListener("message", (e) => {
  if (e.source !== window || e.data?.source !== `${MSG}:ext`) return;
  if (e.data.type === "index") {
    index = e.data.index;
    opts = e.data.opts;
  }
});

const origFetch = window.fetch;
window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const res = await origFetch.call(this, input as any, init);
  try {
    if (method === "GET" && index && res.ok) {
      const kind = classifySearch(url);
      if (kind !== "other") {
        const swap = opts.swap && location.pathname.startsWith("/decks/");
        const data = transformCardResults(await res.clone().json(), kind, index, { reorder: opts.reorder, swap });
        return new Response(JSON.stringify(data), { status: res.status, statusText: res.statusText, headers: res.headers });
      }
    }
    const m = url.match(/\/api\/decks\/(\d+)\/modifyCards\/v2\//);
    if (m && method === "PATCH" && res.ok) {
      res
        .clone()
        .json()
        .then((body: any) => {
          const added = (body?.add ?? []).map((a: any) => ({ deckRelationId: String(a.deckRelationId), cardId: String(a.cardId) }));
          if (added.length) window.postMessage({ source: `${MSG}:page`, type: "cardsAdded", deckId: m[1], added }, location.origin);
        })
        .catch(() => {});
    }
  } catch (e) {
    console.warn("[deck-allocator] fetch hook", e);
  }
  return res;
};
