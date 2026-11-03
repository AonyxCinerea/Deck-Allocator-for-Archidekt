# Deck Allocator for Archidekt

[![CI](https://github.com/AonyxCinerea/Deck-Allocator-for-Archidekt/actions/workflows/ci.yml/badge.svg)](https://github.com/AonyxCinerea/Deck-Allocator-for-Archidekt/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/AonyxCinerea/Deck-Allocator-for-Archidekt)](https://github.com/AonyxCinerea/Deck-Allocator-for-Archidekt/releases/latest)

A browser extension for [Archidekt](https://archidekt.com) that connects your **collection** with your **decks** the way your physical cards are sorted: every card in a built deck uses one specific copy from your collection.

## Features

### Deck pages

A panel shows which cards have their own copy, which conflict with an older deck that already holds that copy, and which point at a printing you don't own while you have a free copy of another one. Click a free printing to switch the card to it, or switch the whole deck after a preview. Theorycrafted decks show "if you built this deck now": only copies no built deck uses.

<p>
  <img src="docs/screenshots/deck-panel.png" alt="Deck panel listing cards whose printing isn't owned, with free copies to switch to" width="49%">
  <img src="docs/screenshots/switch-preview.png" alt="Preview of switching all cards of a deck to free copies" width="49%">
</p>

### Card search

Quick add, the deck _Search_ overlay and the site-wide card search (one print or all prints): cards and printings you own come first, each with a badge — free copies, which deck holds the rest, or "other printings: N free". On deck pages, search results are swapped to your free non-foil copy, so adding the card adds _your_ printing. If a card still gets added in a printing you don't own, a notice offers to switch it to your free copy.

![Card search for Sol Ring: owned printings first, with free / in-deck / other-printings badges](docs/screenshots/search.png)

<img src="docs/screenshots/quick-add.png" alt="Quick add suggestion with a '3 free' badge" width="60%">

### Printing picker

Your printings come first, with free copies and the decks holding the rest.

![Printing picker for Skullclamp: the free copy and the copy in Gobos first](docs/screenshots/picker.png)

### Collection

Badges on every row of the collection page (click one to see the decks), and an _Allocation view_ of the whole collection, filterable by free / partly used / all in decks, searchable and sortable by every column.

![Allocation view filtered to Sol Ring: owned, free and the decks using each printing](docs/screenshots/collection-view.png)

## Rules

- A deck card uses copies of exactly its printing and finish (foil counts separately).
- If two decks use the same copy, the **older deck** (by creation date) keeps it.
- Theorycrafted decks (Archidekt's deck setting) never use copies.
- Cards whose first category is _Sideboard_ or _Maybeboard_ don't use copies. This, basic lands and every feature can be changed in the settings (⚙ in the deck panel, or _Details → Extension options_).

## Install

1. Download `deck-allocator-chrome-<version>.zip` from the [latest release](https://github.com/AonyxCinerea/Deck-Allocator-for-Archidekt/releases/latest) and unzip it.
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and choose the unzipped folder.
3. Open archidekt.com while logged in. The first load takes about a minute (Archidekt rate-limits its API); after that only changes are fetched.

**Update:** unzip the new version over the old folder, then click the reload icon on the extension in `chrome://extensions`. What changed: [CHANGELOG.md](CHANGELOG.md).

**Firefox:** `about:debugging` → _This Firefox_ → _Load Temporary Add-on_ → pick `manifest.json` from the unzipped Firefox zip. Firefox removes it on restart.

## How it works

The extension runs only on archidekt.com and uses the same API the site uses, with your existing login. Nothing is sent anywhere else. Data is cached in the browser:

| Data                 | Refreshed                                            | Requests           |
| -------------------- | ---------------------------------------------------- | ------------------ |
| Deck list            | every page change                                    | 1                  |
| Single deck          | when its "updated" timestamp changes                 | 1 per deck         |
| New collection cards | every page change, at most once a minute             | 1–3                |
| Full collection      | every 12 h (configurable) or via _Reload collection_ | ~1 per 100 records |

Archidekt's API is undocumented, so a site update can break parts of the extension. Please [open an issue](https://github.com/AonyxCinerea/Deck-Allocator-for-Archidekt/issues/new/choose) if something looks wrong.

## Development

```sh
npm ci
npm test              # unit tests: allocation, Archidekt adapter, switch planning, search transform
npm run e2e           # builds, then runs the extension in Chromium against a fake Archidekt (Playwright)
npm run typecheck
npm run format        # Prettier
npm run build         # dist/ext (Chrome) and dist/ext-firefox
```

| Path                      | What                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------- |
| `src/allocation.ts`       | platform-independent allocation core and switch planning                            |
| `src/archidekt.ts`        | Archidekt API shapes → core model, `modifyCards` request format                     |
| `src/search-transform.ts` | reorders / swaps card search responses                                              |
| `src/collection-sync.ts`  | incremental collection update                                                       |
| `src/ext/`                | the extension: content script, page-context `fetch` hook, background, settings page |
| `src/spike.ts`            | standalone console script printing an allocation report (`npm run spike`)           |
| `e2e/`                    | browser tests with a fake archidekt.com                                             |
| `test/`                   | unit tests; `test/fixtures` holds captured Archidekt responses                      |

### Releasing

1. Bump `version` in `package.json` (the manifest gets it at build time).
2. Add a `## [x.y.z] - date` section to `CHANGELOG.md`.
3. Push to `main`. CI tests, then creates the tag and the release with both zips; the changelog section becomes the release notes.

Editing an older changelog section updates that release's notes on the next push.

---

[MIT License](LICENSE). Not affiliated with Archidekt. Magic: The Gathering is a trademark of Wizards of the Coast.
