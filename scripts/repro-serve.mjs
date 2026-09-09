// Serve variant of the headless boot repro: boots the real desktop profile
// (kidai-clipboard ENABLED) with the upstream web runtime, then keeps the web
// server alive for a real Chromium probe (repro-renderer-probe.mjs). Writes
// probe-info.json { port, authUrl } next to this script.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const DSH_LIB = "D:/Deepseek Harness/DSH Desktop/resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh/lib/profile-boot-BTzzdrGY.js";
const profBoot = await import(pathToFileURL(DSH_LIB).href);
const appBoot = await import(pathToFileURL("D:/Deepseek Harness/DSH Desktop/resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js").href);

// Keep the probe server alive: log async failures instead of dying.
process.on("unhandledRejection", (reason) => console.log("[repro-unhandledRejection]", String((reason && reason.message) ?? reason).slice(0, 500)));
process.on("uncaughtException", (error) => console.log("[repro-uncaughtException]", String((error && error.message) ?? error).slice(0, 500)));
process.on("SIGTERM", () => console.log("[repro-signal] SIGTERM at", new Date().toISOString()));
process.on("SIGINT", () => console.log("[repro-signal] SIGINT at", new Date().toISOString()));
process.on("exit", (code) => console.log("[repro-exit] code", code, "at", new Date().toISOString()));

const home = process.env.DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
const profileDir = path.join(home, "profiles", "desktop");
const rootConfig = path.join(profileDir, "cordis.yml");

const profile = profBoot.i("desktop");
await appBoot.healProfilesModuleFallback({ installAnchor: "D:/Deepseek Harness/DSH Desktop/resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh/package.json", profile });
const homePatches = appBoot.loadOptionalPatches("dsh", profBoot.r()) ?? [];
const bundlePatches = profile.layers.flatMap((layer) => layer.patches);
const rows = appBoot.composeEntries([bundlePatches, profile.patches, homePatches, []]);
console.log("composed rows:", rows.length, "| kcb:", JSON.stringify(rows.find((r) => r?.id === "kidai-clipboard")));

const allPatches = [
  ...bundlePatches,
  ...profile.patches,
  ...homePatches,
  { id: "web-runtime", config: { openBrowser: false, printUrl: false } },
];

let ctx;
try {
  const provide = (hostCtx) => {
    hostCtx.provide("cmdlineArgs", { get: () => Object.freeze([]) });
    hostCtx.provide("appExit", async (code) => { process.exitCode = code; });
    hostCtx.provide("appReady", { onReady: () => () => {} });
  };
  ctx = await appBoot.boot("dsh-repro", rootConfig, structuredClone(allPatches), provide, pathToFileURL(path.join(profileDir, "package.json")).href);
} catch (error) {
  console.error("BOOT FAILED:", error.message);
  console.error(error.stack);
  process.exit(1);
}

const ws = ctx.get("webServer");
console.log("webServer port:", ws.port);
const base = `http://127.0.0.1:${ws.port}`;
const connection = ctx.get("connection");
const authUrl = connection ? connection.authenticatedUrl(base) : `${base}/`;
console.log("authUrl:", authUrl);
const infoFile = fileURLToPath(new URL("./probe-info.json", import.meta.url));
fs.writeFileSync(infoFile, JSON.stringify({ port: ws.port, authUrl }));
console.log("probe-info written:", infoFile, "at", new Date().toISOString());

process.on("exit", (code) => console.log("[repro-exit] code", code, "at", new Date().toISOString()));

// Hold the server until the probe signal file appears or 90s.
const stopFile = fileURLToPath(new URL("./probe-stop.flag", import.meta.url));
const deadline = Date.now() + 90_000;
let tick = 0;
while (Date.now() < deadline) {
  if (fs.existsSync(stopFile)) break;
  tick += 1;
  if (tick % 15 === 0) console.log("[repro-alive]", Math.round((deadline - Date.now()) / 1000), "s left");
  await new Promise((r) => setTimeout(r, 1000));
}
fs.rmSync(stopFile, { force: true });
await ctx.fiber.dispose();
console.log("serve done");
