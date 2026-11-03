import { describe, expect, it } from "vitest";
import { allocate, printingsFor, type CollectionRecord, type Deck, type DeckSlot } from "../src/allocation";

const rec = (id: string, printingId: string, quantity: number, finish: "nonfoil" | "foil" = "nonfoil"): CollectionRecord => ({
  id,
  name: "Jetmir's Garden",
  oracleId: "jetmir",
  printingId,
  finish,
  quantity,
});
const slot = (printingId: string, quantity = 1, extra: Partial<DeckSlot> = {}): DeckSlot => ({
  oracleId: "jetmir",
  printingId,
  finish: "nonfoil",
  quantity,
  name: "Jetmir's Garden",
  inDeck: true,
  ...extra,
});
const deck = (id: string, priority: number, slots: DeckSlot[], physical = true): Deck => ({
  id,
  name: id,
  priority,
  physical,
  slots,
});

const statusOf = (r: ReturnType<typeof allocate>, deckId: string) => r.slots.find((s) => s.deckId === deckId)!.status;

describe("allocate", () => {
  it("answers 'I own 4, 3 are in decks, which one is free?'", () => {
    const r = allocate(
      [rec("a", "SNC", 3), rec("b", "DMU", 1)],
      [deck("d1", 1, [slot("SNC")]), deck("d2", 2, [slot("SNC")]), deck("d3", 3, [slot("SNC")])],
    );
    expect(r.records.get("a")).toMatchObject({ claimed: 3, free: 0 });
    expect(r.records.get("b")).toMatchObject({ claimed: 0, free: 1 });
    expect(printingsFor(r, "jetmir")[0].record.id).toBe("b");
  });

  it("older deck keeps the copy, newer deck shows a conflict with alternatives", () => {
    const r = allocate([rec("a", "SNC", 1), rec("b", "DMU", 1)], [deck("new", 2, [slot("SNC")]), deck("old", 1, [slot("SNC")])]);
    expect(statusOf(r, "old")).toEqual({ kind: "owned" });
    const s = statusOf(r, "new");
    expect(s.kind).toBe("conflict");
    if (s.kind === "conflict") expect(s.alternatives.map((a) => a.record.id)).toEqual(["b"]);
  });

  it("suggests a free owned printing when the slot's printing is not owned", () => {
    const r = allocate([rec("b", "DMU", 1)], [deck("d", 1, [slot("NEWEST")])]);
    expect(statusOf(r, "d").kind).toBe("swappable");
  });

  it("treats foil and nonfoil as different copies", () => {
    const r = allocate([rec("f", "SNC", 1, "foil")], [deck("d", 1, [slot("SNC")])]);
    expect(statusOf(r, "d").kind).toBe("swappable");
  });

  it("reports missing when no copy is free", () => {
    const r = allocate([], [deck("d", 1, [slot("SNC")])]);
    expect(statusOf(r, "d").kind).toBe("missing");
  });

  it("theorycraft decks, maybeboard and basic lands claim nothing", () => {
    const r = allocate(
      [rec("a", "SNC", 1)],
      [
        deck("theory", 0, [slot("SNC")], false),
        deck("maybe", 0, [slot("SNC", 1, { inDeck: false })]),
        deck("basic", 0, [slot("SNC", 1, { isBasicLand: true })]),
        deck("real", 5, [slot("SNC")]),
      ],
    );
    expect(statusOf(r, "real")).toEqual({ kind: "owned" });
    expect(r.records.get("a")!.claims).toEqual([{ deckId: "real", deckName: "real", quantity: 1 }]);
  });

  it("spreads one slot across several records of the same printing (e.g. different conditions)", () => {
    const r = allocate([rec("nm", "SNC", 1), rec("lp", "SNC", 1)], [deck("d", 1, [slot("SNC", 2)])]);
    expect(statusOf(r, "d")).toEqual({ kind: "owned" });
    expect(r.records.get("lp")!.free).toBe(0);
  });

  it("partial coverage is a conflict with the missing count", () => {
    const r = allocate([rec("a", "SNC", 1)], [deck("d", 1, [slot("SNC", 3)])]);
    expect(statusOf(r, "d")).toMatchObject({ kind: "conflict", covered: 1, missing: 2 });
  });
});
