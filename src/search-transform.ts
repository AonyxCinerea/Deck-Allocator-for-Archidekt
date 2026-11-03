/**
 * Rewrites Archidekt card search responses (GET /api/cards/v2/...) before the page sees them:
 *  - reorder: printings/cards you own come first (free before used), otherwise Archidekt's order is kept
 *  - swap (deck pages only): a unique-card search result is replaced by your free non-foil copy of that card,
 *    so Archidekt's own "add" puts your printing into the deck
 */
import type { AllocationResult } from "./allocation";

export interface OwnedInfo {
  owned: number;
  free: number;
}

export interface OwnedIndex {
  byOracle: Record<string, OwnedInfo & { swapTo?: Record<string, unknown> }>;
  byPrinting: Record<string, OwnedInfo>;
}

export function buildOwnedIndex(result: AllocationResult): OwnedIndex {
  const byOracle: OwnedIndex["byOracle"] = {};
  const byPrinting: OwnedIndex["byPrinting"] = {};
  const swapCandidates: Record<string, { free: number; printing: Record<string, unknown> }> = {};
  for (const ra of result.records.values()) {
    const r = ra.record;
    const free = Math.max(ra.free, 0);
    const o = (byOracle[r.oracleId] ??= { owned: 0, free: 0 });
    o.owned += r.quantity;
    o.free += free;
    const p = (byPrinting[r.printingId] ??= { owned: 0, free: 0 });
    p.owned += r.quantity;
    p.free += free;
    // only non-foil copies are swap targets: search adds cards as "Normal"
    if (free > 0 && r.finish === "nonfoil" && r.printing) {
      const best = swapCandidates[r.oracleId];
      if (!best || free > best.free) swapCandidates[r.oracleId] = { free, printing: r.printing };
    }
  }
  for (const [oracle, c] of Object.entries(swapCandidates)) byOracle[oracle].swapTo = c.printing;
  return { byOracle, byPrinting };
}

export type SearchKind = "names" | "printings" | "other";

/**
 * Card search endpoints (/api/cards/v2/ and future versions). Quick add, the deck "Search" overlay and the site-wide
 * card search all use them with different parameters:
 *  - oracleCardIds + exact  → all printings of one card (printing picker)
 *  - oracleCardIds          → the deck loading its own cards/tokens: leave alone
 *  - unique                 → one printing per card ("one print per result", quick add)
 *  - otherwise              → every printing ("all prints")
 */
export function classifySearch(url: string): SearchKind {
  const u = new URL(url, "https://archidekt.com");
  if (!/^\/api\/cards\/v\d+\/?$/.test(u.pathname)) return "other";
  if (u.searchParams.has("oracleCardIds")) return u.searchParams.has("exact") ? "printings" : "other";
  return u.searchParams.has("unique") ? "names" : "printings";
}

export interface TransformOptions {
  reorder: boolean;
  swap: boolean;
}

export const MARK = "__deckAllocator";

export function transformCardResults(data: any, kind: SearchKind, index: OwnedIndex, opts: TransformOptions): any {
  if (!data || !Array.isArray(data.results) || kind === "other") return data;
  if (!data.results.every((c: any) => c && c.oracleCard && "edition" in c)) return data; // not card objects
  let results: any[] = data.results;

  if (kind === "names" && opts.swap) {
    results = results.map((card) => {
      const info = index.byOracle[String(card?.oracleCard?.id)];
      const target = info?.swapTo;
      if (!target || String(target.id) === String(card.id)) return card;
      const p = index.byPrinting[String(target.id)];
      return {
        ...card,
        ...target,
        oracleCard: card.oracleCard,
        owned: p?.owned ?? card.owned,
        [MARK]: { swappedFrom: card?.edition?.editioncode, to: (target.edition as any)?.editioncode },
      };
    });
  }

  if (opts.reorder) {
    const rank = (card: any) => {
      const info = kind === "printings" ? index.byPrinting[String(card?.id)] : index.byOracle[String(card?.oracleCard?.id)];
      return !info ? 2 : info.free > 0 ? 0 : 1;
    };
    results = results.map((c, i) => [rank(c), i, c] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((x) => x[2]);
  }
  return { ...data, results };
}
