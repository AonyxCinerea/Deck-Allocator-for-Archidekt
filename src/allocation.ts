/**
 * Platform-agnostic allocation core.
 *
 * Model: a collection record is a stack of physical copies of one printing+finish.
 * A deck slot names one printing+finish and claims that many copies.
 * Decks are processed in priority order (default: oldest first), so an older
 * deck keeps its copies and a newer deck shows the conflict.
 */

export type Finish = "nonfoil" | "foil" | "etched";

export interface CollectionRecord {
  id: string;
  name: string;
  oracleId: string; // same for every printing of a card
  printingId: string; // one specific edition / collector number
  finish: Finish;
  quantity: number;
  setCode?: string;
  collectorNumber?: string;
  /** platform printing object (without the oracle part), used to swap search results to this copy */
  printing?: Record<string, unknown>;
}

export interface DeckSlot {
  oracleId: string;
  printingId: string;
  finish: Finish;
  quantity: number;
  name: string;
  /** false for maybeboard/sideboard categories (Archidekt: includedInDeck) */
  inDeck: boolean;
  isBasicLand?: boolean;
  /** platform-specific data needed to edit this slot (opaque to the core) */
  ref?: unknown;
  /** primary category (Archidekt) and whether the platform itself counts that category as part of the deck */
  category?: string;
  platformInDeck?: boolean;
}

/** Re-evaluate which slots are physically in the deck box for a user-defined list of excluded categories. */
export function applyExclusions(decks: Deck[], excludedCategories: string[]): Deck[] {
  const ex = new Set(excludedCategories.map((c) => c.trim().toLowerCase()).filter(Boolean));
  return decks.map((d) => ({
    ...d,
    slots: d.slots.map((s) =>
      s.platformInDeck === undefined ? s : { ...s, inDeck: s.platformInDeck && !ex.has((s.category ?? "").toLowerCase()) },
    ),
  }));
}

export interface Deck {
  id: string;
  name: string;
  /** physically built? theorycraft decks don't claim copies */
  physical: boolean;
  /** lower = higher priority; e.g. creation timestamp */
  priority: number;
  slots: DeckSlot[];
}

export interface Claim {
  deckId: string;
  deckName: string;
  quantity: number;
}

export interface RecordAllocation {
  record: CollectionRecord;
  claims: Claim[];
  claimed: number;
  free: number;
}

export type SlotStatus =
  | { kind: "owned" } // fully covered by exact printing
  | { kind: "conflict"; covered: number; missing: number; alternatives: RecordAllocation[] }
  | { kind: "swappable"; alternatives: RecordAllocation[] } // printing not owned, other free printing exists
  | { kind: "missing" } // card not owned in any free printing
  | { kind: "ignored" }; // basic land, maybeboard, theorycraft deck

export interface SlotResult {
  deckId: string;
  slot: DeckSlot;
  status: SlotStatus;
}

export interface AllocationResult {
  records: Map<string, RecordAllocation>; // by record id
  slots: SlotResult[];
}

export interface AllocateOptions {
  ignoreBasicLands?: boolean; // default true
}

const key = (printingId: string, finish: Finish) => `${printingId}|${finish}`;

export function allocate(
  collection: CollectionRecord[],
  decks: Deck[],
  opts: AllocateOptions = {},
): AllocationResult {
  const ignoreBasics = opts.ignoreBasicLands ?? true;

  const records = new Map<string, RecordAllocation>();
  const byKey = new Map<string, RecordAllocation[]>();
  const byOracle = new Map<string, RecordAllocation[]>();
  for (const record of collection) {
    const ra: RecordAllocation = { record, claims: [], claimed: 0, free: record.quantity };
    records.set(record.id, ra);
    push(byKey, key(record.printingId, record.finish), ra);
    push(byOracle, record.oracleId, ra);
  }

  const ordered = [...decks].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  const pending: { deck: Deck; slot: DeckSlot; covered: number }[] = [];
  const slots: SlotResult[] = [];

  // Pass 1: exact claims, in deck priority order.
  for (const deck of ordered) {
    for (const slot of deck.slots) {
      if (!deck.physical || !slot.inDeck || (ignoreBasics && slot.isBasicLand)) {
        slots.push({ deckId: deck.id, slot, status: { kind: "ignored" } });
        continue;
      }
      let need = slot.quantity;
      for (const ra of byKey.get(key(slot.printingId, slot.finish)) ?? []) {
        if (need === 0) break;
        const take = Math.min(need, Math.max(ra.free, 0));
        if (take > 0) {
          addClaim(ra, deck, take);
          need -= take;
        }
      }
      pending.push({ deck, slot, covered: slot.quantity - need });
    }
  }

  // Pass 2: classify, now that all exact claims are known.
  for (const { deck, slot, covered } of pending) {
    const missing = slot.quantity - covered;
    const alternatives = freeAlternatives(byOracle.get(slot.oracleId) ?? [], slot);
    let status: SlotStatus;
    if (missing === 0) status = { kind: "owned" };
    else if (covered > 0 || hasExactPrinting(byKey, slot)) status = { kind: "conflict", covered, missing, alternatives };
    else if (alternatives.length > 0) status = { kind: "swappable", alternatives };
    else status = { kind: "missing" };
    slots.push({ deckId: deck.id, slot, status });
  }

  return { records, slots };
}

/** For the printing picker: all owned printings of a card, free copies first. */
export function printingsFor(result: AllocationResult, oracleId: string): RecordAllocation[] {
  return [...result.records.values()]
    .filter((ra) => ra.record.oracleId === oracleId)
    .sort((a, b) => b.free - a.free || a.record.name.localeCompare(b.record.name));
}

/** Decks currently holding copies of exactly this printing+finish. */
export function holdersOf(result: AllocationResult, printingId: string, finish: Finish): Claim[] {
  return [...result.records.values()]
    .filter((ra) => ra.record.printingId === printingId && ra.record.finish === finish)
    .flatMap((ra) => ra.claims);
}

/** Records claimed more often than owned. */
export function overAllocated(result: AllocationResult): RecordAllocation[] {
  // pass 1 never over-claims; conflicts surface as slot status. Kept for imported/manual claims.
  return [...result.records.values()].filter((ra) => ra.free < 0);
}

function freeAlternatives(candidates: RecordAllocation[], slot: DeckSlot): RecordAllocation[] {
  return candidates
    .filter((ra) => ra.free > 0 && key(ra.record.printingId, ra.record.finish) !== key(slot.printingId, slot.finish))
    .sort((a, b) => b.free - a.free);
}

function hasExactPrinting(byKey: Map<string, RecordAllocation[]>, slot: DeckSlot): boolean {
  return (byKey.get(key(slot.printingId, slot.finish)) ?? []).length > 0;
}

function addClaim(ra: RecordAllocation, deck: Deck, qty: number) {
  const existing = ra.claims.find((c) => c.deckId === deck.id);
  if (existing) existing.quantity += qty;
  else ra.claims.push({ deckId: deck.id, deckName: deck.name, quantity: qty });
  ra.claimed += qty;
  ra.free -= qty;
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const arr = m.get(k);
  if (arr) arr.push(v);
  else m.set(k, [v]);
}

export interface PlannedChange {
  slot: DeckSlot;
  target: CollectionRecord;
  quantity: number; // copies moved to the target printing (may be < slot.quantity)
}

/**
 * Plan switching every problem slot of one deck to free owned copies, without handing the same copy out twice.
 * Prefers the slot's own finish, then the printing with the most free copies.
 */
export function planDeckFix(result: AllocationResult, deckId: string): PlannedChange[] {
  const remaining = new Map<string, number>();
  for (const ra of result.records.values()) remaining.set(ra.record.id, Math.max(ra.free, 0));
  const changes: PlannedChange[] = [];
  for (const s of result.slots) {
    if (s.deckId !== deckId) continue;
    if (s.status.kind !== "conflict" && s.status.kind !== "swappable") continue;
    let need = s.status.kind === "conflict" ? s.status.missing : s.slot.quantity;
    const alts = [...s.status.alternatives].sort(
      (a, b) =>
        Number(b.record.finish === s.slot.finish) - Number(a.record.finish === s.slot.finish) ||
        (remaining.get(b.record.id) ?? 0) - (remaining.get(a.record.id) ?? 0),
    );
    for (const a of alts) {
      if (need === 0) break;
      const take = Math.min(need, remaining.get(a.record.id) ?? 0);
      if (take <= 0) continue;
      remaining.set(a.record.id, (remaining.get(a.record.id) ?? 0) - take);
      changes.push({ slot: s.slot, target: a.record, quantity: take });
      need -= take;
    }
  }
  return changes;
}
