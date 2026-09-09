// Post-restart activation probe: mints the browser-session cookie exactly the
// way dsh-client-connection does (HMAC-SHA256 over base64url payload, secret
// from the browser-session credential record) and probes the kidai-clipboard
// endpoints. No writes to clipboard state — GET-only.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { createHash, createHmac } from "node:crypto";

const home = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
const host = process.env.DSH_PROBE_HOST || "127.0.0.1:43120";
const req = createRequire(path.join(home, "profiles", "desktop", "package.json"));
const yaml = req("yaml");

// --- read the browser-session signing secret ---
const creds = yaml.parse(fs.readFileSync(path.join(home, ".credentials.yaml"), "utf8"));
const record = creds.records?.["client-connection/browser-session"];
if (record === undefined || record.kind !== "grant") throw new Error("browser-session credential record not found");
const secretB64 = record.payload?.secret;
if (typeof secretB64 !== "string") throw new Error("browser-session secret missing");

function encodeBase64Url(bytes) {
  return Buffer.from(bytes).toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}
function decodeBase64Url(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  return Buffer.from(value.replaceAll("-", "+").replaceAll("_", "/") + padding, "base64");
}
const secret = decodeBase64Url(secretB64);
if (secret.byteLength !== 32) throw new Error("browser-session secret has unexpected length");

const authority = new URL(`http://${host}`).host;
const cookieName = "dsh-auth-" + encodeBase64Url(createHash("sha256").update(authority).digest());
const issuedAt = Date.now() - 1000;
const expiresAt = Date.now() + 30 * 60 * 1000;
const body = encodeBase64Url(Buffer.from(JSON.stringify({ version: 1, authority, issuedAt, expiresAt }), "utf8"));
const cookieValue = `v1.${body}.${encodeBase64Url(createHmac("sha256", secret).update(body).digest())}`;
const cookie = `${cookieName}=${cookieValue}`;

// --- probes ---
async function probe(label, url) {
  const res = await fetch(url, {
    method: "GET",
    headers: { Cookie: cookie, Host: host, Accept: "*/*" },
  });
  const text = await res.text();
  console.log(`[${res.status}] ${label}`);
  return { status: res.status, text };
}

console.log("authority:", authority, "| cookie name:", cookieName);
const ping = await probe("GET /kidai-clipboard/ping", `http://${host}/kidai-clipboard/ping`);
console.log("  body:", ping.text.slice(0, 200));

const state = await probe("GET /kidai-clipboard/state", `http://${host}/kidai-clipboard/state`);
console.log("  body:", state.text.slice(0, 300));

const client = await probe("GET /plugins/kidai-clipboard/client.js", `http://${host}/plugins/kidai-clipboard/client.js`);
const served = client.status === 200 && client.text.includes("__ModuleLoader__") && client.text.includes("kidai-clipboard");
console.log("  served:", served, "| bytes:", client.text.length);

const ok = ping.status === 200 && state.status === 200 && served;
console.log(ok ? "PROBE OK: kidai-clipboard is ACTIVE on the running server" : "PROBE FAILED: plugin not yet active (restart pending?)");
process.exitCode = ok ? 0 : 1;
