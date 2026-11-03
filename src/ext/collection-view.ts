/** Full collection view across all pages: one row per printing+finish, sortable/filterable by allocation status. */
import { allocate, type RecordAllocation } from "../allocation";
import { decksForAllocation, type Cache } from "./store";
import { currentSettings } from "./settings";
import { el, gearButton, shadowHost, timeAgo } from "./ui";

type Status = "free" | "partial" | "used";
type SortKey = "status" | "name" | "set" | "owned" | "free" | "decks";

interface Row {
  name: string;
  set: string;
  cn: string;
  finish: string;
  owned: number;
  free: number;
  status: Status;
  decks: { id: string; name: string; qty: number }[];
}

const STATUS_LABEL: Record<Status, string> = { free: "Free", partial: "Partly used", used: "All in decks" };
const STATUS_RANK: Record<Status, number> = { free: 0, partial: 1, used: 2 };

const state = {
  open: false,
  statuses: new Set<Status>(["free", "partial", "used"]),
  search: "",
  deck: "",
  sort: "status" as SortKey,
  desc: false,
  limit: 300,
};

function buildRows(cache: Cache): Row[] {
  const result = allocate(cache.collection?.records ?? [], decksForAllocation(cache, currentSettings()), {
    ignoreBasicLands: currentSettings().ignoreBasicLands,
  });
  const groups = new Map<string, RecordAllocation[]>();
  for (const ra of result.records.values()) {
    const k = `${ra.record.printingId}|${ra.record.finish}`;
    groups.set(k, [...(groups.get(k) ?? []), ra]);
  }
  return [...groups.values()].map((g) => {
    const r = g[0].record;
    const owned = g.reduce((n, x) => n + x.record.quantity, 0);
    const free = g.reduce((n, x) => n + Math.max(x.free, 0), 0);
    const decks = new Map<string, { id: string; name: string; qty: number }>();
    for (const x of g)
      for (const c of x.claims) {
        const d = decks.get(c.deckId) ?? { id: c.deckId, name: c.deckName, qty: 0 };
        d.qty += c.quantity;
        decks.set(c.deckId, d);
      }
    const status: Status = decks.size === 0 ? "free" : free > 0 ? "partial" : "used";
    return {
      name: r.name,
      set: (r.setCode ?? "").toUpperCase(),
      cn: r.collectorNumber ?? "",
      finish: r.finish === "nonfoil" ? "" : r.finish === "foil" ? "Foil" : "Etched",
      owned,
      free,
      status,
      decks: [...decks.values()],
    };
  });
}

function compare(a: Row, b: Row, key: SortKey): number {
  switch (key) {
    case "status":
      return STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.name.localeCompare(b.name);
    case "name":
      return a.name.localeCompare(b.name) || a.set.localeCompare(b.set);
    case "set":
      return a.set.localeCompare(b.set) || a.cn.localeCompare(b.cn, undefined, { numeric: true });
    case "owned":
      return a.owned - b.owned || a.name.localeCompare(b.name);
    case "free":
      return a.free - b.free || a.name.localeCompare(b.name);
    case "decks":
      return a.decks.length - b.decks.length || a.name.localeCompare(b.name);
  }
}

export function toggleCollectionView(cache: Cache, onRefresh: () => void) {
  state.open = !state.open;
  renderCollectionView(cache, onRefresh);
}

export function renderCollectionView(cache: Cache, onRefresh: () => void) {
  const root = shadowHost("deck-allocator-view");
  root.querySelectorAll(".overlay").forEach((n) => n.remove());
  if (!state.open) return;
  const rerender = () => renderCollectionView(cache, onRefresh);

  const all = buildRows(cache);
  const counts = { free: 0, partial: 0, used: 0 } as Record<Status, number>;
  for (const r of all) counts[r.status]++;
  const deckNames = [...new Map(all.flatMap((r) => r.decks).map((d) => [d.id, d.name])).entries()].sort((a, b) =>
    a[1].localeCompare(b[1]),
  );

  const q = state.search.trim().toLowerCase();
  const rows = all
    .filter((r) => state.statuses.has(r.status))
    .filter((r) => !q || r.name.toLowerCase().includes(q) || r.set.toLowerCase() === q)
    .filter((r) => !state.deck || r.decks.some((d) => d.id === state.deck))
    .sort((a, b) => (state.desc ? -1 : 1) * compare(a, b, state.sort));

  // --- controls
  const chips = el("span", {});
  for (const s of ["free", "partial", "used"] as Status[]) {
    const c = el("button", { class: `chip ${s} ${state.statuses.has(s) ? "on" : ""}` }, `${STATUS_LABEL[s]} ${counts[s]}`);
    c.onclick = () => {
      state.statuses.has(s) ? state.statuses.delete(s) : state.statuses.add(s);
      rerender();
    };
    chips.append(c);
  }
  const search = el("input", { type: "search", placeholder: "Search name or set code…", value: state.search });
  search.oninput = () => {
    state.search = search.value;
    state.limit = 300;
    rerender();
    const s = root.querySelector<HTMLInputElement>("input[type=search]")!;
    s.focus();
    s.setSelectionRange(s.value.length, s.value.length);
  };
  const deckSel = el(
    "select",
    {},
    el("option", { value: "" }, "All decks"),
    ...deckNames.map(([id, n]) => el("option", { value: id }, n)),
  );
  deckSel.value = state.deck;
  deckSel.onchange = () => ((state.deck = deckSel.value), rerender());
  const refresh = el("button", { class: "small" }, "Reload collection");
  refresh.onclick = onRefresh;
  const close = el("button", { class: "small" }, "✕");
  close.onclick = () => ((state.open = false), rerender());

  // --- table
  const th = (key: SortKey, labelText: string, cls = "") => {
    const h = el("th", { class: `${cls} sortable` }, labelText + (state.sort === key ? (state.desc ? " ▾" : " ▴") : ""));
    h.onclick = () => {
      state.desc = state.sort === key ? !state.desc : false;
      state.sort = key;
      rerender();
    };
    return h;
  };
  const tbody = el("tbody");
  for (const r of rows.slice(0, state.limit)) {
    const deckCell = el("td", { class: "decks" });
    for (const d of r.decks) deckCell.append(el("a", { href: `/decks/${d.id}` }, `${d.qty > 1 ? d.qty + "× " : ""}${d.name}`));
    tbody.append(
      el(
        "tr",
        {},
        el("td", {}, el("span", { class: `dot ${r.status}`, title: STATUS_LABEL[r.status] })),
        el("td", { class: "cname" }, r.name),
        el("td", { class: "muted" }, `${r.set} ${r.cn}${r.finish ? " · " + r.finish : ""}`),
        el("td", { class: "num" }, String(r.owned)),
        el("td", { class: "num" }, String(r.free)),
        deckCell,
      ),
    );
  }
  const more =
    rows.length > state.limit ? el("button", { class: "small" }, `Show more (${rows.length - state.limit} left)`) : null;
  if (more) more.onclick = () => ((state.limit += 500), rerender());

  const overlay = el(
    "div",
    { class: "overlay" },
    el(
      "div",
      { class: "sheet" },
      el(
        "div",
        { class: "top" },
        el("h2", {}, "Collection by allocation"),
        el("span", {}, refresh, " ", gearButton(), " ", close),
      ),
      el(
        "div",
        { class: "muted" },
        `${all.length} printings · ${rows.length} shown · collection loaded ${cache.collection ? timeAgo(cache.collection.fetchedAt) : "never"} · not counted: theorycrafted decks, ${currentSettings().excludedCategories.join(", ") || "—"}`,
      ),
      el("div", { class: "controls" }, chips, search, deckSel),
      el(
        "table",
        {},
        el(
          "thead",
          {},
          el(
            "tr",
            {},
            th("status", ""),
            th("name", "Card"),
            th("set", "Printing"),
            th("owned", "Owned", "num"),
            th("free", "Free", "num"),
            th("decks", "In decks"),
          ),
        ),
        tbody,
      ),
      more,
    ),
  );
  overlay.onclick = (e) => {
    if (e.target === overlay) ((state.open = false), rerender());
  };
  root.append(overlay);
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.open) {
    state.open = false;
    shadowHost("deck-allocator-view")
      .querySelectorAll(".overlay")
      .forEach((n) => n.remove());
  }
});
