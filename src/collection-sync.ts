/**
 * Cheap collection update. Archidekt's collection API returns records newest-first by default,
 * so page 1 tells us whether cards were added. Known records on the fetched pages get refreshed too.
 * Anything we can't reconcile (deletions, more new records than we scanned) → caller does a full reload.
 */
import type { CollectionRecord } from "./allocation";

export interface MergeResult {
  records: CollectionRecord[];
  complete: boolean; // true if the merged list matches the server count
  added: number;
}

export function mergeNewestPages(cached: CollectionRecord[], fetched: CollectionRecord[], serverCount: number): MergeResult {
  const known = new Map(cached.map((r) => [r.id, r]));
  let added = 0;
  for (const r of fetched) {
    if (!known.has(r.id)) added++;
    known.set(r.id, r); // new or refreshed (quantity/finish edits on these pages)
  }
  const records = [...known.values()];
  return { records, complete: records.length === serverCount, added };
}

/** Did the scanned pages reach records we already knew? If not, there may be more new ones on later pages. */
export function reachedKnown(cached: CollectionRecord[], fetched: CollectionRecord[]): boolean {
  const ids = new Set(cached.map((r) => r.id));
  return fetched.some((r) => ids.has(r.id));
}
