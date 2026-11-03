/** Small shadow-DOM UI helpers so Archidekt's CSS and ours don't collide. */

export const CSS = `
:host { all: initial; }
* { box-sizing: border-box; font-family: Lato, system-ui, sans-serif; }
.fab { position: fixed; right: 16px; bottom: 16px; z-index: 2147483000; background: #7c3aed; color: #fff;
  border: 0; border-radius: 999px; padding: 10px 14px; font-size: 13px; font-weight: 700; cursor: pointer;
  box-shadow: 0 4px 14px rgba(0,0,0,.25); }
.fab .n { background: #fff; color: #7c3aed; border-radius: 999px; padding: 0 6px; margin-left: 6px; }
.panel { position: fixed; right: 16px; bottom: 64px; z-index: 2147483000; width: 420px; max-height: 70vh;
  overflow: auto; background: #1f1f23; color: #eee; border-radius: 10px; font-size: 13px;
  box-shadow: 0 8px 30px rgba(0,0,0,.4); padding: 12px 14px; }
.panel h2 { font-size: 15px; margin: 0 0 6px; }
.panel h3 { font-size: 13px; margin: 14px 0 4px; color: #c4b5fd; }
.muted { color: #9a9aa5; font-size: 12px; }
.row { display: flex; justify-content: space-between; gap: 8px; padding: 3px 0; border-bottom: 1px solid #2d2d33; }
.row .name { font-weight: 600; }
.row .detail { color: #b9b9c2; text-align: right; }
.pill { display: inline-block; border-radius: 4px; padding: 0 5px; margin-left: 3px; background: #333; }
.ok { color: #4ade80; } .warn { color: #fbbf24; } .bad { color: #f87171; }
button.small { background: #333; color: #eee; border: 1px solid #444; border-radius: 6px; padding: 3px 8px;
  font-size: 12px; cursor: pointer; }
button.primary { background: #7c3aed; border-color: #7c3aed; color: #fff; margin-right: 6px; }
button.alt { background: #14532d; color: #fff; border: 0; border-radius: 4px; padding: 1px 6px; margin-left: 4px;
  font-size: 12px; font-weight: 700; cursor: pointer; }
button.alt:hover { background: #16a34a; }
.preview { background: #2a2540; border-radius: 8px; padding: 6px 10px; margin-top: 8px; }
.overlay { position: fixed; inset: 0; z-index: 2147483002; background: rgba(0,0,0,.55); display: flex; justify-content: center; align-items: flex-start; padding: 4vh 2vw; }
.sheet { background: #1f1f23; color: #eee; border-radius: 10px; width: min(1100px, 100%); max-height: 92vh; overflow: auto; padding: 14px 18px; font-size: 13px; box-shadow: 0 10px 40px rgba(0,0,0,.5); }
.sheet h2 { font-size: 16px; margin: 0; }
.controls { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin: 10px 0; }
.controls input, .controls select { background: #2a2a30; color: #eee; border: 1px solid #444; border-radius: 6px; padding: 5px 8px; font-size: 13px; }
.controls input { min-width: 240px; }
.chip { background: #2a2a30; color: #888; border: 1px solid #444; border-radius: 999px; padding: 3px 10px; margin-right: 4px; font-size: 12px; cursor: pointer; }
.chip.on.free { background: #15803d; color: #fff; border-color: #15803d; }
.chip.on.partial { background: #b45309; color: #fff; border-color: #b45309; }
.chip.on.used { background: #b91c1c; color: #fff; border-color: #b91c1c; }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; color: #9a9aa5; font-weight: 600; padding: 4px 6px; border-bottom: 1px solid #333; position: sticky; top: -14px; background: #1f1f23; }
th.sortable { cursor: pointer; user-select: none; }
td { padding: 3px 6px; border-bottom: 1px solid #2a2a30; vertical-align: top; }
.num { text-align: right; width: 56px; }
td.cname { font-weight: 600; }
td.decks a { color: #c4b5fd; text-decoration: none; margin-right: 10px; white-space: nowrap; }
.dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; }
.dot.free { background: #22c55e; } .dot.partial { background: #f59e0b; } .dot.used { background: #ef4444; }
.toast { position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%); z-index: 2147483003; background: #1f1f23; color: #eee;
  border-left: 4px solid #7c3aed; border-radius: 8px; padding: 10px 14px; font-size: 13px; max-width: 520px; box-shadow: 0 8px 30px rgba(0,0,0,.45); }
.top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
`;

export function shadowHost(id: string): ShadowRoot {
  let host = document.getElementById(id);
  if (!host) {
    host = document.createElement("div");
    host.id = id;
    document.documentElement.appendChild(host);
    const root = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = CSS;
    root.appendChild(style);
  }
  return host.shadowRoot!;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const c of children) if (c) e.append(c);
  return e;
}

export function timeAgo(ts: number): string {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

const ext: typeof chrome = (globalThis as any).browser ?? chrome;
export function gearButton(): HTMLButtonElement {
  const b = el("button", { class: "small", title: "Settings" }, "⚙");
  b.onclick = () => ext.runtime.sendMessage({ type: "openOptions" });
  return b;
}
