// Sync the workspace package source into the profile's installed copy.
// pnpm installs `file:` deps as a COPY (hoisted linker), so the running DSH
// serves stale code after every edit — this script refreshes the copy.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const src = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dst = path.join(process.env.DSH_HOME || "C:/Users/13971/.dsh", "profiles", "desktop", "node_modules", "kidai-clipboard");

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.name === "scripts" || entry.name === ".profile-backup" || entry.name === ".git") continue;
    const a = path.join(from, entry.name);
    const b = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(a, b);
    else fs.copyFileSync(a, b);
  }
}

for (const file of ["package.json", "cordis.patch.yml", "README.md"]) {
  const from = path.join(src, file);
  if (fs.existsSync(from)) fs.copyFileSync(from, path.join(dst, file));
}
copyTree(path.join(src, "lib"), path.join(dst, "lib"));

const sentinel = path.join(dst, "lib", "client.js");
const serverStat = fs.statSync(path.join(src, "lib", "client.js"));
const dstStat = fs.statSync(sentinel);
console.log("synced package.json/cordis.patch.yml/README/lib to", dst);
console.log("client.js:", serverStat.size, "bytes ->", dstStat.size, "bytes (mtime", dstStat.mtime.toISOString() + ")");
