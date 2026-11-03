import { card, collectionPage, pickerMarkup, searchMarkup, SEARCHING_PAGE, type FakeCard } from "./fake-archidekt";
import { clickPanelButton, deckReady, expect, fabText, openPanel, panelText, test } from "./extension";

const SOL: FakeCard = { id: 11, name: "Sol Ring", oracleId: 1, set: "blc", cn: "11" };
const SOL_NEW: FakeCard = { id: 12, name: "Sol Ring", oracleId: 1, set: "trc", cn: "499" };
const SIGNET: FakeCard = { id: 21, name: "Arcane Signet", oracleId: 2, set: "soc", cn: "21" };
const SIGNET_NEW: FakeCard = { id: 22, name: "Arcane Signet", oracleId: 2, set: "trc", cn: "485" };
const SIGNET_FOIL: FakeCard = { id: 23, name: "Arcane Signet", oracleId: 2, set: "fdc", cn: "23" };
const CHARM: FakeCard = { id: 31, name: "Witherbloom Charm", oracleId: 3, set: "sos", cn: "31" };

test("deck panel: conflicts with an older deck, switch the whole deck to free copies", async ({ ctx, archidekt }) => {
  archidekt.own(1, SIGNET);
  archidekt.own(2, SIGNET_NEW); // free alternative
  archidekt.own(3, SOL);
  archidekt.addDeck(1, "Old deck", "2026-01-01T00:00:00Z", [{ card: SIGNET }, { card: SOL }]);
  archidekt.addDeck(2, "New deck", "2026-06-01T00:00:00Z", [{ card: SIGNET }, { card: SOL }]);
  await archidekt.install(ctx);
  const page = await ctx.newPage();
  await page.goto("https://archidekt.com/decks/2/new");
  await deckReady(page);
  expect(await fabText(page)).toContain("0/2");

  await openPanel(page);
  const text = await panelText(page);
  expect(text).toContain("Conflict");
  expect(text).toContain("in Old deck");

  await clickPanelButton(page, "Use free copies");
  expect(await panelText(page)).toContain("1× Arcane Signet");
  await Promise.all([page.waitForEvent("load"), clickPanelButton(page, "Apply")]);
  expect(archidekt.patches[0].cards).toEqual([
    expect.objectContaining({
      action: "modify",
      cardid: "22",
      modifications: expect.objectContaining({ modifier: "Normal", quantity: 1 }),
    }),
  ]);
  await deckReady(page);
  expect(await fabText(page)).toContain("1/2");
});

test("deck panel closes on outside click; theorycrafted deck shows 'If built'", async ({ ctx, archidekt }) => {
  archidekt.own(1, SOL);
  archidekt.addDeck(1, "Built", "2026-01-01T00:00:00Z", [{ card: SOL }]);
  archidekt.addDeck(2, "Idea", "2026-06-01T00:00:00Z", [{ card: SOL }], { theorycrafted: true });
  await archidekt.install(ctx);
  const page = await ctx.newPage();
  await page.goto("https://archidekt.com/decks/2/idea");
  await deckReady(page);
  expect(await fabText(page)).toContain("If built");
  expect(await fabText(page)).toContain("0/1"); // the only Sol Ring is in the built deck

  await openPanel(page);
  expect(await panelText(page)).toContain("If you built this deck now");
  await page.mouse.click(5, 5);
  expect(await panelText(page)).toBe("");
});

test("sideboard and maybeboard don't use copies; settings can change that", async ({ ctx, archidekt, sw }) => {
  archidekt.own(1, CHARM);
  archidekt.addDeck(1, "Deck", "2026-01-01T00:00:00Z", [{ card: SOL }, { card: CHARM, category: "Sideboard" }]);
  await archidekt.install(ctx);
  const page = await ctx.newPage();
  await page.goto("https://archidekt.com/decks/1/x");
  await deckReady(page);
  expect(await fabText(page)).toContain("0/1");

  await sw.evaluate(() => chrome.storage.sync.set({ "deckAllocator.settings": { excludedCategories: ["Maybeboard"] } }));
  await expect.poll(() => fabText(page)).toContain("1/2");
});

test("collection: row badges, deck popover and the allocation view", async ({ ctx, archidekt }) => {
  archidekt.own(1, SOL, 2);
  archidekt.own(2, SIGNET);
  archidekt.addDeck(1, "Gobos", "2026-01-01T00:00:00Z", [{ card: SIGNET }]);
  await archidekt.install(ctx, {
    "/collection/v2/927921": collectionPage([
      { recordId: 1, name: "Sol Ring" },
      { recordId: 2, name: "Arcane Signet" },
    ]),
  });
  const page = await ctx.newPage();
  await page.goto("https://archidekt.com/collection/v2/927921");
  await expect(page.locator(".deck-allocator-badge")).toHaveCount(2, { timeout: 60_000 });
  await expect(page.locator('[data-rec="1"] .deck-allocator-badge')).toHaveText("2 free");
  await expect(page.locator('[data-rec="2"] .deck-allocator-badge')).toHaveText("0/1 free · Gobos");

  await page.locator('[data-rec="2"] .deck-allocator-badge').click();
  await expect(page.locator('a[href="/decks/1"]')).toHaveText("1× Gobos");

  await page.evaluate(() =>
    (document.getElementById("deck-allocator-collection")!.shadowRoot!.querySelector(".fab") as HTMLElement).click(),
  );
  const rows = () =>
    page.evaluate(() =>
      [...document.getElementById("deck-allocator-view")!.shadowRoot!.querySelectorAll("tbody tr")].map(
        (r) => (r as HTMLElement).innerText.split("\t")[1],
      ),
    );
  await expect.poll(rows).toEqual(["Sol Ring", "Arcane Signet"]); // status sort: free first
});

test("printing picker: owned printings first, with badges", async ({ ctx, archidekt }) => {
  archidekt.own(1, SIGNET);
  archidekt.own(2, SIGNET_FOIL, 1, true);
  archidekt.addDeck(1, "Gobos", "2026-01-01T00:00:00Z", [{ card: SIGNET }]);
  await archidekt.install(ctx, {
    "/decks/1/x": pickerMarkup(["Arcane Signet (trc) 485", "Arcane Signet (soc) 21", "Arcane Signet (fdc) 23"]),
  });
  const page = await ctx.newPage();
  await page.goto("https://archidekt.com/decks/1/x");
  await expect(page.locator(".deck-allocator-badge")).toHaveCount(2, { timeout: 60_000 });
  const visual = await page.$$eval('[class*="cardEditionsGridOverlay_cardContainer"]', (tiles) =>
    tiles
      .map((t) => [
        t.getBoundingClientRect().left,
        t.querySelector("[title]")!.getAttribute("title"),
        t.querySelector(".deck-allocator-badge")?.textContent ?? "-",
      ])
      .sort((a, b) => (a[0] as number) - (b[0] as number))
      .map((x) => `${x[1]} → ${x[2]}`),
  );
  expect(visual).toEqual([
    "Arcane Signet (fdc) 23 → 1 free (1 ✦)",
    "Arcane Signet (soc) 21 → 0/1 free · Gobos",
    "Arcane Signet (trc) 485 → -",
  ]);
});

test("search results and quick add: badges and owned first", async ({ ctx, archidekt }) => {
  archidekt.own(1, SOL);
  archidekt.own(2, SIGNET);
  archidekt.addDeck(1, "Gobos", "2026-01-01T00:00:00Z", [{ card: SIGNET }]);
  await archidekt.install(ctx, {
    "/decks/1/x": searchMarkup(
      ["Sol Ring (trc) 499", "Arcane Signet (soc) 21", "Sol Ring (blc) 11", "Mind Stone (fdc) 1"],
      [{ name: "Sol Ring", set: "TRC", cn: "499" }],
    ),
  });
  const page = await ctx.newPage();
  await page.goto("https://archidekt.com/decks/1/x");
  await expect(page.locator('[class*="cardAutocomplete_option"] .deck-allocator-badge')).toHaveText("other printings: 1 free", {
    timeout: 60_000,
  });
  const visual = await page.$$eval('[class*="cardResultsGrid_container"] > *', (tiles) =>
    tiles
      .map((t) => [
        t.getBoundingClientRect().left,
        t.querySelector("img")!.title,
        t.querySelector(".deck-allocator-badge")?.textContent ?? "-",
      ])
      .sort((a, b) => (a[0] as number) - (b[0] as number))
      .map((x) => `${x[1]} → ${x[2]}`),
  );
  expect(visual).toEqual([
    "Sol Ring (blc) 11 → 1 free",
    "Arcane Signet (soc) 21 → 0/1 free · Gobos",
    "Sol Ring (trc) 499 → other printings: 1 free",
    "Mind Stone (fdc) 1 → -",
  ]);
});

test("search hook: free copy swapped in, adds it; notice offers switching otherwise", async ({ ctx, archidekt }) => {
  archidekt.own(1, SOL);
  archidekt.own(2, SIGNET_FOIL, 1, true); // only a foil copy → not swapped
  archidekt.addDeck(1, "Deck", "2026-01-01T00:00:00Z", []);
  archidekt.searchResults = [card({ id: 99, name: "Mind Stone", oracleId: 9, set: "new" }), card(SIGNET_NEW), card(SOL_NEW)];
  await archidekt.install(ctx, { "/decks/1/x": SEARCHING_PAGE });
  const page = await ctx.newPage();
  await page.goto("https://archidekt.com/decks/1/x");
  await deckReady(page);

  const seen = await page.evaluate(async () =>
    ((await (window as any).doSearch()) as any[]).map((r) => `${r.oracleCard.name} ${r.edition.editioncode}`),
  );
  expect(seen).toEqual(["Arcane Signet trc", "Sol Ring blc", "Mind Stone new"]);

  await page.evaluate(() => (window as any).addCard(1, 11)); // the swapped Sol Ring → our copy
  await page.waitForTimeout(3000);
  expect(archidekt.patches[0].cards[0].cardid).toBe("11");
  const toastRoot = () =>
    page.evaluate(() => document.getElementById("deck-allocator-toast")?.shadowRoot?.querySelector(".toast")?.textContent ?? "");
  expect(await toastRoot()).toBe("");

  await page.evaluate(() => (window as any).addCard(1, 22)); // Arcane Signet in a printing we don't own
  await expect.poll(toastRoot, { timeout: 30_000 }).toContain("FDC ✦");
  await Promise.all([
    page.waitForEvent("load"),
    page.evaluate(() =>
      (document.getElementById("deck-allocator-toast")!.shadowRoot!.querySelector("button") as HTMLElement).click(),
    ),
  ]);
  expect(archidekt.patches.at(-1).cards[0]).toMatchObject({
    action: "modify",
    cardid: "23",
    modifications: { modifier: "Foil" },
  });
});

test("collection quick check picks up new cards with one request", async ({ ctx, archidekt, sw }) => {
  archidekt.pageSize = 2;
  for (let i = 0; i < 5; i++) archidekt.own(100 + i, { id: 500 + i, name: `Card ${i}`, oracleId: 50 + i, set: "abc" });
  archidekt.addDeck(1, "Deck", "2026-01-01T00:00:00Z", [{ card: SOL }]);
  await archidekt.install(ctx);
  const page = await ctx.newPage();
  await page.goto("https://archidekt.com/decks/1/x");
  await deckReady(page);
  const cached = () =>
    sw.evaluate(
      async () => ((await chrome.storage.local.get("deckAllocator.v4"))["deckAllocator.v4"] as any).collection.records.length,
    );
  await expect.poll(cached).toBe(5);

  archidekt.own(200, SOL); // new card, newest first
  await sw.evaluate(async () => {
    const k = "deckAllocator.v4";
    const c = (await chrome.storage.local.get(k))[k] as any;
    c.collection.checkedAt = 0; // skip the once-a-minute limit
    await chrome.storage.local.set({ [k]: c });
  });
  archidekt.apiCalls = [];
  await page.goto("https://archidekt.com/decks/1/y");
  await expect.poll(cached).toBe(6);
  expect(archidekt.apiCalls.filter((c) => c.startsWith("/api/collection/"))).toHaveLength(1);
  await deckReady(page);
  expect(await fabText(page)).toContain("1/1");
});
