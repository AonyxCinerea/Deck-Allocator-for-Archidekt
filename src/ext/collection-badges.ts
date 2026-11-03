/** Badges on collection rows: "3 owned · 1 in Witherbloom · 2 free" for that printing+finish. */
import { allocate, type AllocationResult, type RecordAllocation } from "../allocation";
import { decksForAllocation, type Cache } from "./store";
import { currentSettings } from "./settings";

const BADGE_CLASS = "deck-allocator-badge";
const NAME_SELECTOR = '[class*="textCollectionCard_cardName"]';

let result: AllocationResult | undefined;
let byRecordId = new Map<string, RecordAllocation[]>(); // record id → all records of the same printing+finish
let byPrinting = new Map<string, RecordAllocation[]>(); // "set|collectorNumber" → records of that printing (all finishes)

export function collectionUserFromUrl(): string | undefined {
  return location.pathname.match(/^\/collection\/v2\/(\d+)/)?.[1];
}

export function prepareBadges(cache: Cache) {
  result = allocate(cache.collection?.records ?? [], decksForAllocation(cache, currentSettings()), { ignoreBasicLands: currentSettings().ignoreBasicLands });
  const groups = new Map<string, RecordAllocation[]>();
  for (const ra of result.records.values()) {
    const k = `${ra.record.printingId}|${ra.record.finish}`;
    groups.set(k, [...(groups.get(k) ?? []), ra]);
  }
  byRecordId = new Map();
  for (const group of groups.values()) for (const ra of group) byRecordId.set(ra.record.id, group);
  byPrinting = new Map();
  for (const ra of result.records.values()) {
    const k = printingKey(ra.record.setCode, ra.record.collectorNumber);
    if (k) byPrinting.set(k, [...(byPrinting.get(k) ?? []), ra]);
  }
}

const printingKey = (set?: string, cn?: string) => (set && cn ? `${set.toLowerCase()}|${cn.toLowerCase()}` : undefined);

const TILE_SELECTOR = '[class*="cardEditionsGridOverlay_cardContainer"]';
const TILE_TITLE_SELECTOR = '[class*="cardEditionsGridOverlay_cardBorderContainer"][title]';

let gridChecked = false;
function checkGridOnce(parent: HTMLElement | null) {
  if (gridChecked || !parent) return;
  gridChecked = true;
  const d = getComputedStyle(parent).display;
  if (!/grid|flex/.test(d)) console.warn(`[deck-allocator] printing grid is display:${d} — reordering has no effect`);
}

/** Printing picker ("Select a printing"): tiles are titled "Name (set) collectorNumber". */
export function applyPickerBadges() {
  if (!result) return;
  for (const tile of document.querySelectorAll<HTMLElement>(TILE_SELECTOR)) {
    const title = tile.querySelector(TILE_TITLE_SELECTOR)?.getAttribute("title") ?? "";
    const m = title.match(/\(([^)]+)\)\s+(\S+)\s*$/);
    const key = m ? printingKey(m[1], m[2]) : undefined;
    const group = key ? byPrinting.get(key) : undefined;
    // owned & free first, then owned & used, then the rest — keeps Archidekt's sort inside each group
    const free = group?.reduce((n, r) => n + Math.max(r.free, 0), 0) ?? 0;
    const order = !currentSettings().pickerReorder ? "" : !group ? "0" : free > 0 ? "-2" : "-1";
    if (tile.style.order !== order) tile.style.order = order;
    checkGridOnce(tile.parentElement);
    const existing = tile.querySelector<HTMLElement>(`.${BADGE_CLASS}`);
    if (existing?.dataset.for === key) continue;
    existing?.remove();
    if (!group) continue;
    const badge = badgeFor(group, true);
    badge.dataset.for = key!;
    Object.assign(badge.style, { display: "block", margin: "3px auto 0", width: "fit-content" });
    tile.appendChild(badge);
  }
}

function badgeFor(group: RecordAllocation[], withFinish = false): HTMLElement {
  const owned = group.reduce((n, r) => n + r.record.quantity, 0);
  const free = group.reduce((n, r) => n + Math.max(r.free, 0), 0);
  const claims = new Map<string, number>();
  const deckIds = new Map<string, string>();
  for (const r of group)
    for (const c of r.claims) {
      claims.set(c.deckName, (claims.get(c.deckName) ?? 0) + c.quantity);
      deckIds.set(c.deckName, c.deckId);
    }

  const b = document.createElement("span");
  b.className = BADGE_CLASS;
  const bg = claims.size === 0 ? "#15803d" : free > 0 ? "#b45309" : "#b91c1c";
  Object.assign(b.style, {
    marginLeft: "6px",
    padding: "0 5px",
    borderRadius: "4px",
    fontSize: "11px",
    fontWeight: "700",
    background: bg,
    color: "#fff",
    whiteSpace: "nowrap",
  });
  const decks = [...claims.keys()];
  b.textContent =
    claims.size === 0
      ? `${free} free`
      : `${free}/${owned} free · ${decks.length === 1 ? decks[0].slice(0, 18) : decks.length + " decks"}`;
  if (withFinish) {
    const foil = group.filter((r) => r.record.finish !== "nonfoil").reduce((n, r) => n + Math.max(r.free, 0), 0);
    if (foil) b.textContent += ` (${foil} ✦)`;
  }
  if (claims.size) {
    b.style.cursor = "pointer";
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation(); // don't open Archidekt's card modal / select the printing
      showDeckPopover(b, owned, free, [...claims].map(([name, qty]) => ({ name, qty, id: deckIds.get(name)! })));
    }, true);
  }
  b.title = claims.size
    ? `This printing: ${owned} owned, ${free} free\n` + [...claims].map(([d, q]) => `• ${q}× ${d}`).join("\n") + "\n(click for links)"
    : `This printing: ${owned} owned, none in a built deck`;
  return b;
}

/** Called on every DOM change; idempotent. */
export function applyBadges() {
  if (!result) return;
  for (const row of document.querySelectorAll<HTMLElement>("[data-da-record-id]")) {
    const id = row.getAttribute("data-da-record-id")!;
    const existing = row.querySelector<HTMLElement>(`.${BADGE_CLASS}`);
    if (existing?.dataset.for === id) continue;
    existing?.remove();
    const group = id ? byRecordId.get(id) : undefined;
    if (!group) continue;
    const badge = badgeFor(group);
    badge.dataset.for = id;
    (row.querySelector(NAME_SELECTOR) ?? row).appendChild(badge);
  }
}

// --- deck popover --------------------------------------------------------------

let popover: HTMLElement | undefined;

function closePopover() {
  popover?.remove();
  popover = undefined;
}
document.addEventListener("click", (e) => {
  if (popover && !e.composedPath().includes(popover)) closePopover();
});
document.addEventListener("keydown", (e) => e.key === "Escape" && closePopover());

function showDeckPopover(anchor: HTMLElement, owned: number, free: number, decks: { name: string; qty: number; id: string }[]) {
  closePopover();
  const r = anchor.getBoundingClientRect();
  const p = document.createElement("div");
  Object.assign(p.style, {
    position: "fixed", zIndex: "2147483001", left: `${Math.min(r.left, innerWidth - 280)}px`, top: `${r.bottom + 4}px`,
    width: "260px", background: "#1f1f23", color: "#eee", borderRadius: "8px", padding: "8px 10px",
    font: "13px Lato, system-ui, sans-serif", boxShadow: "0 8px 30px rgba(0,0,0,.4)",
  });
  const head = document.createElement("div");
  head.textContent = `${owned} owned · ${free} free`;
  Object.assign(head.style, { color: "#9a9aa5", fontSize: "12px", marginBottom: "4px" });
  p.append(head);
  for (const d of decks.sort((a, b) => a.name.localeCompare(b.name))) {
    const a = document.createElement("a");
    a.href = `/decks/${d.id}`;
    a.textContent = `${d.qty}× ${d.name}`;
    Object.assign(a.style, { display: "block", color: "#c4b5fd", padding: "2px 0", textDecoration: "none" });
    a.addEventListener("click", (e) => e.stopPropagation(), true);
    p.append(a);
  }
  document.body.append(p);
  popover = p;
}

/** Remove everything we added (feature switched off). */
export function clearBadges(kind: "collection" | "picker") {
  if (kind === "collection") {
    document.querySelectorAll(`[data-da-record-id] .${BADGE_CLASS}`).forEach((b) => b.remove());
  } else {
    for (const tile of document.querySelectorAll<HTMLElement>(TILE_SELECTOR)) {
      tile.querySelector(`.${BADGE_CLASS}`)?.remove();
      tile.style.order = "";
    }
  }
}
