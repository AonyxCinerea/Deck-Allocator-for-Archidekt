import { describe, expect, it } from "vitest";
import { applyExclusions, type CollectionRecord, type Deck } from "../src/allocation";
import { mergeNewestPages, reachedKnown } from "../src/collection-sync";
import { parseApiDeck } from "../src/archidekt";
import apiDeck from "./fixtures/deck-api.json";

const r = (id: string, quantity = 1): CollectionRecord => ({
  id,
  name: id,
  oracleId: id,
  printingId: id,
  finish: "nonfoil",
  quantity,
});

describe("mergeNewestPages", () => {
  it("adds new records and refreshes known ones", () => {
    const m = mergeNewestPages([r("1"), r("2")], [r("3"), r("2", 4)], 3);
    expect(m).toMatchObject({ complete: true, added: 1 });
    expect(m.records.find((x) => x.id === "2")!.quantity).toBe(4);
  });
  it("flags deletions (server count lower) as incomplete", () => {
    expect(mergeNewestPages([r("1"), r("2")], [r("2")], 1).complete).toBe(false);
  });
  it("knows when the scan reached known records", () => {
    expect(reachedKnown([r("1")], [r("5"), r("4")])).toBe(false);
    expect(reachedKnown([r("1")], [r("5"), r("1")])).toBe(true);
  });
});

describe("applyExclusions", () => {
  it("re-evaluates sideboard per settings", () => {
    const d: Deck = parseApiDeck(apiDeck);
    const charm = (decks: Deck[]) => decks[0].slots.find((s) => s.name === "Witherbloom Charm")!.inDeck;
    expect(charm(applyExclusions([d], ["Sideboard", "Maybeboard"]))).toBe(false);
    expect(charm(applyExclusions([d], ["Maybeboard"]))).toBe(true);
  });
});
