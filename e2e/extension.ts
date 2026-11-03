/** Playwright fixture: a persistent Chromium context with the built extension (dist/ext) loaded and a fake Archidekt. */
import { test as base, chromium, expect, type BrowserContext, type Page, type Worker } from "@playwright/test";
import path from "node:path";
import { FakeArchidekt } from "./fake-archidekt";

const EXT = path.resolve(process.cwd(), "dist/ext");

export const test = base.extend<{ ctx: BrowserContext; archidekt: FakeArchidekt; sw: Worker }>({
  archidekt: async ({}, use) => use(new FakeArchidekt()),
  ctx: async ({}, use) => {
    const ctx = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless: true,
      args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    });
    await use(ctx);
    await ctx.close();
  },
  sw: async ({ ctx }, use) => use(ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"))),
});
export { expect };

const deckRoot = 'document.getElementById("deck-allocator-deck").shadowRoot';

/** Waits until the deck panel button shows counts and no sync is running. */
export async function deckReady(page: Page) {
  await page.waitForFunction(
    `(() => { const f = document.getElementById("deck-allocator-deck")?.shadowRoot.querySelector(".fab");
      return f && f.querySelector(".n") && !/Loading|Switching|rate limit/.test(f.textContent) })()`,
    null,
    { timeout: 60_000 },
  );
}

export const fabText = (page: Page) =>
  page.evaluate(`${deckRoot}.querySelector(".fab").innerText.replace(/\\n/g, " ")`) as Promise<string>;
export const openPanel = (page: Page) => page.evaluate(`${deckRoot}.querySelector(".fab").click()`);
export const panelText = (page: Page) => page.evaluate(`${deckRoot}.querySelector(".panel")?.innerText ?? ""`) as Promise<string>;
export const clickPanelButton = (page: Page, startsWith: string) =>
  page.evaluate(
    `[...${deckRoot}.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith(${JSON.stringify(startsWith)})).click()`,
  );
