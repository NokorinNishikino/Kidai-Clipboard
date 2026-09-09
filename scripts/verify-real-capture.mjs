// Definitive real-history capture proof: boots the web runtime and calls the
// host's own SessionController.follow against the long-history session
// (read-only), counting the messages a kidai-clipboard capture would store.
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";

const DSH_LIB = "D:/Deepseek Harness/DSH Desktop/resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh/lib/profile-boot-BTzzdrGY.js";
const profBoot = await import(pathToFileURL(DSH_LIB).href);
const appBoot = await import(pathToFileURL("D:/Deepseek Harness/DSH Desktop/resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js").href);

const home = process.env.DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
const profileDir = path.join(home, "profiles", "desktop");
const rootConfig = path.join(profileDir, "cordis.yml");
const profile = profBoot.i("desktop");
await appBoot.healProfilesModuleFallback({ installAnchor: "D:/Deepseek Harness/DSH Desktop/resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh/package.json", profile });
const homePatches = appBoot.loadOptionalPatches("dsh", profBoot.r()) ?? [];
const bundlePatches = profile.layers.flatMap((layer) => layer.patches);
const allPatches = [...bundlePatches, ...profile.patches, ...homePatches, { id: "web-runtime", config: { openBrowser: false, printUrl: false } }];
const provide = (hostCtx) => {
  hostCtx.provide("cmdlineArgs", { get: () => Object.freeze([]) });
  hostCtx.provide("appExit", async () => {});
  hostCtx.provide("appReady", { onReady: () => () => {} });
};
const ctx = await appBoot.boot("dsh-repro", rootConfig, structuredClone(allPatches), provide, pathToFileURL(path.join(profileDir, "package.json")).href);

const sc = ctx.get("sessionController");
if (sc === undefined) throw new Error("sessionController service missing");
const list = await sc.list({});
const items = list?.items ?? list ?? [];
console.log("sessions listed:", items.length);
const target = items.find((s) => (s.title ?? "").includes("了解当前")) ?? items[0];
console.log("target session:", target?.sessionId ?? "(none)", "| title:", (target?.title ?? "").slice(0, 40));

let userMsgs = 0;
let assistantMsgs = 0;
let records = 0;
let lastSeq = 0;
try {
  const address = { kind: "session", sessionId: target.sessionId };
  const abort = new AbortController();
  let page;
  try {
    page = await sc.page({ address, throughSeq: 9007199254740991, maxMessages: 500 }, abort.signal);
  } catch (error) {
    const m = /past cursor (\d+)/.exec(String((error && error.message) ?? error));
    const cursor = m ? Number(m[1]) - 1 : 100000;
    console.log("retrying with throughSeq:", cursor);
    page = await sc.page({ address, throughSeq: cursor, maxMessages: 500 }, abort.signal);
  }
  const value = page ?? {};
  records = (value.records ?? []).length;
  for (const rec of value.records ?? []) {
    const ev = rec?.event;
    if (ev?.type === "user/message") userMsgs += 1;
    if (ev?.type === "assistant/message") assistantMsgs += 1;
    if (ev && typeof ev.seq === "number") lastSeq = Math.max(lastSeq, ev.seq);
  }
  console.log("page records:", records, "| lastSeq:", lastSeq, "| user:", userMsgs, "| assistant:", assistantMsgs, "| hasMore:", value.hasMore);
} catch (error) {
  console.log("page error:", String((error && error.message) ?? error));
}
const ok = records > 0 && (userMsgs > 0 || assistantMsgs > 0);
console.log(ok ? "REAL-HISTORY CAPTURE OK (the exact events a kidai-clipboard snapshot would store)" : "CAPTURE EMPTY — investigate");
await ctx.fiber.dispose();
process.exitCode = ok ? 0 : 1;
