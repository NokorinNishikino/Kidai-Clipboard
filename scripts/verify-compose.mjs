// Activation-path verification WITHOUT restarting DSH Desktop:
// runs the desktop's own profile composer (profile-CS14Ht13.js) against the
// real profile dir. prepareDesktopProfile succeeds only when the composed
// entries are unique and every required row exists; the returned profile
// layers carry each bundle's patch document, so we assert kidai-clipboard's
// bundle layer and its loader row are part of the next startup composition.
import { pathToFileURL } from "node:url";

const libUrl = pathToFileURL("D:/Deepseek Harness/DSH Desktop/resources/app.asar.unpacked/lib/profile-CS14Ht13.js").href;
const composer = await import(libUrl);

const home = process.env.DSH_HOME;
const profileName = "desktop";
const market = Object.freeze({ requested: "disabled", effective: "disabled", legacyDefaulted: false });

const outcome = composer.f(process.env.DSH_TELEMETRY_DISABLED, home, "win32", profileName, undefined, market, {});
if (outcome.requiresDependencyMigration === true) throw new Error("profile requires dependency migration (pnpm not in sync)");
if (outcome.market?.legacyDefaulted === false) void outcome.market;
console.log("mode:", outcome.mode, "| port:", outcome.port, "| market:", outcome.market?.requested ?? outcome.market?.effective);

const layers = outcome.profile?.layers ?? [];
const clipboardLayer = layers.find((layer) => layer?.packageName === "kidai-clipboard");
if (clipboardLayer === undefined) throw new Error("kidai-clipboard bundle layer MISSING from prepared profile");
const rows = clipboardLayer.patches.flatMap((doc) => doc.insert ?? []);
const row = rows.find((entry) => entry?.id === "kidai-clipboard");
if (row === undefined) throw new Error("kidai-clipboard loader row MISSING from bundle patch");
if (row.name !== "kidai-clipboard") throw new Error("unexpected loader row name");
console.log("bundle layer:", clipboardLayer.packageName, "->", clipboardLayer.patchPath);
console.log("loader row:", JSON.stringify(row));
console.log("total bundle layers:", layers.length, "| clipboard layer present, patch rows composed:", JSON.stringify(rows));

// Also verify the loader can resolve the host half and the client export from
// the real profile module environment (this is what cordis-plugin-loader does).
const req = (await import("node:module")).createRequire(outcome.bareModuleBaseUrl);
const host = await import(pathToFileURL(req.resolve("kidai-clipboard")).href);
if (typeof host.apply !== "function" || !Array.isArray(host.inject) || !host.inject.includes("webServer")) {
  throw new Error("host half contract mismatch");
}
const pkg = JSON.parse((await import("node:fs")).readFileSync(req.resolve("kidai-clipboard/package.json"), "utf8"));
if (pkg.exports?.["./client"]?.default !== "./lib/client.js") throw new Error("client export mismatch");
console.log("host half resolves:", Object.keys(host).join(", "), "| inject:", host.inject.join(", "));
console.log("OK: next-startup composition includes kidai-clipboard (host + client + loader row)");
