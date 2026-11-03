/**
 * Console spike: paste the built bundle into DevTools on archidekt.com while logged in.
 * Loads the whole collection + all own decks, runs the allocation and prints a report.
 */
import { allocate, type CollectionRecord, type Deck } from "./allocation";
import { parseAnyDeck, parseCollectionPage } from "./archidekt";

const log = (...a: unknown[]) => console.log("%c[deck-allocator]", "color:#7c3aed;font-weight:bold", ...a);

const JWT_RE = /eyJ[\w-]+\.[\w-]+\.[\w-]+/;

/** Archidekt authenticates API calls with a JWT header, not cookies. Find the token the site stored. */
function findTokens(): { where: string; token: string }[] {
  const found: { where: string; token: string }[] = [];
  for (const part of document.cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    const m = decodeURIComponent(rest.join("=")).match(JWT_RE);
    if (m) found.push({ where: `cookie:${name}`, token: m[0] });
  }
  for (const store of [localStorage, sessionStorage]) {
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i)!;
      const m = (store.getItem(k) ?? "").match(JWT_RE);
      if (m) found.push({ where: `${store === localStorage ? "localStorage" : "sessionStorage"}:${k}`, token: m[0] });
    }
  }
  return found;
}

let authHeader: string | undefined;
const authInfo: Record<string, unknown> = {};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MIN_GAP_MS = 400; // Archidekt answers 429 after ~40 rapid requests
let lastRequest = 0;

async function throttledFetch(url: string, auth?: string): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const wait = lastRequest + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    const res = await fetch(url, { credentials: "include", headers: { accept: "application/json", ...(auth ? { authorization: auth } : {}) } });
    if (res.status !== 429 || attempt >= 5) return res;
    const retryAfter = Number(res.headers.get("retry-after")) * 1000 || 2000 * 2 ** attempt;
    log(`rate limited, waiting ${Math.round(retryAfter / 1000)}s…`);
    await sleep(retryAfter);
  }
}

async function getJson(url: string): Promise<any> {
  const doFetch = (auth?: string) => throttledFetch(url, auth);

  let res = await doFetch(authHeader);
  if (res.status === 401 && !authHeader) {
    const tokens = findTokens();
    authInfo.tokenLocations = tokens.map((t) => t.where); // locations only, never the token
    outer: for (const { where, token } of tokens) {
      for (const scheme of ["JWT", "Bearer"]) {
        const r = await doFetch(`${scheme} ${token}`);
        if (r.ok) {
          authHeader = `${scheme} ${token}`;
          authInfo.used = { where, scheme };
          log(`authenticated via ${where} (${scheme})`);
          res = r;
          break outer;
        }
      }
    }
    if (!authHeader) {
      throw new Error(
        `401 for ${url}. Token candidates: ${tokens.map((t) => t.where).join(", ") || "none found"}. ` +
          "Open Network tab, click any /api/ request, and tell me the start of the 'authorization' request header (e.g. 'JWT eyJ…' — don't send the full value).",
      );
    }
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

async function run() {
  const probe: Record<string, unknown> = {};

  const deckList = await getJson("/api/decks/curated/self/");
  const userId = deckList.results?.[0]?.owner?.id;
  if (!userId) throw new Error("No own decks found — are you logged in?");
  log(`user ${userId}, ${deckList.results.length} decks`);

  // Collection, 100 per page
  const collection: CollectionRecord[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const data = await getJson(`/api/collection/${userId}/v2/?page=${page}`);
    if (page === 1) probe.collectionPageKeys = Object.keys(data);
    totalPages = data.totalPages ?? Math.ceil((data.count ?? 0) / Math.max(data.results.length, 1));
    collection.push(...parseCollectionPage(data));
    log(`collection page ${page}/${totalPages}`);
    page++;
  } while (page <= totalPages);

  // Decks
  const decks: Deck[] = [];
  const failedDecks: string[] = [];
  for (const d of deckList.results) {
    try {
      const raw = await getJson(`/api/decks/${d.id}/`);
      if (!probe.apiDeckSample) probe.apiDeckSample = sampleDeck(raw);
      const deck = parseAnyDeck(raw);
      if (!deck.name || deck.slots.length === 0) throw new Error("could not parse deck");
      decks.push(deck);
      log(`deck ${deck.name}: ${deck.slots.length} slots${deck.physical ? "" : " (theorycrafted)"}`);
    } catch (e) {
      failedDecks.push(`${d.name}: ${e}`);
      console.warn("[deck-allocator] deck failed", d.name, e);
    }
  }
  probe.failedDecks = failedDecks;

  const result = allocate(collection, decks);

  const conflicts = result.slots
    .filter((s) => s.status.kind === "conflict")
    .map((s) => ({
      deck: decks.find((d) => d.id === s.deckId)!.name,
      card: s.slot.name,
      missing: s.status.kind === "conflict" ? s.status.missing : 0,
      freeAlternatives: s.status.kind === "conflict" ? s.status.alternatives.map((a) => `${a.record.setCode} ×${a.free}`).join(", ") : "",
    }));
  const swappable = result.slots
    .filter((s) => s.status.kind === "swappable")
    .map((s) => ({
      deck: decks.find((d) => d.id === s.deckId)!.name,
      card: s.slot.name,
      freeOwned: s.status.kind === "swappable" ? s.status.alternatives.map((a) => `${a.record.setCode} ×${a.free}`).join(", ") : "",
    }));
  const missing = result.slots.filter((s) => s.status.kind === "missing").length;
  const owned = result.slots.filter((s) => s.status.kind === "owned").length;
  const totalCopies = collection.reduce((n, r) => n + r.quantity, 0);
  const freeCopies = [...result.records.values()].reduce((n, r) => n + Math.max(r.free, 0), 0);

  log(`collection: ${collection.length} records / ${totalCopies} copies, ${freeCopies} free (not in any deck)`);
  log(`deck slots: ${owned} owned exactly, ${conflicts.length} conflicts, ${swappable.length} could use a free owned printing, ${missing} not owned`);
  log("Conflicts (exact printing already used by an older deck):");
  console.table(conflicts);
  log("Swappable (deck uses an unowned printing, but you own a free copy of another):");
  console.table(swappable);

  (window as any).deckAllocator = { collection, decks, result, conflicts, swappable };
  probe.auth = authInfo;
  const report = { summary: { decks: decks.length, failedDecks: failedDecks.length, records: collection.length, totalCopies, freeCopies, owned, missing, conflicts: conflicts.length, swappable: swappable.length }, probe, conflicts, swappable };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(report, null, 1)], { type: "application/json" }));
  a.download = "deck-allocator-report.json";
  a.click();
  log("Done. Report downloaded; full data in window.deckAllocator");
}

/** Keep only structure + 2 cards, so the report reveals the REST deck shape without bloat. */
function sampleDeck(raw: any) {
  return { keys: Object.keys(raw), categories: raw.categories?.slice?.(0, 3), cards: raw.cards?.slice?.(0, 2) };
}

run().catch((e) => console.error("[deck-allocator] failed:", e));
