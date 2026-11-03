import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
rmSync("dist/ext", { recursive: true, force: true });
mkdirSync("dist/ext", { recursive: true });
for (const name of ["content", "main-world", "background", "options"]) {
  await build({ entryPoints: [`src/ext/${name}.ts`], bundle: true, format: "iife", target: "es2020", outfile: `dist/ext/${name}.js` });
}
const manifest = JSON.parse(readFileSync("ext-static/manifest.json", "utf8"));
// Chrome warns about browser_specific_settings; keep it out of the Chrome build
const chromeManifest = { ...manifest }; delete chromeManifest.browser_specific_settings;
cpSync("ext-static/options.html", "dist/ext/options.html");
// Firefox MV3 uses background.scripts instead of a service worker
manifest.background = { scripts: ["background.js"] };
writeFileSync("dist/ext/manifest.json", JSON.stringify(chromeManifest, null, 2));
cpSync("dist/ext", "dist/ext-firefox", { recursive: true });
writeFileSync("dist/ext-firefox/manifest.json", JSON.stringify(manifest, null, 2));
console.log("built dist/ext (Chrome) and dist/ext-firefox");
