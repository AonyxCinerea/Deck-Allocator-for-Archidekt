/** Background: content scripts can't open the options page themselves. */
const ext: typeof chrome = (globalThis as any).browser ?? chrome;
ext.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "openOptions") ext.runtime.openOptionsPage();
});
