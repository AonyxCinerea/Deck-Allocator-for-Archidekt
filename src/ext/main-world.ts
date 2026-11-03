/**
 * Runs in the page's MAIN world (needed to read React internals).
 * Stamps each collection row with the Archidekt collection record id: data-da-record-id="560683989".
 * The isolated content script reads that attribute and renders the badge.
 */

const ROW_SELECTOR = '[class*="textCollectionCard_cardRow"]';

function looksLikeRecord(o: any): o is { id: number } {
  return o && typeof o === "object" && typeof o.id === "number" && "quantity" in o && ("condition" in o || "modifier" in o) && "card" in o;
}

function findRecord(props: any, depth = 0): number | undefined {
  if (!props || typeof props !== "object" || depth > 2) return;
  if (looksLikeRecord(props)) return props.id;
  for (const v of Object.values(props)) {
    if (v && typeof v === "object" && !(v instanceof Node) && !Array.isArray(v)) {
      const id = findRecord(v, depth + 1);
      if (id) return id;
    }
  }
}

function recordIdFor(row: Element): number | undefined {
  const key = Object.keys(row).find((k) => k.startsWith("__reactFiber$"));
  let fiber = key ? (row as any)[key] : undefined;
  for (let i = 0; fiber && i < 25; i++, fiber = fiber.return) {
    const id = findRecord(fiber.memoizedProps);
    if (id) return id;
  }
}

function scan() {
  let found = 0;
  let failed = 0;
  for (const row of document.querySelectorAll(ROW_SELECTOR)) {
    const id = recordIdFor(row);
    const v = id ? String(id) : "";
    if (row.getAttribute("data-da-record-id") !== v) row.setAttribute("data-da-record-id", v);
    id ? found++ : failed++;
  }
  document.documentElement.setAttribute("data-da-scan", `${found}/${found + failed}`);
}

let pending = false;
new MutationObserver(() => {
  if (pending) return;
  pending = true;
  setTimeout(() => {
    pending = false;
    scan();
  }, 250);
}).observe(document.documentElement, { childList: true, subtree: true });
scan();
