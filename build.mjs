// Builds the extension into dist/ext (Chrome) and dist/ext-firefox.
import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const ENTRIES = ["content", "main-world", "background", "options"];

rmSync("dist/ext", { recursive: true, force: true });
rmSync("dist/ext-firefox", { recursive: true, force: true });
mkdirSync("dist/ext", { recursive: true });

for (const name of ENTRIES) {
  await build({
    entryPoints: [`src/ext/${name}.ts`],
    bundle: true,
    format: "iife",
    target: "es2020",
    outfile: `dist/ext/${name}.js`,
  });
}
cpSync("ext-static/options.html", "dist/ext/options.html");

// package.json is the single source of the version
const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const base = { ...JSON.parse(readFileSync("ext-static/manifest.json", "utf8")), version };

// Chrome: service worker, no Firefox-specific settings (Chrome warns about them)
const { browser_specific_settings: _gecko, ...chrome } = base;
writeFileSync("dist/ext/manifest.json", JSON.stringify({ ...chrome, background: { service_worker: "background.js" } }, null, 2));

// Firefox MV3: background scripts instead of a service worker
cpSync("dist/ext", "dist/ext-firefox", { recursive: true });
writeFileSync("dist/ext-firefox/manifest.json", JSON.stringify({ ...base, background: { scripts: ["background.js"] } }, null, 2));

console.log(`built ${version}: dist/ext (Chrome), dist/ext-firefox`);
