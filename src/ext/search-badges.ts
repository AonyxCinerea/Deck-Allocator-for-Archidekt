/**
 * Collection info in Archidekt's card search:
 *  - search result grid (deck "Search" overlay and the site-wide card search, one print or all prints)
 *  - quick add suggestions on deck pages
 * Exact printing owned → the usual free/used badge. Card owned in other printings → a grey "other printings" badge.
 * Tiles are reordered (owned free → owned used → other printing owned → rest) via CSS order, which keeps React's DOM intact.
 */
import type { RecordAllocation } from "../allocation";
import { BADGE_CLASS, badgeFor, badgesReady, lookupName, lookupPrinting } from "./collection-badges";
import { currentSettings } from "./settings";

const GRID_ITEM = '[class*="cardResultsGrid_container"] > *';
const QUICK_ADD_OPTION = '[class*="cardAutocomplete_option"]';

const freeOf = (g: RecordAllocation[]) => g.reduce((n, r) => n + Math.max(r.free, 0), 0);

function otherPrintingsBadge(all: RecordAllocation[], exclude?: RecordAllocation[]): HTMLElement | undefined {
  const others = all.filter((r) => !exclude?.includes(r));
  if (!others.length) return;
  const free = freeOf(others);
  const owned = others.reduce((n, r) => n + r.record.quantity, 0);
  const b = document.createElement("span");
  b.className = BADGE_CLASS;
  Object.assign(b.style, {
    marginLeft: "6px",
    padding: "0 5px",
    borderRadius: "4px",
    fontSize: "11px",
    fontWeight: "700",
    background: free ? "#1e3a8a" : "#3f3f46",
    color: "#fff",
    whiteSpace: "nowrap",
  });
  b.textContent = free ? `other printings: ${free} free` : `other printings: ${owned}, all in decks`;
  const sets = new Map<string, number>();
  for (const r of others) {
    if (r.free <= 0) continue;
    const label = `${r.record.setCode?.toUpperCase()}${r.record.finish === "nonfoil" ? "" : " ✦"}`;
    sets.set(label, (sets.get(label) ?? 0) + r.free);
  }
  b.title = free
    ? `Free copies: ${[...sets].map(([s, n]) => `${s} ×${n}`).join(", ")}`
    : `You own ${owned} in other printings, all in built decks`;
  return b;
}

function badgeForTitle(name: string, set?: string, cn?: string): { badge?: HTMLElement; rank: number; key: string } {
  const exact = lookupPrinting(set, cn);
  const all = lookupName(name) ?? [];
  const key = `${set}|${cn}|${name}`;
  if (exact) return { badge: badgeFor(exact, true), rank: freeOf(exact) > 0 ? 0 : 1, key };
  if (all.length) return { badge: otherPrintingsBadge(all), rank: 2, key };
  return { rank: 3, key };
}

function place(host: HTMLElement, key: string, make: () => HTMLElement | undefined, style: Partial<CSSStyleDeclaration> = {}) {
  const existing = host.querySelector<HTMLElement>(`:scope > .${BADGE_CLASS}, :scope .${BADGE_CLASS}`);
  if (existing?.dataset.for === key) return;
  existing?.remove();
  const b = make();
  if (!b) return;
  b.dataset.for = key;
  Object.assign(b.style, style);
  host.appendChild(b);
}

export function applySearchBadges() {
  if (!badgesReady() || !currentSettings().searchBadges) return;
  const reorder = currentSettings().searchOwnedFirst;

  // result grid
  for (const item of document.querySelectorAll<HTMLElement>(GRID_ITEM)) {
    const title = item.querySelector("img[title]")?.getAttribute("title") ?? "";
    const m = title.match(/^(.*)\s+\(([^)]+)\)\s+(\S+)\s*$/);
    if (!m) continue;
    const info = badgeForTitle(m[1], m[2], m[3]);
    const order = reorder ? String(info.rank - 3) : "";
    if (item.style.order !== order) item.style.order = order;
    place(item, info.key, () => info.badge, { display: "block", margin: "3px auto 0", width: "fit-content" });
  }

  // quick add suggestions: name + "(TRC) (499)"
  for (const opt of document.querySelectorAll<HTMLElement>(QUICK_ADD_OPTION)) {
    const name = opt.querySelector('[class*="cardAutocomplete_setName"]')?.textContent ?? "";
    const meta = opt.querySelector('[class*="cardAutocomplete_metaInfo"] span')?.textContent ?? "";
    const m = meta.match(/\(([^)]+)\)\s*\(([^)]+)\)/);
    if (!name) continue;
    const info = badgeForTitle(name, m?.[1], m?.[2]);
    const words = opt.querySelector<HTMLElement>('[class*="cardAutocomplete_metaInfo"]') ?? opt;
    place(words, info.key, () => info.badge);
  }
}

export function clearSearchBadges() {
  for (const item of document.querySelectorAll<HTMLElement>(GRID_ITEM)) {
    item.querySelector(`.${BADGE_CLASS}`)?.remove();
    item.style.order = "";
  }
  document.querySelectorAll(`${QUICK_ADD_OPTION} .${BADGE_CLASS}`).forEach((b) => b.remove());
}
