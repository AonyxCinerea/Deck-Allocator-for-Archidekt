/** Floating panel on /decks/{id}: status of each card's physical copy, with one-click switches to free copies. */
import {
  allocate,
  holdersOf,
  planDeckFix,
  type Deck,
  type PlannedChange,
  type RecordAllocation,
  type SlotResult,
} from "../allocation";
import { applyChanges } from "./actions";
import { decksForAllocation, type Cache } from "./store";
import { currentSettings } from "./settings";
import { el, gearButton, shadowHost, timeAgo } from "./ui";

let open = false;
let lastRender: (() => void) | undefined;

function close() {
  if (!open) return;
  open = false;
  preview = false;
  lastRender?.();
}
// click anywhere outside our UI (or Escape) closes the panel
document.addEventListener(
  "click",
  (e) => {
    const host = document.getElementById("deck-allocator-deck");
    if (open && host && !e.composedPath().includes(host)) close();
  },
  true,
);
document.addEventListener("keydown", (e) => e.key === "Escape" && close());
let preview = false;
let busy = "";
let alertRow = "";

export function deckIdFromUrl(): string | undefined {
  return location.pathname.match(/^\/decks\/(\d+)/)?.[1];
}

const label = (a: RecordAllocation) => `${a.record.setCode?.toUpperCase() ?? "?"}${a.record.finish === "nonfoil" ? "" : " ✦"}`;

export function renderDeckPanel(cache: Cache, deckId: string, status: string, onRefresh: () => void) {
  const rerender = () => renderDeckPanel(cache, deckId, status, onRefresh);
  lastRender = rerender;
  const root = shadowHost("deck-allocator-deck");
  root.querySelectorAll(".fab,.panel").forEach((n) => n.remove());

  const cached = cache.decks[deckId]?.deck;
  if (!cached) {
    if (status) root.append(el("button", { class: "fab" }, status));
    return;
  }

  // A theorycrafted deck is evaluated as "if I built it now": it may only take copies no built deck uses.
  const theory = !cached.physical;
  const decks: Deck[] = decksForAllocation(cache, currentSettings()).map((d) =>
    d.id === deckId && theory ? { ...d, physical: true, priority: Number.MAX_SAFE_INTEGER } : d,
  );
  const result = allocate(cache.collection?.records ?? [], decks, { ignoreBasicLands: currentSettings().ignoreBasicLands });
  const mine = result.slots.filter((s) => s.deckId === deckId && s.status.kind !== "ignored");
  const by = (k: string) => mine.filter((s) => s.status.kind === k);
  const conflicts = by("conflict");
  const swappable = by("swappable");
  const missing = by("missing");
  const owned = by("owned");
  const plan = planDeckFix(result, deckId);

  const fab = el(
    "button",
    { class: "fab", title: "Deck allocator" },
    busy || status || (theory ? "If built" : "Collection"),
    el("span", { class: "n" }, `${owned.length}/${mine.length}`),
  );
  fab.onclick = () => {
    open = !open;
    rerender();
  };
  root.append(fab);
  if (!open) return;

  const run = async (what: string, changes: PlannedChange[]) => {
    busy = what;
    rerender();
    try {
      await applyChanges(deckId, changes); // reloads the page on success
    } catch (e) {
      busy = "";
      alertRow = `Failed: ${(e as Error).message}`;
      rerender();
    }
  };

  const refresh = el("button", { class: "small" }, "Refresh");
  refresh.onclick = onRefresh;
  const fixAll = plan.length ? el("button", { class: "small primary" }, `Use free copies (${plan.length})`) : null;
  if (fixAll) fixAll.onclick = () => ((preview = !preview), rerender());

  const altButtons = (s: SlotResult) => {
    const alts = s.status.kind === "conflict" || s.status.kind === "swappable" ? s.status.alternatives : [];
    if (!alts.length) return el("span", { class: "detail" }, "no free copy");
    const need = s.status.kind === "conflict" ? s.status.missing : s.slot.quantity;
    const wrap = el("span", { class: "detail" });
    for (const a of alts) {
      const qty = Math.min(need, a.free);
      const b = el(
        "button",
        { class: "alt", title: `Switch ${qty}× to ${a.record.setCode?.toUpperCase()} #${a.record.printingId} (${a.free} free)` },
        `${label(a)} ×${a.free}`,
      );
      b.onclick = () => run(`Switching ${s.slot.name}…`, [{ slot: s.slot, target: a.record, quantity: qty }]);
      wrap.append(b);
    }
    return wrap;
  };

  const section = (title: string, cls: string, items: SlotResult[], detail: (s: SlotResult) => Node) =>
    items.length
      ? [
          el("h3", {}, `${title} (${items.length})`),
          ...items
            .sort((a, b) => a.slot.name.localeCompare(b.slot.name))
            .map((s) =>
              el(
                "div",
                { class: "row" },
                el("span", { class: `name ${cls}` }, `${s.slot.quantity > 1 ? s.slot.quantity + "× " : ""}${s.slot.name}`),
                detail(s),
              ),
            ),
        ]
      : [];

  const previewBlock = preview
    ? (() => {
        const apply = el("button", { class: "small primary" }, `Apply ${plan.length} change${plan.length > 1 ? "s" : ""}`);
        apply.onclick = () => run(`Switching ${plan.length} cards…`, plan);
        const cancel = el("button", { class: "small" }, "Cancel");
        cancel.onclick = () => ((preview = false), rerender());
        return el(
          "div",
          { class: "preview" },
          el("h3", {}, "Planned switches"),
          ...plan.map((c) =>
            el(
              "div",
              { class: "row" },
              el("span", { class: "name" }, `${c.quantity}× ${c.slot.name}`),
              el("span", { class: "detail" }, `→ ${c.target.setCode?.toUpperCase()}${c.target.finish === "nonfoil" ? "" : " ✦"}`),
            ),
          ),
          el("div", { class: "top", style: "margin-top:8px" }, cancel, apply),
        );
      })()
    : null;

  const age = cache.collection ? `collection loaded ${timeAgo(cache.collection.fetchedAt)}` : "collection not loaded yet";
  const panel = el(
    "div",
    { class: "panel" },
    el(
      "div",
      { class: "top" },
      el("h2", {}, theory ? "If you built this deck now" : "Physical copies"),
      el("span", {}, fixAll, refresh, " ", gearButton()),
    ),
    el(
      "div",
      { class: "muted" },
      `${owned.length} of ${mine.length} cards have their copy · ${age}` +
        (theory ? " · theorycrafted: only copies no built deck uses count" : "") +
        ` · ignored: ${currentSettings().excludedCategories.join(", ") || "nothing"} · click a printing to switch`,
    ),
    alertRow ? el("div", { class: "bad" }, alertRow) : null,
    previewBlock,
    ...section("Conflict — copy used by an older deck", "bad", conflicts, (s) => {
      const holders = holdersOf(result, s.slot.printingId, s.slot.finish).filter((c) => c.deckId !== deckId);
      return el(
        "span",
        { class: "detail" },
        el("span", { class: "muted" }, `in ${holders.map((h) => h.deckName).join(", ") || "?"} `),
        altButtons(s),
      );
    }),
    ...section("Printing not owned — free copy available", "warn", swappable, altButtons),
    ...section("Not owned / no free copy", "muted", missing, () => el("span")),
  );
  root.append(panel);
}
