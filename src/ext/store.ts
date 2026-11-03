/**
 * Cache + sync. Collection: full reload when older than COLLECTION_TTL or on demand (35 requests for ~3.5k records).
 * Decks: deck list is cheap (1 request); single decks are only refetched when their updatedAt changed.
 */
import { applyExclusions, type CollectionRecord, type Deck } from "../allocation";
import { parseApiDeck, parseCollectionPage } from "../archidekt";
import { mergeNewestPages, reachedKnown } from "../collection-sync";
import { getJson } from "./api";
import { DEFAULT_SETTINGS, type Settings } from "./settings";

const KEY = "deckAllocator.v4"; // v4: collection records carry printing objects (search swap)
const DECK_SCHEMA = 2; // bump to refetch decks only (v2: slots carry category info)
const QUICK_CHECK_MIN_GAP_MS = 60 * 1000;
const QUICK_CHECK_MAX_PAGES = 3;

export interface CachedDeck {
  updatedAt: string;
  schema?: number;
  deck: Deck;
}

export interface Cache {
  userId?: number;
  collection?: { fetchedAt: number; checkedAt?: number; records: CollectionRecord[] };
  decks: Record<string, CachedDeck>;
}

export type Progress = (msg: string) => void;

const ext: typeof chrome = (globalThis as any).browser ?? chrome;

export async function loadCache(): Promise<Cache> {
  const got = await ext.storage.local.get(KEY);
  return (got[KEY] as Cache) ?? { decks: {} };
}

async function saveCache(c: Cache) {
  await ext.storage.local.set({ [KEY]: c });
}

export async function clearCache() {
  await ext.storage.local.remove(KEY);
}

export async function sync(opts: { forceCollection?: boolean; progress?: Progress; settings?: Settings } = {}): Promise<Cache> {
  const settings = opts.settings ?? DEFAULT_SETTINGS;
  const progress = opts.progress ?? (() => {});
  const wait = (s: number) => progress(`Archidekt rate limit — waiting ${s}s…`);
  const cache = await loadCache();

  const list = await getJson<{ results: any[] }>("/api/decks/curated/self/", wait);
  const userId = list.results[0]?.owner?.id ?? cache.userId;
  if (cache.userId && userId && cache.userId !== userId) {
    // different account logged in → start over
    cache.collection = undefined;
    cache.decks = {};
  }
  cache.userId = userId;

  // decks: drop deleted, fetch changed
  const seen = new Set<string>();
  const changed = list.results.filter((d) => {
    const id = String(d.id);
    seen.add(id);
    const c = cache.decks[id];
    return !c || c.updatedAt !== String(d.updatedAt) || c.schema !== DECK_SCHEMA;
  });
  for (const id of Object.keys(cache.decks)) if (!seen.has(id)) delete cache.decks[id];
  for (const [i, d] of changed.entries()) {
    progress(`Loading deck ${i + 1}/${changed.length}: ${d.name}`);
    const raw = await getJson(`/api/decks/${d.id}/`, wait);
    cache.decks[String(d.id)] = { updatedAt: String(d.updatedAt), schema: DECK_SCHEMA, deck: parseApiDeck(raw) };
    await saveCache(cache);
  }

  // collection
  if (userId) await syncCollection(cache, userId, opts.forceCollection ?? false, settings, progress, wait);
  progress("");
  return cache;
}

async function fullCollectionReload(cache: Cache, userId: number, progress: Progress, wait: (s: number) => void) {
  const records: CollectionRecord[] = [];
  let page = 1;
  let total = 1;
  do {
    progress(`Loading collection page ${page}/${total}`);
    const data = await getJson<any>(`/api/collection/${userId}/v2/?page=${page}`, wait);
    total = data.totalPages ?? 1;
    records.push(...parseCollectionPage(data));
    page++;
  } while (page <= total);
  cache.collection = { fetchedAt: Date.now(), checkedAt: Date.now(), records };
  await saveCache(cache);
}

async function syncCollection(
  cache: Cache,
  userId: number,
  force: boolean,
  settings: Settings,
  progress: Progress,
  wait: (s: number) => void,
) {
  const c = cache.collection;
  const stale = !c || Date.now() - c.fetchedAt > settings.fullReloadHours * 3600 * 1000;
  if (force || stale) return fullCollectionReload(cache, userId, progress, wait);
  if (c.checkedAt && Date.now() - c.checkedAt < QUICK_CHECK_MIN_GAP_MS) return;

  // Quick check: newest-first pages until we reach records we already know.
  const fetched: CollectionRecord[] = [];
  let count = 0;
  for (let page = 1; page <= QUICK_CHECK_MAX_PAGES; page++) {
    const data = await getJson<any>(`/api/collection/${userId}/v2/?page=${page}`, wait);
    count = data.count;
    fetched.push(...parseCollectionPage(data));
    if (reachedKnown(c.records, fetched) || page >= (data.totalPages ?? 1)) break;
  }
  const merged = mergeNewestPages(c.records, fetched, count);
  if (!merged.complete || !reachedKnown(c.records, fetched)) return fullCollectionReload(cache, userId, progress, wait);
  cache.collection = { ...c, checkedAt: Date.now(), records: merged.records };
  await saveCache(cache);
}

/** Decks with the user's category exclusions applied. */
export function decksForAllocation(cache: Cache, settings: Settings = DEFAULT_SETTINGS): Deck[] {
  return applyExclusions(decksOf(cache), settings.excludedCategories);
}

export function decksOf(cache: Cache): Deck[] {
  return Object.values(cache.decks).map((d) => d.deck);
}

/** Forget one deck so the next sync refetches it (after we edited it). */
export async function invalidateDeck(deckId: string) {
  const c = await loadCache();
  delete c.decks[deckId];
  await saveCache(c);
}
