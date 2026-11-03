// Prints the CHANGELOG.md section for a version (default: package.json version). Exits 1 if there is none.
import { readFileSync } from "node:fs";

const version = process.argv[2] ?? JSON.parse(readFileSync("package.json", "utf8")).version;
const changelog = readFileSync("CHANGELOG.md", "utf8");
const sections = changelog.split(/^## /m).slice(1);
const section = sections.find((s) => s.startsWith(`[${version}]`));
if (!section) {
  console.error(`CHANGELOG.md has no "## [${version}]" section`);
  process.exit(1);
}
const body = section.split("\n").slice(1).join("\n").trim();
const install =
  "\n\n---\n**Install / update:** download `deck-allocator-chrome-" +
  version +
  ".zip`, unzip it (over the old folder when updating), " +
  "then `chrome://extensions` → Developer mode → *Load unpacked* (or the reload icon when updating). See the README for Firefox.";
process.stdout.write(body + install + "\n");
