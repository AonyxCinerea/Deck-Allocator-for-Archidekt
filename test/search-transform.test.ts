import { describe, expect, it } from "vitest";
import { allocate, type CollectionRecord, type Deck } from "../src/allocation";
import { buildOwnedIndex, classifySearch, MARK, transformCardResults } from "../src/search-transform";

const printing = (id: number, set: string) => ({ id, uid: `uid-${id}`, scryfallImageHash: "h", collectorNumber: "1", edition: { editioncode: set } });
const rec = (id: string, oracleId: string, printingId: number, set: string, quantity: number, finish: "nonfoil" | "foil" = "nonfoil"): CollectionRecord => ({
  id, name: oracleId, oracleId, printingId: String(printingId), finish, quantity, setCode: set, printing: printing(printingId, set),
});
const result = (id: number, oracleId: number, set: string) => ({ ...printing(id, set), oracleCard: { id: oracleId, name: `card${oracleId}` }, owned: 0 });

const collection = [
  rec("a", "1", 11, "blc", 2), // Sol Ring: 2 free
  rec("b", "2", 21, "soc", 1), // Arcane Signet: used by deck
  rec("c", "3", 31, "fdc", 1, "foil"), // only a foil copy, free
];
const decks: Deck[] = [{ id: "d", name: "d", physical: true, priority: 1, slots: [{ name: "x", oracleId: "2", printingId: "21", finish: "nonfoil", quantity: 1, inDeck: true }] }];
const index = buildOwnedIndex(allocate(collection, decks));

describe("classifySearch", () => {
  it("detects name search and printing list", () => {
    expect(classifySearch("https://archidekt.com/api/cards/v2/?nameSearch=sol&unique&")).toBe("names");
    expect(classifySearch("/api/cards/v2/?exact&oracleCardIds=20089&orderBy=-editiondate&")).toBe("printings");
    expect(classifySearch("/api/cards/v2/?oracleCardIds=1,2&unique&")).toBe("other");
  });
});

describe("transformCardResults", () => {
  const search = { count: 4, results: [result(99, 9, "new"), result(22, 2, "new"), result(12, 1, "new"), result(32, 3, "new")] };

  it("orders owned-with-free first, then owned-but-used, then the rest (stable)", () => {
    const out = transformCardResults(search, "names", index, { reorder: true, swap: false });
    expect(out.results.map((r: any) => r.oracleCard.id)).toEqual([1, 3, 2, 9]);
  });

  it("swaps to the free non-foil copy, keeps oracle data, marks it", () => {
    const out = transformCardResults(search, "names", index, { reorder: false, swap: true });
    const sol = out.results.find((r: any) => r.oracleCard.id === 1);
    expect(sol).toMatchObject({ id: 11, uid: "uid-11", edition: { editioncode: "blc" }, owned: 2, oracleCard: { name: "card1" } });
    expect(sol[MARK]).toEqual({ swappedFrom: "new", to: "blc" });
  });

  it("does not swap to foil-only or used copies", () => {
    const out = transformCardResults(search, "names", index, { reorder: false, swap: true });
    expect(out.results.find((r: any) => r.oracleCard.id === 3).id).toBe(32);
    expect(out.results.find((r: any) => r.oracleCard.id === 2).id).toBe(22);
  });

  it("printing list: owned printings first by printing id, never swapped", () => {
    const list = { results: [result(20, 2, "x"), result(21, 2, "soc"), result(23, 2, "y")] };
    const idx = buildOwnedIndex(allocate([rec("b", "2", 21, "soc", 1), rec("e", "2", 23, "y", 1)], decks));
    const out = transformCardResults(list, "printings", idx, { reorder: true, swap: true });
    expect(out.results.map((r: any) => r.id)).toEqual([23, 21, 20]);
  });
});
