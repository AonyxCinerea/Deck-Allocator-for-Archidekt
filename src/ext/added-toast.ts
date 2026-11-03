/** After a card is added to a deck (any way Archidekt adds cards): if a free copy of another printing exists, offer to switch. */
import { allocate, type PlannedChange } from "../allocation";
import { applyChanges } from "./actions";
import { currentSettings } from "./settings";
import { decksForAllocation, type Cache } from "./store";
import { el, shadowHost } from "./ui";

export function showAddedToasts(cache: Cache, deckId: string, deckRelationIds: string[]) {
  const s = currentSettings();
  const decks = decksForAllocation(cache, s).map((d) =>
    d.id === deckId && !d.physical ? { ...d, physical: true, priority: Number.MAX_SAFE_INTEGER } : d,
  );
  const result = allocate(cache.collection?.records ?? [], decks, { ignoreBasicLands: s.ignoreBasicLands });
  const offers: PlannedChange[] = [];
  for (const sr of result.slots) {
    const rel = (sr.slot.ref as any)?.deckRelationId;
    if (sr.deckId !== deckId || !deckRelationIds.includes(rel)) continue;
    if (sr.status.kind !== "swappable" && sr.status.kind !== "conflict") continue;
    const best = sr.status.alternatives.find((a) => a.record.finish === sr.slot.finish) ?? sr.status.alternatives[0];
    if (!best) continue;
    const need = sr.status.kind === "conflict" ? sr.status.missing : sr.slot.quantity;
    offers.push({ slot: sr.slot, target: best.record, quantity: Math.min(need, best.free) });
  }
  if (!offers.length) return;

  const root = shadowHost("deck-allocator-toast");
  root.querySelectorAll(".toast").forEach((n) => n.remove());
  const names = offers.map((o) => `${o.slot.name} → ${o.target.setCode?.toUpperCase()}${o.target.finish === "nonfoil" ? "" : " ✦"}`).join(", ");
  const yes = el("button", { class: "small primary" }, offers.length > 1 ? `Use my ${offers.length} free copies` : "Use my free copy");
  const no = el("button", { class: "small" }, "Keep");
  const toast = el(
    "div",
    { class: "toast" },
    el("div", {}, offers.length > 1 ? "Added in printings you don't own. You have free copies:" : "Added in a printing you don't own. You have a free copy:"),
    el("div", { class: "muted", style: "margin:4px 0 8px" }, names),
    el("div", {}, yes, no),
  );
  yes.onclick = async () => {
    yes.textContent = "Switching…";
    try {
      await applyChanges(deckId, offers); // reloads
    } catch (e) {
      yes.textContent = `Failed: ${(e as Error).message}`;
    }
  };
  no.onclick = () => toast.remove();
  root.append(toast);
  setTimeout(() => toast.isConnected && yes.textContent !== "Switching…" && toast.remove(), 20000);
}
