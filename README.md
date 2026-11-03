# Deck Allocator for Archidekt

A browser extension for [Archidekt](https://archidekt.com) that connects your **collection** with your **decks** the way your physical cards are actually sorted: every card in a built deck uses one specific copy from your collection.

- **Deck pages:** a panel shows which cards have their own copy, which conflict with an older deck that already holds that copy, and which point at a printing you don't own while you have a free copy of another one. Click a printing to switch the card to it, or switch the whole deck at once.
- **Card search:** cards you own come first. On deck pages a search result is swapped to your free non-foil copy before Archidekt shows it, so adding the card adds *your* printing. If a card still gets added in a printing you don't own, a notice offers to switch it to your free copy.
- **Printing picker:** your printings come first, with a badge showing free copies and which deck holds the rest.
- **Collection page:** badges per row, plus an *Allocation view* of your whole collection, sortable and filterable by free / partly used / all in decks.
- **Theorycrafted decks** (Archidekt's deck setting) never use copies; their panel shows "if you built this deck now".

## Rules

- A deck card uses copies of exactly its printing and finish (foil counts separately).
- If two decks use the same copy, the **older deck** (by creation date) keeps it.
- Cards whose first category is *Sideboard* or *Maybeboard* don't use copies. Configurable in the settings, as are basic lands.

## Install (developer mode)

1. Download `deck-allocator-chrome-<version>.zip` from [Releases](../../releases) and unzip it.
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, choose the unzipped folder.
3. Open archidekt.com while logged in. The first load takes about a minute (Archidekt rate-limits its API); after that only changes are fetched.

Firefox: `about:debugging` → *This Firefox* → *Load Temporary Add-on* → pick `manifest.json` from the unzipped Firefox zip (removed on browser restart).

Updating: unzip the new version over the old folder and click the reload icon in `chrome://extensions`.

## How it works

The extension runs only on archidekt.com and talks to the same API the site uses, with your existing login. Data is cached in the browser (`chrome.storage.local`):

| Data | Refreshed | Requests |
|---|---|---|
| Deck list | every page change | 1 |
| Single deck | when its "updated" timestamp changes | 1 per deck |
| New collection cards | every page change, at most once a minute | 1–3 |
| Full collection | every 12 h (configurable) or via *Reload collection* | ~1 per 100 records |

Nothing leaves your browser except requests to archidekt.com.

## Development

```sh
npm ci
npm test          # allocation core, Archidekt adapter, switch planning
npm run typecheck
npm run build     # dist/ext (Chrome) and dist/ext-firefox
npm run package   # + zips
```

- `src/allocation.ts` – platform-independent allocation core
- `src/archidekt.ts` – Archidekt API shapes → core model, and the `modifyCards` request format
- `src/search-transform.ts` – reorders/swaps card search responses (runs in the page via a `fetch` hook in `src/ext/main-world.ts`)
- `src/ext/` – the extension (content script, MAIN-world helper for collection rows, background, options)
- `src/spike.ts` – standalone console script that prints an allocation report (`npm run spike`)

Releases: bump `version` in `ext-static/manifest.json`, then tag `v<version>`; CI builds and attaches the zips.

Not affiliated with Archidekt. Archidekt's API is undocumented, so a site update can break the extension.
