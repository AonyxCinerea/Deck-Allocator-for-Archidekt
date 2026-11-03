/** Content script entry (isolated world). Routes by URL, Archidekt is a Next.js SPA so we watch for navigation. */
import { AuthError } from "./api";
import { applyBadges, applyPickerBadges, clearBadges, collectionUserFromUrl, prepareBadges } from "./collection-badges";
import { renderCollectionView, toggleCollectionView } from "./collection-view";
import { deckIdFromUrl, renderDeckPanel } from "./deck-panel";
import { currentSettings, loadSettings, onSettingsChanged, setCurrentSettings } from "./settings";
import { loadCache, sync, type Cache } from "./store";
import { el, shadowHost } from "./ui";

let cache: Cache = { decks: {} };
let status = "";
let syncing: Promise<void> | undefined;

function applyPageBadges() {
  const s = currentSettings();
  if (collectionUserFromUrl()) s.collectionBadges ? applyBadges() : clearBadges("collection");
  if (deckIdFromUrl()) s.pickerBadges ? applyPickerBadges() : clearBadges("picker");
}

function render() {
  const s = currentSettings();
  const deckId = deckIdFromUrl();
  const collectionUser = collectionUserFromUrl();
  prepareBadges(cache);

  shadowHost("deck-allocator-deck").querySelectorAll(".fab,.panel").forEach((n) => n.remove());
  if (deckId && s.deckPanel) renderDeckPanel(cache, deckId, status, () => runSync(false));

  const root = shadowHost("deck-allocator-collection");
  root.querySelectorAll(".fab").forEach((n) => n.remove());
  if (collectionUser && String(cache.userId) === collectionUser) {
    const scan = document.documentElement.getAttribute("data-da-scan") ?? "?";
    const fab = el("button", { class: "fab", title: `Rows matched: ${scan}. Opens the full collection sorted by allocation.` }, status || "Allocation view");
    fab.onclick = () => toggleCollectionView(cache, () => runSync(true));
    root.append(fab);
    renderCollectionView(cache, () => runSync(true));
  }
  applyPageBadges();
}

function runSync(forceCollection = false) {
  if (syncing) return syncing;
  syncing = sync({
    forceCollection,
    settings: currentSettings(),
    progress: (m) => {
      status = m;
      render();
    },
  })
    .then((c) => {
      cache = c;
    })
    .catch((e) => {
      status = e instanceof AuthError ? "" : `Error: ${e.message}`;
      if (!(e instanceof AuthError)) console.error("[deck-allocator]", e);
    })
    .finally(() => {
      syncing = undefined;
      render();
    });
  return syncing;
}

async function main() {
  setCurrentSettings(await loadSettings());
  onSettingsChanged((s) => {
    setCurrentSettings(s);
    render();
  });
  cache = await loadCache();
  render(); // show cached state immediately
  runSync();

  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      render();
      runSync(); // cheap: deck list + collection quick check (at most once a minute)
    }
  }, 500);

  let pending = false;
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      applyPageBadges();
    }, 300);
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-da-record-id"] });
}

main();
