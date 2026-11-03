/**
 * Archidekt adapter: turns Archidekt JSON into the platform-agnostic allocation model.
 * Shapes taken from a real capture (Nov 2026):
 *  - collection: GET /api/collection/{userId}/v2/?page=N  (100 per page, {count, results})
 *  - deck list:  GET /api/decks/curated/self/
 *  - deck:       Next.js page data (pageProps.redux.deck, cards in `cardMap`)
 *                or GET /api/decks/{id}/ (cards in `cards[]`, shape not yet verified)
 */
import type { CollectionRecord, Deck, DeckSlot, Finish } from "./allocation";

export interface ArchidektDeckOptions {
  /** folder ids whose decks count as not physically built */
  theoryFolderIds?: number[];
  /** primary categories whose cards aren't physically in the deck box (default: Sideboard, Maybeboard) */
  excludedCategories?: string[];
}

export const DEFAULT_EXCLUDED_CATEGORIES = ["Sideboard", "Maybeboard"];

export function finishOf(modifier: string | undefined, foil?: boolean): Finish {
  const m = (modifier ?? "").toLowerCase();
  if (m === "foil" || foil) return "foil";
  if (m === "etched") return "etched";
  return "nonfoil";
}

const isBasicLand = (superTypes: string[] = [], types: string[] = []) =>
  superTypes.includes("Basic") && types.includes("Land");

// --- collection ---

/** The printing part of a card object (same shape in collection and search responses), minus the heavy oracle data. */
export function printingSubset(card: any): Record<string, unknown> {
  const { oracleCard: _o, flavor: _f, globalCategories: _g, ...rest } = card ?? {};
  return rest;
}

export function parseCollectionPage(page: { results: any[] }): CollectionRecord[] {
  return page.results.map((r) => ({
    id: String(r.id),
    name: r.card.oracleCard.name,
    oracleId: String(r.card.oracleCard.id),
    printingId: String(r.card.id),
    finish: finishOf(r.modifier, r.foil),
    quantity: r.quantity,
    setCode: r.card.edition?.editioncode,
    collectorNumber: r.card.collectorNumber,
    printing: printingSubset(r.card),
  }));
}

// --- decks ------------------------------------------------------------------

type CategoryMap = Record<string, { includedInDeck: boolean }>;

/** Archidekt uses a card's first category as its primary one ("Sideboard" first => sideboard). */
function platformInDeck(categories: string[], cats: CategoryMap): boolean {
  const primary = categories?.[0];
  return primary ? (cats[primary]?.includedInDeck ?? true) : true;
}

function inDeck(categories: string[], cats: CategoryMap, opts: ArchidektDeckOptions): boolean {
  const primary = categories?.[0];
  if (!primary) return true;
  if ((opts.excludedCategories ?? DEFAULT_EXCLUDED_CATEGORIES).includes(primary)) return false;
  return cats[primary]?.includedInDeck ?? true;
}

function deckMeta(d: any, opts: ArchidektDeckOptions) {
  const folder = d.parentFolder ?? d.parentFolderId;
  const theory = !!d.theorycrafted || (opts.theoryFolderIds ?? []).includes(Number(folder));
  return {
    id: String(d.id),
    name: d.name,
    physical: !theory,
    priority: Date.parse(d.createdAt) || 0,
  };
}

/** Next.js page data: pageProps.redux.deck */
export function parseReduxDeck(d: any, opts: ArchidektDeckOptions = {}): Deck {
  const cats: CategoryMap = d.categories ?? {};
  const slots: DeckSlot[] = Object.values<any>(d.cardMap ?? {})
    .filter((c) => !c.deletedAt)
    .map((c) => ({
      name: c.name,
      oracleId: String(c.oracleCardId),
      printingId: String(c.cardId),
      finish: finishOf(c.modifier),
      quantity: c.qty,
      inDeck: inDeck(c.categories, cats, opts),
      category: c.categories?.[0],
      platformInDeck: platformInDeck(c.categories, cats),
      isBasicLand: isBasicLand(c.superTypes, c.types),
    }));
  return { ...deckMeta(d, opts), slots };
}

/** REST: GET /api/decks/{id}/ — categories is an array, cards carry a nested `card` like the collection API. */
export interface ArchidektSlotRef {
  deckRelationId: string;
  printingId: string;
  categories: string[];
  quantity: number;
  modifier: string;
  customCmc: number | null;
  companion: boolean;
  flippedDefault: boolean;
  label: string;
}

export function parseApiDeck(d: any, opts: ArchidektDeckOptions = {}): Deck {
  const cats: CategoryMap = {};
  for (const c of d.categories ?? []) cats[c.name] = { includedInDeck: c.includedInDeck };
  const slots: DeckSlot[] = (d.cards ?? []).map((c: any) => ({
    name: c.card.oracleCard.name,
    oracleId: String(c.card.oracleCard.id),
    printingId: String(c.card.id),
    finish: finishOf(c.modifier),
    quantity: c.quantity,
    inDeck: inDeck(c.categories, cats, opts),
    category: c.categories?.[0],
    platformInDeck: platformInDeck(c.categories, cats),
    isBasicLand: isBasicLand(c.card.oracleCard.superTypes, c.card.oracleCard.types),
    ref: {
      deckRelationId: String(c.id),
      printingId: String(c.card.id),
      categories: c.categories ?? [],
      quantity: c.quantity,
      modifier: c.modifier ?? "Normal",
      customCmc: c.customCmc ?? null,
      companion: !!c.companion,
      flippedDefault: !!c.flippedDefault,
      label: c.label ?? "",
    } satisfies ArchidektSlotRef,
  }));
  return { ...deckMeta(d, opts), slots };
}

const MODIFIER: Record<Finish, string> = { nonfoil: "Normal", foil: "Foil", etched: "Etched" };

function patchId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 11 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

/**
 * Body for PATCH /api/decks/{id}/modifyCards/v2/ (format captured from Archidekt, Nov 2026).
 * Whole slot → one "modify" (new cardid/modifier on the same deck entry).
 * Part of a slot → "modify" the old entry down to the remaining quantity + "add" the moved copies as the new printing.
 */
export function buildSwitchPatch(changes: { ref: ArchidektSlotRef; targetPrintingId: string; targetFinish: Finish; quantity: number }[]) {
  const cards: any[] = [];
  // several changes may hit the same slot (copies split over printings) → track remaining quantity per entry
  const left = new Map<string, number>();
  for (const ch of changes) {
    const r = ch.ref;
    const remaining = left.get(r.deckRelationId) ?? r.quantity;
    const base = { customCmc: r.customCmc, companion: r.companion, flippedDefault: r.flippedDefault, label: r.label };
    if (ch.quantity >= remaining) {
      cards.push({
        action: "modify",
        cardid: ch.targetPrintingId,
        customCardId: null,
        categories: r.categories,
        patchId: patchId(),
        modifications: { ...base, quantity: remaining, modifier: MODIFIER[ch.targetFinish] },
        deckRelationId: r.deckRelationId,
      });
      left.set(r.deckRelationId, 0);
    } else {
      left.set(r.deckRelationId, remaining - ch.quantity);
      cards.push({
        action: "add",
        cardid: ch.targetPrintingId,
        customCardId: null,
        categories: r.categories,
        patchId: patchId(),
        modifications: { ...base, quantity: ch.quantity, modifier: MODIFIER[ch.targetFinish] },
      });
    }
  }
  // shrink partially moved entries (only those not fully replaced)
  for (const [rel, qty] of left) {
    const r = changes.find((c) => c.ref.deckRelationId === rel)!.ref;
    if (qty > 0 && qty < r.quantity) {
      cards.push({
        action: "modify",
        cardid: r.printingId,
        customCardId: null,
        categories: r.categories,
        patchId: patchId(),
        modifications: { quantity: qty, modifier: r.modifier, customCmc: r.customCmc, companion: r.companion, flippedDefault: r.flippedDefault, label: r.label },
        deckRelationId: rel,
      });
    }
  }
  return { cards };
}

export function parseAnyDeck(d: any, opts: ArchidektDeckOptions = {}): Deck {
  if (d?.pageProps?.redux?.deck) return parseReduxDeck(d.pageProps.redux.deck, opts);
  if (d?.cardMap) return parseReduxDeck(d, opts);
  return parseApiDeck(d, opts);
}
