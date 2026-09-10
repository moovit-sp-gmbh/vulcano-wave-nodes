import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const [siteDir, version, url] = process.argv.slice(2);
if (!siteDir || !version || !url) {
    console.error("usage: publish-site.mjs <site dir> <version> <catalog url>   (reads ./bundle.js)");
    process.exit(1);
}

const catalog = createRequire(import.meta.url)(path.resolve("bundle.js")).default;
for (const field of ["name", "description", "logoUrl", "minimumEngineVersion"]) {
    if (typeof catalog[field] !== "string" || catalog[field] === "") {
        throw new Error(`Catalog ${field} is missing — the registry would be published without it`);
    }
}

writeFileSync(path.join(siteDir, version, "catalog-info.yaml"), `name: ${catalog.name}\nversion: ${version}\n`);

const indexPath = path.join(siteDir, "index.json");
const registry = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, "utf8")) : {};

registry.name = catalog.name;
registry.description = catalog.description;
registry.logo = catalog.logoUrl;
if (!Array.isArray(registry.versions)) registry.versions = [];

// Stream Designer reads this list; the Agent then fetches <url>/<version>/bundle.js.
const entry = { version, url, dev: version.includes("dev"), minimumEngineVersion: catalog.minimumEngineVersion };
const existing = registry.versions.findIndex((v) => v.version === entry.version && v.url === entry.url);
if (existing === -1) registry.versions.push(entry);
else registry.versions[existing] = entry;

writeFileSync(indexPath, JSON.stringify(registry, null, 2));
console.log(`${indexPath} now lists ${registry.versions.length} version(s)`);
