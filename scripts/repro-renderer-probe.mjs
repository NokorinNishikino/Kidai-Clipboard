// Real-Chromium renderer probe: loads the repro web app (kidai-clipboard
// ENABLED) in headless Edge/Chrome via puppeteer-core and reports console
// errors, page errors, failed requests and the booted DOM state.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const info = JSON.parse(fs.readFileSync(path.join(here, "probe-info.json"), "utf8"));
const req = createRequire("C:/Users/13971/.dsh/profiles/desktop/package.json");
const puppeteer = req("puppeteer-core");

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const executablePath = fs.existsSync(EDGE) ? EDGE : CHROME;

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
  timeout: 30_000,
});
const page = await browser.newPage();

const events = [];
page.on("console", (msg) => {
  const text = msg.text();
  events.push(`[console.${msg.type()}] ${text.slice(0, 400)}`);
});
page.on("pageerror", (err) => {
  events.push(`[pageerror] ${String((err && err.stack) || err).slice(0, 1600)}`);
});
page.on("requestfailed", (r) => {
  events.push(`[requestfailed] ${r.url().slice(0, 160)} :: ${r.failure()?.errorText}`);
});
page.on("response", (r) => {
  if (r.status() >= 400) events.push(`[http ${r.status()}] ${r.url().slice(0, 160)}`);
});

console.log("loading:", info.authUrl.slice(0, 120) + "...");
await page.evaluateOnNewDocument(() => {
  window.__pageErrs = [];
  window.addEventListener("error", (e) => {
    window.__pageErrs.push(String((e.error && e.error.stack) || e.message).slice(0, 2500));
  });
  window.addEventListener("unhandledrejection", (e) => {
    window.__pageErrs.push("REJ " + String((e.reason && e.reason.stack) || e.reason).slice(0, 2500));
  });
});
try {
  await page.goto(info.authUrl, { waitUntil: "networkidle2", timeout: 30_000 });
} catch (error) {
  events.push(`[goto] ${String(error && error.message).slice(0, 300)}`);
}
await new Promise((r) => setTimeout(r, 8000));

const state = await page.evaluate(() => {
  const text = (document.body?.innerText ?? "").slice(0, 600);
  return {
    title: document.title,
    hasModuleLoader: typeof window.__ModuleLoader__ !== "undefined",
    hasBoot: typeof window.__DSH_BOOT__ !== "undefined",
    bodyText: text,
    clipboardMarker: document.body ? document.body.innerText.includes("自动剪贴板") || document.body.innerText.includes("Clipboard") : false,
    kidaiMarker: document.body ? document.body.innerText.includes("Kidai") : false,
    pageErrors: (window.__pageErrs || []).slice(0, 10),
  };
}).catch((error) => ({ evalError: String(error && error.message).slice(0, 300) }));

console.log("STATE:", JSON.stringify(state, null, 2));
console.log("---- EVENTS ----");
for (const line of events.slice(0, 120)) console.log(line);
console.log("---- events total:", events.length, "----");
// Map the combo offset to the kidai-clipboard source line.
{
  const frame = events.find((e) => e.startsWith("[pageerror]") || e.includes("player")) ?? "";
  const urlMatch = /(http:\/\/127\.0\.0\.1:\d+\/plugins\/\?\?[^ \n]+?client\.js&rev=[0-9a-f]+):(\d+):(\d+)/.exec(String(state && (events.find((e) => e.includes("client.js")) ?? "") + " " + events.join(" ")));
  if (urlMatch) {
    try {
      const res = await fetch(urlMatch[1]);
      const text = await res.text();
      const lines = text.split("\n");
      const offset = Number(urlMatch[2]);
      const col = Number(urlMatch[3]);
      let start = -1;
      for (let i = 0; i < lines.length; i++) if (lines[i].includes("id: \"kidai-clipboard\"")) { start = i; break; }
      console.log("combo charset:", text.length, "| target line:", offset, "col:", col, "| kidai-clipboard starts at combo line:", start + 1);
      const localLine = offset - start;
      console.log("kidai-clipboard source line ~", localLine, ":", (lines[offset - 1] ?? "").slice(0, 160));
    } catch (error) {
      console.log("combo mapping failed:", String(error && error.message).slice(0, 200));
    }
  } else {
    console.log("no combo url captured");
  }
}

await browser.close();
console.log("probe done");
