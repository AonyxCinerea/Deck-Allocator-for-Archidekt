# Changelog

All notable changes to this extension. Each `## [version]` section becomes the release notes on GitHub.

## [0.7.0] - 2026-11-03

### Added

- Collection badges in card search: the deck _Search_ overlay, the site-wide card search (one print or all prints) and quick add suggestions. Exact printing owned → free / which deck holds it; owned in other printings → "other printings: N free".
- Option to turn the search badges off.

### Changed

- "Cards I own first" now covers every card search, including _all prints_, not only quick add. On-screen reordering acts as a fallback for searches the extension doesn't recognise.

## [0.6.0] - 2026-11-03

### Added

- Card search shows the cards you own first (free copies, then copies in decks).
- On deck pages, search results are swapped to your free non-foil copy before Archidekt shows them, so adding the card adds _your_ printing.
- After a card is added in a printing you don't own (quick add, search, drag & drop), a notice offers to switch it to your free copy.
- Settings for all three.

### Changed

- The collection is loaded once more after updating: the extension now stores each printing's details for the search swap (needs the _unlimited storage_ permission).

## [0.5.0] - 2026-11-03

### Added

- Settings page (⚙ in the deck panel and the collection view): categories that don't count as "in the deck box", basic lands, each feature on/off, collection reload interval, clear cached data.
- Quick collection check on every page change (1–3 requests) picks up new cards; the full reload only runs every 12 hours (configurable) or on demand.

## [0.4.0] - 2026-11-03

### Added

- _Allocation view_ on the collection page: your whole collection, one row per printing, filterable by free / partly used / all in decks, searchable, filterable by deck and sortable by every column.

## [0.3.1] - 2026-11-03

### Added

- Click a red or amber badge to see which decks use that printing, with links.

### Changed

- The deck panel closes on a click outside or Escape.
- The printing picker lists your printings first (free, then in decks).

## [0.3.0] - 2026-11-03

### Added

- Badges in the printing picker: free copies and which deck holds the rest.

## [0.2.0] - 2026-11-03

### Added

- Switch a card to a free copy from the deck panel with one click, or switch the whole deck after a preview. Partial switches when only some copies are free.

## [0.1.0] - 2026-11-03

### Added

- Deck panel: which cards have their own copy, conflicts with older decks, cards whose printing you don't own while another one is free, and missing cards. Theorycrafted decks show "if you built this deck now".
- Collection page badges: free copies per printing and how many decks use it.
- Sideboard and maybeboard don't use copies; theorycrafted decks never do.
- Browser cache: decks are only reloaded when they changed.
