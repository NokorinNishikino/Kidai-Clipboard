// All-in-one repro: boots the profile (kcb ENABLED), serves the page, and
// probes it with real Chromium INSIDE THE SAME PROCESS (no cross-process
// kill mystery). Prints page errors (full stacks) and DOM markers.
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

// Isolation: the repro shares the real $DSH_HOME; snapshot the clipboard store
// before the run and restore it afterwards so no test data leaks into the user's
// real clipboard.
const REAL_STORE = path.join(process.env.DSH_HOME, "kidai-clipboard", "store.json");
const STORE_BAK = REAL_STORE + ".repro-bak";
if (fs.existsSync(REAL_STORE)) fs.copyFileSync(REAL_STORE, STORE_BAK);

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
  hostCtx.provide("appExit", async (code) => { console.log("[repro-appExit]", code); });
  hostCtx.provide("appReady", { onReady: () => () => {} });
};
let ctx;
try {
  ctx = await appBoot.boot("dsh-repro", rootConfig, structuredClone(allPatches), provide, pathToFileURL(path.join(profileDir, "package.json")).href);
} catch (error) {
  console.error("BOOT FAILED:", error.message);
  console.error(error.stack);
  process.exit(1);
}
const ws = ctx.get("webServer");
const base = `http://127.0.0.1:${ws.port}`;
const authUrl = ctx.get("connection") ? ctx.get("connection").authenticatedUrl(base) : base + "/";
console.log("serving at", authUrl);

const req = createRequire("C:/Users/13971/.dsh/profiles/desktop/package.json");
const puppeteer = req("puppeteer-core");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const browser = await puppeteer.launch({ executablePath: fsExists(EDGE) ? EDGE : CHROME, headless: true, args: ["--no-sandbox", "--disable-gpu"], timeout: 30_000 });
function fsExists(p) { try { require("node:fs").accessSync(p); return true; } catch { return false; } }
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => {
  window.__pageErrs = [];
  window.addEventListener("error", (e) => window.__pageErrs.push(String((e.error && e.error.stack) || e.message).slice(0, 2500)));
  window.addEventListener("unhandledrejection", (e) => window.__pageErrs.push("REJ " + String((e.reason && e.reason.stack) || e.reason).slice(0, 2500)));
});
page.on("console", (m) => { const t = m.text(); if (t.includes("kidc") || m.type() === "error" || m.type() === "warning") console.log(`[page.${m.type()}] ${t.slice(0, 900)}`); });
page.on("pageerror", (e) => {
  const s = String((e && e.stack) || e);
  console.log("[pageerror-head]", s.slice(0, 260).replace(/\n/g, " ⏎ "));
  console.log("[pageerror-tail]", s.slice(-420));
});
try {
  await page.goto(authUrl, { waitUntil: "networkidle2", timeout: 30_000 });
} catch (error) {
  console.log("[goto]", String(error && error.message).slice(0, 300));
}
await new Promise((r) => setTimeout(r, 8000));
const state = await page.evaluate(() => ({
  title: document.title,
  hasBoot: typeof window.__DSH_BOOT__ !== "undefined",
  errs: (window.__pageErrs || []).slice(0, 8),
  comboUrls: performance.getEntriesByType("resource").map((r) => r.name).filter((u) => u.includes("/plugins/??")),
  clipboardLauncher: !!document.querySelector('[data-plugin="kidai-clipboard"], [aria-label="自动剪贴板"]'),
  kidcRoot: document.querySelectorAll(".kidc_root").length,
  kidcPanel: (document.querySelector(".kidc_panel")?.textContent ?? "").slice(0, 120),
  kidcTitle: document.querySelector(".kidc_title")?.textContent ?? null,
  sidebarClipboardText: document.body.innerText.includes("剪贴板") ? [...new Set([...document.body.innerText.matchAll(/[^\n]{0,10}剪贴板[^\n]{0,14}/g)].map((m) => m[0]))].slice(0, 5) : [],
  hubLauncher: document.querySelector('[aria-label="Kidai Hub"]') ? true : false,
})).catch((e) => ({ evalError: String(e && e.message).slice(0, 300) }));
console.log("STATE:", JSON.stringify({ title: state.title, hasBoot: state.hasBoot, errs: state.errs, combos: (state.comboUrls || []).length, clipboardLauncher: state.clipboardLauncher, kidcRoot: state.kidcRoot, kidcTitle: state.kidcTitle, kidcPanel: state.kidcPanel, sidebarClipboardText: state.sidebarClipboardText?.slice(0, 8), hubLauncher: state.hubLauncher }, null, 2));
if (state.comboUrls && state.comboUrls.length > 0) {
  for (const comboUrl of state.comboUrls) {
    try {
      const res = await fetch(comboUrl);
      const text = await res.text();
      const lines = text.split("\n");
      let start = -1;
      for (let i = 0; i < lines.length; i++) if (lines[i].includes("id: \"kidai-clipboard\"")) { start = i; break; }
      console.log("combo:", comboUrl.slice(0, 90), "... lines:", lines.length, "| kidai-clipboard @ comboline", start + 1);
      if (start >= 0) {
        // the binder: crash combo line 108963 col 25
        const target = 108963 - (start + 1) + 1;
        console.log("kidai-clipboard local line:", target, "->", (lines[108963 - 1] ?? "").slice(0, 200));
      }
    } catch (error) {
      console.log("combo fetch failed:", String((error && error.message) ?? error).slice(0, 120));
    }
  }
} else {
  console.log("no combo urls captured");
}

// Regression: no modal may render on startup, and the tag modal must open+close.
const startupModals = await page.evaluate(() => document.querySelectorAll(".kidc_modal").length);
console.log("[regression] modal count on startup:", startupModals, startupModals === 0 ? "(ok)" : "(FAIL)");
const opened = await page.evaluate(() => {
  const btn = [...document.querySelectorAll(".kidc_toolbar .kidc_ghost")].find((b) => (b.title || b.textContent || "").includes("标签"));
  if (!btn) return "no button";
  btn.click();
  return "clicked";
});
await new Promise((r) => setTimeout(r, 400));
const afterOpen = await page.evaluate(() => document.querySelectorAll(".kidc_modal").length);
console.log("[regression] after 管理标签 click (", opened, ") modals:", afterOpen, afterOpen === 1 ? "(ok)" : "(FAIL)");
const closed = await page.evaluate(() => {
  const x = document.querySelector(".kidc_modal .kidc_iconBtn");
  if (!x) return "no close btn";
  x.click();
  return "clicked";
});
await new Promise((r) => setTimeout(r, 400));
const afterClose = await page.evaluate(() => document.querySelectorAll(".kidc_modal").length);
console.log("[regression] after close click (", closed, ") modals:", afterClose, afterClose === 0 ? "(ok)" : "(FAIL)");

// ---- REAL SESSION FLOW: workspace -> composer -> save input -> save session ----
async function fetchState() {
  const res = await fetch(`${base}/kidai-clipboard/state`);
  const payload = await res.json();
  return payload.state;
}
const beforeState = await fetchState();
console.log("[flow] store before:", beforeState.entries.length, "entries");

// 1. open a session via the hero workspace row
const wsClicked = await page.evaluate(() => {
  const rows = [...document.querySelectorAll("button")].filter((b) => (b.textContent || "").includes("Deepseek Harness Desktop Workshop"));
  if (rows.length === 0) return "no workspace row";
  rows[0].click();
  return "clicked";
});
console.log("[flow] workspace click:", wsClicked);
await new Promise((r) => setTimeout(r, 6000));

// 2. type a draft into the composer
const composerState = await page.evaluate(() => ({
  hasComposer: !!document.querySelector('[data-composer-input]'),
  hasDraft: (document.querySelector('[data-composer-input]')?.textContent ?? "") !== "",
}));
console.log("[flow] composer:", JSON.stringify(composerState));
const typed = await page.evaluate(() => {
  const el = document.querySelector('[data-composer-input]');
  if (!el) return "no composer";
  el.focus();
  document.execCommand("insertText", false, "kidc 流程测试草稿");
  return "typed";
});
console.log("[flow] type:", typed);
await new Promise((r) => setTimeout(r, 800));

// 3. click 保存输入 (header + button)
const saved = await page.evaluate(() => {
  const btn = [...document.querySelectorAll(".kidc_header .kidc_iconBtn")][0];
  if (!btn) return "no save-input btn";
  btn.click();
  return "clicked";
});
await new Promise((r) => setTimeout(r, 1200));
const afterInput = await fetchState();
const inputEntries = afterInput.entries.filter((e) => e.kind === "input");
console.log("[flow] save input:", saved, "| entries now:", afterInput.entries.length);
console.log("[flow] input entries:", inputEntries.length, inputEntries.length > 0 ? JSON.stringify({ title: inputEntries[0].title, text: (inputEntries[0].text ?? "").slice(0, 30) }) : "");

// 4. click 保存会话 (archive icon)
const savedSession = await page.evaluate(() => {
  const btn = [...document.querySelectorAll(".kidc_header .kidc_iconBtn")][1];
  if (!btn) return "no save-session btn";
  btn.click();
  return "clicked";
});
console.log("[flow] save session clicked:", savedSession);
await new Promise((r) => setTimeout(r, 9000));
const afterSession = await fetchState();
const sessionEntries = afterSession.entries.filter((e) => e.kind === "session");
console.log("[flow] session entries:", sessionEntries.length, sessionEntries.length > 0 ? JSON.stringify({ title: sessionEntries[0].title, messages: sessionEntries[0].session?.messageCount, transcript: (sessionEntries[0].session?.transcript ?? "").slice(0, 60) }) : "");
const listCount = await page.evaluate(() => document.querySelectorAll(".kidc_card").length);
console.log("[flow] card count in list:", listCount);

// 5. collapse button -> pill; reopen; close -> hidden; launcher reopen
const pillTest = await page.evaluate(() => {
  const chev = [...document.querySelectorAll(".kidc_header .kidc_iconBtn")][2];
  if (!chev) return "no collapse btn";
  chev.click();
  return "clicked";
});
await new Promise((r) => setTimeout(r, 500));
const pillCount = await page.evaluate(() => document.querySelectorAll(".kidc_pill").length);
console.log("[flow] collapse (", pillTest, ") -> pill count:", pillCount, pillCount === 1 ? "(ok)" : "(FAIL)");
const pillClicked = await page.evaluate(() => { document.querySelector(".kidc_pill")?.click(); return "clicked"; });
await new Promise((r) => setTimeout(r, 500));
const panelBack = await page.evaluate(() => document.querySelectorAll(".kidc_panel").length);
console.log("[flow] pill click (", pillClicked, ") -> panel back:", panelBack, panelBack === 1 ? "(ok)" : "(FAIL)");
const closedBtn = await page.evaluate(() => {
  const btns = [...document.querySelectorAll(".kidc_header .kidc_iconBtn")];
  btns[btns.length - 1]?.click();
  return "clicked";
});
await new Promise((r) => setTimeout(r, 500));
const rootAfterClose = await page.evaluate(() => document.querySelectorAll(".kidc_root").length);
console.log("[flow] close btn (", closedBtn, ") -> root count:", rootAfterClose, rootAfterClose === 0 ? "(hidden by design, reopen via launcher)" : "(still shown)");
const reopened = await page.evaluate(() => {
  const l = document.querySelector('[aria-label="自动剪贴板"]');
  if (!l) return "no launcher";
  l.click();
  return "clicked";
});
await new Promise((r) => setTimeout(r, 500));
const rootAfterReopen = await page.evaluate(() => document.querySelectorAll(".kidc_root").length);
console.log("[flow] launcher (", reopened, ") -> root count:", rootAfterReopen, rootAfterReopen === 1 ? "(ok)" : "(FAIL)");

// ---- restart (脱离卡死) via the settings page / hub tab ----
const hubOpened = await page.evaluate(() => {
  const hub = document.querySelector('[aria-label="Kidai Hub"]');
  if (!hub) return "no hub launcher";
  hub.click();
  return "clicked";
});
await new Promise((r) => setTimeout(r, 800));
const tabClicked = await page.evaluate(() => {
  const tab = [...document.querySelectorAll(".kidh_tab")].find((b) => (b.textContent || "").includes("剪贴板设置"));
  if (!tab) return "no settings tab";
  tab.click();
  return "clicked";
});
await new Promise((r) => setTimeout(r, 800));
const restartBtn = await page.evaluate(() => {
  const btn = [...document.querySelectorAll(".kidc_setBtn")].find((b) => (b.textContent || "").includes("重启"));
  if (!btn) return "no restart btn";
  btn.click();
  return "clicked";
});
await new Promise((r) => setTimeout(r, 800));
const afterRestart = await page.evaluate(() => ({
  roots: document.querySelectorAll(".kidc_root").length,
  panels: document.querySelectorAll(".kidc_panel").length,
  notice: (document.querySelector(".kidc_notice")?.textContent ?? "").slice(0, 40),
}));
console.log("[flow] restart (", hubOpened, "/", tabClicked, "/", restartBtn, ") ->", JSON.stringify(afterRestart), afterRestart.roots === 1 && afterRestart.panels === 1 ? "(ok)" : "(FAIL)");

// ---- scenario 2: open the REAL long-history session (read-only) and capture it ----
const sessClicked = await page.evaluate(() => {
  const want = ["了解当前的dsh", "了解当前", "dsh和本地"];
  const btns = [...document.querySelectorAll("button")].filter((b) => {
    const txt = ((b.textContent || "") + " " + (b.title || "")).trim();
    return want.some((w) => txt.includes(w));
  });
  if (btns.length === 0) return "no session button found";
  btns[0].click();
  return "clicked: " + (btns[0].textContent || "").slice(0, 24).trim();
});
console.log("[s2] open real session:", sessClicked);
if (typeof sessClicked === "string" && sessClicked.startsWith("clicked")) {
  await new Promise((r) => setTimeout(r, 9000));
  const captured = await page.evaluate(() => {
    const btn = [...document.querySelectorAll(".kidc_header .kidc_iconBtn")][1];
    if (!btn) return "no save btn";
    btn.click();
    return "clicked";
  });
  console.log("[s2] save session on real history:", captured);
  await new Promise((r) => setTimeout(r, 16000));
  const after = await fetchState();
  const newest = after.entries.filter((e) => e.kind === "session").sort((a, b) => (b.session?.capturedAt ?? 0) - (a.session?.capturedAt ?? 0))[0];
  const ok = newest !== undefined && (newest.session?.messageCount ?? 0) > 0 && (newest.session?.transcript ?? "").length > 100;
  console.log("[s2] newest session snapshot:", JSON.stringify({ messages: newest?.session?.messageCount, chars: newest?.session?.chars, transcriptHead: (newest?.session?.transcript ?? "").slice(0, 80) }), ok ? "(ok)" : "(CHECK)");
}

await browser.close();
await ctx.fiber.dispose();
// Restore the real store (remove any test writes from this run).
if (fs.existsSync(STORE_BAK)) {
  fs.copyFileSync(STORE_BAK, REAL_STORE);
  fs.rmSync(STORE_BAK, { force: true });
  console.log("[isolate] store.json restored to pre-run state");
}
console.log("done");
