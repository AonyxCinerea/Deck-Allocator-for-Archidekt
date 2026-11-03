/**
 * A fake archidekt.com for browser tests: the API endpoints the extension uses (decks, collection, card search,
 * modifyCards) plus pages whose markup mimics Archidekt's class names (collection rows, printing picker,
 * search grid, quick add). State is mutable so tests can add cards, edit decks and check what was sent.
 */
import type { BrowserContext, Route } from "@playwright/test";

export const TOKEN = "eyJtest.eyJ.sig";
export const USER_ID = 927921;

export interface FakeCard {
  id: number;
  name: string;
  oracleId: number;
  set: string;
  cn?: string;
  types?: string[];
  superTypes?: string[];
}

export const card = (c: FakeCard) => ({
  id: c.id,
  uid: `uid-${c.id}`,
  scryfallImageHash: "1",
  collectorNumber: c.cn ?? String(c.id),
  edition: { editioncode: c.set },
  options: ["Normal", "Foil"],
  prices: {},
  owned: 0,
  oracleCard: { id: c.oracleId, name: c.name, types: c.types ?? ["Artifact"], superTypes: c.superTypes ?? [] },
});

export interface FakeDeckCard {
  card: FakeCard;
  quantity?: number;
  category?: string;
  modifier?: "Normal" | "Foil";
}

export class FakeArchidekt {
  decks = new Map<number, any>();
  updated = new Map<number, number>();
  records: any[] = []; // newest first, like Archidekt's default order
  searchResults: any[] = [];
  patches: any[] = [];
  apiCalls: string[] = [];
  pageSize = 100;
  private nextRel = 1000;

  addDeck(id: number, name: string, createdAt: string, cards: FakeDeckCard[], opts: { theorycrafted?: boolean } = {}) {
    this.decks.set(id, {
      id,
      name,
      createdAt,
      theorycrafted: !!opts.theorycrafted,
      categories: [
        { name: "Maybeboard", includedInDeck: false },
        { name: "Sideboard", includedInDeck: true },
        { name: "Ramp", includedInDeck: true },
      ],
      cards: cards.map((c) => this.deckCard(c)),
    });
    this.updated.set(id, 1);
  }

  deckCard(c: FakeDeckCard) {
    return {
      id: this.nextRel++,
      categories: [c.category ?? "Ramp"],
      modifier: c.modifier ?? "Normal",
      quantity: c.quantity ?? 1,
      label: "",
      customCmc: null,
      companion: false,
      flippedDefault: false,
      card: card(c.card),
    };
  }

  /** Adds a collection record; newest first. */
  own(id: number, c: FakeCard, quantity = 1, foil = false) {
    this.records.unshift({ id, modifier: foil ? "Foil" : "Normal", foil, quantity, card: card(c) });
  }

  async install(ctx: BrowserContext, pages: Record<string, string> = {}) {
    await ctx.route("https://archidekt.com/**", (route) => this.handle(route, pages));
  }

  private async handle(route: Route, pages: Record<string, string>) {
    const req = route.request();
    const u = new URL(req.url());
    const json = (o: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(o) });

    if (u.pathname.startsWith("/api/")) {
      this.apiCalls.push(u.pathname + u.search);
      // card search is public; everything else needs the login token
      if (!u.pathname.startsWith("/api/cards/") && req.headers()["authorization"] !== `JWT ${TOKEN}`)
        return json({ detail: "unauthorized" }, 401);
      if (u.pathname === "/api/decks/curated/self/")
        return json({
          results: [...this.decks.values()].map((d) => ({
            id: d.id,
            name: d.name,
            updatedAt: `u${this.updated.get(d.id)}`,
            theorycrafted: d.theorycrafted,
            owner: { id: USER_ID },
          })),
        });
      let m = u.pathname.match(/^\/api\/decks\/(\d+)\/modifyCards\/v2\/$/);
      if (m && req.method() === "PATCH") return json(this.modify(Number(m[1]), JSON.parse(req.postData() ?? "{}")), 201);
      m = u.pathname.match(/^\/api\/decks\/(\d+)\/$/);
      if (m) return json(this.decks.get(Number(m[1])));
      if (u.pathname === `/api/collection/${USER_ID}/v2/`) {
        const page = Number(u.searchParams.get("page") ?? 1);
        return json({
          count: this.records.length,
          totalPages: Math.max(1, Math.ceil(this.records.length / this.pageSize)),
          results: this.records.slice((page - 1) * this.pageSize, page * this.pageSize),
        });
      }
      if (u.pathname === "/api/cards/v2/") return json({ count: this.searchResults.length, results: this.searchResults });
      return json({}, 404);
    }

    const body = pages[u.pathname] ?? "";
    return route.fulfill({
      contentType: "text/html",
      body: `<html><head><style>${STYLE}</style></head><body><script>document.cookie='tbJwt=${TOKEN}; path=/'</script>${body}</body></html>`,
    });
  }

  private modify(deckId: number, body: any) {
    this.patches.push(body);
    const deck = this.decks.get(deckId);
    const allCards = [...this.records.map((r) => r.card), ...this.searchResults];
    const add: any[] = [];
    for (const c of body.cards) {
      const target = allCards.find((x) => String(x.id) === String(c.cardid));
      if (c.action === "add") {
        const entry = { ...this.deckCard({ card: { id: 0, name: "", oracleId: 0, set: "" } }), card: target };
        entry.categories = c.categories;
        entry.quantity = c.modifications.quantity;
        entry.modifier = c.modifications.modifier;
        deck.cards.push(entry);
        add.push({ deckRelationId: entry.id, cardId: String(c.cardid) });
      } else if (c.action === "modify") {
        const entry = deck.cards.find((x: any) => String(x.id) === String(c.deckRelationId));
        if (target) entry.card = target;
        entry.quantity = c.modifications.quantity;
        entry.modifier = c.modifications.modifier;
      }
    }
    this.updated.set(deckId, (this.updated.get(deckId) ?? 1) + 1);
    return { add, createdCategories: [] };
  }
}

const STYLE = `body{background:#222;color:#ddd;font:14px sans-serif;min-height:900px}
[class*="cardEditionsGridOverlay_cardGrid"],[class*="cardResultsGrid_container"]{display:grid;grid-template-columns:repeat(4,200px);gap:6px}`;

/** Collection rows; the React fiber is stubbed the way the MAIN-world script reads it. */
export function collectionPage(rows: { recordId: number; name: string }[]) {
  const html = rows
    .map(
      (r) =>
        `<div><span class="textCollectionCard_cardRow__X" data-rec="${r.recordId}"><button class="textCollectionCard_cardName__Y"><span>${r.name}</span></button></span></div>`,
    )
    .join("");
  return `${html}<script>for (const row of document.querySelectorAll('[data-rec]')) row['__reactFiber$test'] = { memoizedProps: {}, return: { memoizedProps: { collectionCard: { id: Number(row.dataset.rec), quantity: 1, condition: 1, card: {} } }, return: null } };</script>`;
}

/** "Select a printing" overlay tiles. */
export function pickerMarkup(titles: string[]) {
  return `<div class="cardEditionsGridOverlay_cardGrid__G">${titles
    .map(
      (t) =>
        `<div class="cardEditionsGridOverlay_cardContainer__C"><div class="cardEditionsGridOverlay_cardBorderContainer__B" title="${t}"><button>${t}</button></div><div class="cardEditionsGridOverlay_extrasContainer__E">prices</div></div>`,
    )
    .join("")}</div>`;
}

/** Search result grid tiles ("Name (set) cn" on the image) and quick add suggestions ("(SET) (CN)"). */
export function searchMarkup(titles: string[], quickAdd: { name: string; set: string; cn: string }[] = []) {
  const grid = `<div class="cardResultsGrid_container__K">${titles
    .map(
      (t) =>
        `<div class="deckCardWrapper_container__P"><img id="basicCardImage" title="${t}" alt="${t}"><div class="imageCard_extrasContainer__V">prices</div></div>`,
    )
    .join("")}</div>`;
  const qa = quickAdd
    .map(
      (q) =>
        `<div class="cardAutocomplete_option__q"><div class="cardAutocomplete_words__k"><div class="cardAutocomplete_setName__P">${q.name}</div><div class="cardAutocomplete_metaInfo__i"><span>(${q.set}) (${q.cn})</span><span>1€</span></div></div></div>`,
    )
    .join("");
  return qa + grid;
}

/** Page script that searches and adds through window.fetch, like Archidekt does. */
export const SEARCHING_PAGE = `<div id="res"></div><script>
  window.doSearch = async (q = 'nameSearch=s&unique&') => (await (await fetch('/api/cards/v2/?' + q)).json()).results;
  window.addCard = (deckId, cardId) => fetch('/api/decks/' + deckId + '/modifyCards/v2/', { method: 'PATCH', headers: { 'content-type': 'application/json', authorization: 'JWT ' + document.cookie.match(/tbJwt=([^;]+)/)[1] },
    body: JSON.stringify({ cards: [{ action: 'add', cardid: String(cardId), customCardId: null, categories: ['Ramp'], patchId: 'p', modifications: { quantity: 1, modifier: 'Normal' } }] }) });
</script>`;
