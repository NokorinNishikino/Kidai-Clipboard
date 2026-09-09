// Headless boot repro for the kcb startup failure:
// composes the REAL desktop profile (kcb ENABLED) with the upstream web
// runtime (same loader/boot pipeline as the desktop host, minus the Electron
// shell) and boots it in-process, then reports every loader entry's fiber
// state — the failed entry and its exact error are the diagnosis.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DSH_LIB = "D:/Deepseek Harness/DSH Desktop/resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh/lib/profile-boot-BTzzdrGY.js";
const profBoot = await import(pathToFileURL(DSH_LIB).href);
const appBoot = await import(pathToFileURL("D:/Deepseek Harness/DSH Desktop/resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js").href);

const home = process.env.DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
const profileDir = path.join(home, "profiles", "desktop");
const rootConfig = path.join(profileDir, "cordis.yml");
const backup = rootConfig + ".repro-bak";
if (fs.existsSync(rootConfig)) fs.copyFileSync(rootConfig, backup);

// Replicates composeProfile("desktop", []) with exported primitives.
const profile = profBoot.i("desktop");
await appBoot.healProfilesModuleFallback({ installAnchor: "D:/Deepseek Harness/DSH Desktop/resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh/package.json", profile });
const homePatches = appBoot.loadOptionalPatches("dsh", profBoot.r()) ?? [];
const bundlePatches = profile.layers.flatMap((layer) => layer.patches);
const composedRows = appBoot.composeEntries([bundlePatches, profile.patches, homePatches, []]);
console.log("composed rows:", composedRows.length, "| kcb row:", JSON.stringify(composedRows.find((r) => r?.id === "kidai-clipboard")));

const allPatches = [
  ...bundlePatches,
  ...profile.patches,
  ...homePatches,
  // repro-only safety overrides: never open a browser.
  { id: "web-runtime", config: { openBrowser: false, printUrl: false } },
];
console.log("composed layers ok; patches:", allPatches.length);

function findRow(patch) {
  if (Array.isArray(patch?.insert)) return patch.insert.find((r) => r?.id === "kidai-clipboard");
  return patch?.id === "kidai-clipboard" ? patch : undefined;
}
const row = allPatches.map(findRow).find(Boolean);
console.log("kidai-clipboard row in patch stack:", JSON.stringify(row));

const { boot } = appBoot;

let ctx;
try {
  const provide = (hostCtx) => {
    hostCtx.provide("cmdlineArgs", { get: () => Object.freeze([]) });
    hostCtx.provide("appExit", async (code) => { process.exitCode = code; });
    hostCtx.provide("appReady", { onReady: () => () => {} });
  };
  ctx = await boot("dsh-repro", rootConfig, structuredClone(allPatches), provide, pathToFileURL(path.join(profileDir, "package.json")).href);
} catch (error) {
  console.error("BOOT FAILED:", error.message);
  console.error(error.stack);
  process.exitCode = 1;
  if (fs.existsSync(backup)) fs.copyFileSync(backup, rootConfig);
  process.exit(1);
}

// Inspect loader entries
const loader = ctx.get("loader");
const FIBER = { 0: "pending", 1: "loading", 2: "active", 3: "failed", 4: "disposed", 5: "unloading" };
const entries = loader ? [...loader.entries()] : [];
console.log("loader entries:", entries.length);
for (const entry of entries) {
  if (entry.id === "kidai-clipboard" || entry.fiber?.state === 3 || (entry.options?.group && false)) {
    const state = entry.fiber === undefined ? "?" : FIBER[entry.fiber.state] ?? entry.fiber.state;
    const err = entry.fiber?.error ?? entry.lastError;
    console.log(`[${state}] ${entry.id}  name=${entry.options?.name ?? ""}${err ? "  ERROR: " + String(err.message ?? err).slice(0, 600) : ""}`);
  }
}
const kcb = entries.find((e) => e.id === "kidai-clipboard");
console.log("kidai-clipboard fiber:", kcb?.fiber === undefined ? "?" : FIBER[kcb.fiber.state]);

// Probe the plugin's host route through the mounted tree if possible
try {
  const ws = ctx.get("webServer");
  console.log("webServer present:", ws !== undefined, "port:", ws?.port);
} catch {
  console.log("webServer not inspectable");
}

await ctx.fiber.dispose();
if (fs.existsSync(backup)) fs.copyFileSync(backup, rootConfig);
console.log("repro finished; root config restored");
