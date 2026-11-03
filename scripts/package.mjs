// Zips dist/ext (Chrome) and dist/ext-firefox for a release. Version comes from the manifest.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
const { version } = JSON.parse(readFileSync("ext-static/manifest.json", "utf8"));
for (const [dir, name] of [["ext", "chrome"], ["ext-firefox", "firefox"]]) {
  execSync(`cd dist/${dir} && zip -qr ../deck-allocator-${name}-${version}.zip .`);
  console.log(`dist/deck-allocator-${name}-${version}.zip`);
}
