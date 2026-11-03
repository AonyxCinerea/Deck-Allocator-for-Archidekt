import { describe, expect, it } from "vitest";
import { allocate, planDeckFix, type CollectionRecord, type Deck, type DeckSlot } from "../src/allocation";
import { buildSwitchPatch, type ArchidektSlotRef } from "../src/archidekt";

const ref = (rel: string, printingId: string, quantity: number): ArchidektSlotRef => ({
  deckRelationId: rel, printingId, categories: ["Drain"], quantity, modifier: "Normal",
  customCmc: null, companion: false, flippedDefault: false, label: ",#656565",
});
const rec = (id: string, printingId: string, quantity: number, finish: "nonfoil" | "foil" = "nonfoil"): CollectionRecord => ({
  id, name: "Card", oracleId: "o", printingId, finish, quantity, setCode: printingId,
});
const slot = (printingId: string, quantity: number, rel = "r1"): DeckSlot => ({
  name: "Card", oracleId: "o", printingId, finish: "nonfoil", quantity, inDeck: true, ref: ref(rel, printingId, quantity),
});
const deck = (id: string, priority: number, slots: DeckSlot[]): Deck => ({ id, name: id, priority, physical: true, slots });

describe("planDeckFix", () => {
  it("never hands the same free copy to two slots", () => {
    const r = allocate([rec("a", "A", 1)], [deck("d", 1, [slot("X", 1, "r1"), slot("Y", 1, "r2")])]);
    expect(planDeckFix(r, "d")).toHaveLength(1);
  });

  it("prefers the slot's finish, then most free copies", () => {
    const r = allocate([rec("f", "F", 5, "foil"), rec("a", "A", 1), rec("b", "B", 2)], [deck("d", 1, [slot("X", 1)])]);
    expect(planDeckFix(r, "d").map((c) => c.target.id)).toEqual(["b"]);
  });

  it("splits a 2-copy slot over two printings when needed", () => {
    const r = allocate([rec("a", "A", 1), rec("b", "B", 1)], [deck("d", 1, [slot("X", 2)])]);
    expect(planDeckFix(r, "d").map((c) => [c.target.id, c.quantity])).toEqual([["a", 1], ["b", 1]]);
  });

  it("for a partial conflict only moves the missing copies", () => {
    const r = allocate(
      [rec("x", "X", 1), rec("a", "A", 3)],
      [deck("old", 1, [slot("X", 1, "o1")]), deck("new", 2, [slot("X", 2, "n1")])],
    );
    expect(planDeckFix(r, "new").map((c) => [c.target.id, c.quantity])).toEqual([["a", 2]]);
  });
});

describe("buildSwitchPatch (Archidekt modifyCards format)", () => {
  it("whole slot → a single modify with the new cardid, like the site does", () => {
    const body = buildSwitchPatch([{ ref: ref("3523224154", "34645", 1), targetPrintingId: "93699", targetFinish: "nonfoil", quantity: 1 }]);
    expect(body.cards).toHaveLength(1);
    expect(body.cards[0]).toMatchObject({
      action: "modify", cardid: "93699", deckRelationId: "3523224154", categories: ["Drain"],
      modifications: { quantity: 1, modifier: "Normal", label: ",#656565", companion: false, flippedDefault: false, customCmc: null },
    });
    expect(body.cards[0].patchId).toMatch(/^[A-Za-z0-9]{11}$/);
  });

  it("foil target sets modifier Foil", () => {
    const body = buildSwitchPatch([{ ref: ref("1", "A", 1), targetPrintingId: "B", targetFinish: "foil", quantity: 1 }]);
    expect(body.cards[0].modifications.modifier).toBe("Foil");
  });

  it("part of a slot → add the moved copies + shrink the old entry", () => {
    const body = buildSwitchPatch([{ ref: ref("1", "A", 3), targetPrintingId: "B", targetFinish: "nonfoil", quantity: 1 }]);
    expect(body.cards.map((c: any) => [c.action, c.cardid, c.modifications.quantity])).toEqual([
      ["add", "B", 1],
      ["modify", "A", 2],
    ]);
  });

  it("slot split over two printings → add one, modify the entry into the other", () => {
    const r = ref("1", "X", 2);
    const body = buildSwitchPatch([
      { ref: r, targetPrintingId: "A", targetFinish: "nonfoil", quantity: 1 },
      { ref: r, targetPrintingId: "B", targetFinish: "nonfoil", quantity: 1 },
    ]);
    expect(body.cards.map((c: any) => [c.action, c.cardid, c.modifications.quantity])).toEqual([
      ["add", "A", 1],
      ["modify", "B", 1],
    ]);
  });
});
