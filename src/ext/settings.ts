/** User settings (synced across the user's browsers via storage.sync). */
import { DEFAULT_EXCLUDED_CATEGORIES } from "../archidekt";

export interface Settings {
  excludedCategories: string[];
  fullReloadHours: number;
  ignoreBasicLands: boolean;
  deckPanel: boolean;
  collectionBadges: boolean;
  pickerBadges: boolean;
  pickerReorder: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  excludedCategories: DEFAULT_EXCLUDED_CATEGORIES,
  fullReloadHours: 12,
  ignoreBasicLands: true,
  deckPanel: true,
  collectionBadges: true,
  pickerBadges: true,
  pickerReorder: true,
};

const KEY = "deckAllocator.settings";
const ext: typeof chrome = (globalThis as any).browser ?? chrome;

export async function loadSettings(): Promise<Settings> {
  const got = await ext.storage.sync.get(KEY);
  return { ...DEFAULT_SETTINGS, ...((got[KEY] as Partial<Settings>) ?? {}) };
}

export async function saveSettings(s: Settings) {
  await ext.storage.sync.set({ [KEY]: s });
}

export function onSettingsChanged(cb: (s: Settings) => void) {
  ext.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes[KEY]) cb({ ...DEFAULT_SETTINGS, ...(changes[KEY].newValue as Partial<Settings>) });
  });
}

let current: Settings = DEFAULT_SETTINGS;
/** Synchronous access for renderers; content.ts keeps it up to date. */
export const currentSettings = () => current;
export const setCurrentSettings = (s: Settings) => {
  current = s;
};
