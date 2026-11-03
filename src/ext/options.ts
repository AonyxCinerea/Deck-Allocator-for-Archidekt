import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from "./settings";
import { clearCache, loadCache } from "./store";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const BOOLS = ["ignoreBasicLands", "deckPanel", "collectionBadges", "pickerBadges", "pickerReorder", "searchOwnedFirst", "searchUseFreeCopy", "addedToast"] as const;

async function main() {
  const s = await loadSettings();
  const cache = await loadCache();

  // categories seen in the user's decks + defaults
  const seen = new Set<string>(DEFAULT_SETTINGS.excludedCategories);
  for (const d of Object.values(cache.decks)) for (const sl of d.deck.slots) if (sl.category) seen.add(sl.category);
  const known = [...seen].sort((a, b) => a.localeCompare(b));
  const cats = $("cats");
  for (const c of known) {
    const l = document.createElement("label");
    l.innerHTML = `<input type="checkbox" value="${c.replace(/"/g, "&quot;")}"> `;
    l.append(c);
    (l.firstChild as HTMLInputElement).checked = s.excludedCategories.includes(c);
    cats.append(l);
  }
  $<HTMLInputElement>("extraCats").value = s.excludedCategories.filter((c) => !seen.has(c)).join(", ");
  for (const k of BOOLS) $<HTMLInputElement>(k).checked = s[k];
  $<HTMLInputElement>("fullReloadHours").value = String(s.fullReloadHours);

  const n = cache.collection?.records.length ?? 0;
  $("cacheInfo").textContent = `${n} collection records, ${Object.keys(cache.decks).length} decks cached`;

  $("save").onclick = async () => {
    const excluded = [
      ...[...cats.querySelectorAll<HTMLInputElement>("input:checked")].map((i) => i.value),
      ...$<HTMLInputElement>("extraCats").value.split(",").map((x) => x.trim()).filter(Boolean),
    ];
    const next: Settings = {
      ...s,
      excludedCategories: [...new Set(excluded)],
      fullReloadHours: Math.max(1, Number($<HTMLInputElement>("fullReloadHours").value) || 12),
    };
    for (const k of BOOLS) next[k] = $<HTMLInputElement>(k).checked;
    await saveSettings(next);
    $("saved").textContent = "Saved — open Archidekt tabs update automatically";
  };
  $("clearCache").onclick = async () => {
    await clearCache();
    $("cacheInfo").textContent = "Cleared — reloads on your next Archidekt visit";
  };
}
main();
