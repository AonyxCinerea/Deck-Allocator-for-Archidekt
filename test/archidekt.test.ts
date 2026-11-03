import { describe, expect, it } from "vitest";
import { allocate, printingsFor } from "../src/allocation";
import { parseCollectionPage, parseReduxDeck } from "../src/archidekt";
import collectionFixture from "./fixtures/collection-api.json";
import deckFixture from "./fixtures/deck-redux.json";

describe("archidekt adapter (real captured data)", () => {
  const collection = parseCollectionPage(collectionFixture);
  const deck = parseReduxDeck(deckFixture);

  it("parses collection records", () => {
    expect(collection).toHaveLength(8);
    expect(collection.every((r) => r.name === "Arcane Signet" && r.oracleId === "20089")).toBe(true);
    expect(collection.reduce((n, r) => n + r.quantity, 0)).toBe(12);
  });

  it("parses the deck: sideboard and maybeboard are not in the deck box", () => {
    expect(deck.physical).toBe(true);
    expect(deck.slots.length).toBe(121);
    expect(deck.slots.find((s) => s.name === "Witherbloom Charm")!.inDeck).toBe(false); // primary category Sideboard
    expect(deck.slots.filter((s) => s.inDeck).length).toBe(86);
  });

  it("allocates the deck's Arcane Signet to the exact printing (cardId 153341)", () => {
    const r = allocate(collection, [deck]);
    const signets = printingsFor(r, "20089");
    const claimed = signets.filter((s) => s.claimed > 0);
    expect(claimed).toHaveLength(1);
    expect(claimed[0].record.printingId).toBe("153341");
    expect(claimed[0].claims[0].deckName).toBe("Witherbloom Pestilence (upgraded)");
    expect(signets.reduce((n, s) => n + s.free, 0)).toBe(11);
  });
});

import { parseApiDeck } from "../src/archidekt";
import apiDeck from "./fixtures/deck-api.json";

describe("REST deck shape (GET /api/decks/{id}/)", () => {
  it("parses cards, printings and primary category", () => {
    const d = parseApiDeck(apiDeck);
    expect(d.slots).toEqual([
      expect.objectContaining({ name: "Witherbloom Campus", printingId: "150912", oracleId: "23005", inDeck: true, quantity: 1 }),
      expect.objectContaining({ name: "Witherbloom Charm", printingId: "150554", oracleId: "50001", inDeck: false }),
    ]);
  });
});
