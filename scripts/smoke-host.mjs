// Functional smoke test for the host half: boots the plugin against a
// temporary DSH_HOME, drives the registered webServer handlers with fake
// req/res objects, and asserts the JSON API round-trips and sanitizes.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "kidc-host-test-"));
process.env.DSH_HOME = tmpHome;

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const mod = await import(pathToFileURL(path.join(root, "lib", "index.js")).href);

const routes = [];
const ctx = {
  webServer: {
    register: (entry) => {
      routes.push(entry);
      return () => {};
    },
  },
  effect: () => {},
};
mod.apply(ctx);

function makeRes() {
  const res = {
    _status: null,
    _headers: null,
    _body: "",
    writeHead(code, headers) { this._status = code; this._headers = headers; },
    end(body) { this._body = body; },
  };
  return res;
}
function makeReq(method, body) {
  const req = {
    method,
    _body: body,
    _dataCbs: [],
    _endCb: null,
    on: (ev, cb) => {
      if (ev === "data") req._dataCbs.push(cb);
      if (ev === "end") req._endCb = cb;
      if (ev === "error") req._onError = cb;
      return req;
    },
  };
  return req;
}
function pumpBody(req) {
  if (req._body !== undefined) {
    const chunk = Buffer.from(req._body);
    for (const cb of req._dataCbs) cb(chunk);
  }
  if (req._endCb) req._endCb();
}

const stateRoute = routes.find((r) => r.path === "/kidai-clipboard/state");
const pingRoute = routes.find((r) => r.path === "/kidai-clipboard/ping");
if (stateRoute === undefined || pingRoute === undefined) throw new Error("routes missing");

// 1. GET on empty store
{
  const res = makeRes();
  stateRoute.handler(makeReq("GET"), res);
  const payload = JSON.parse(res._body);
  if (payload.ok !== true || payload.state.schema !== 1) throw new Error("empty GET failed");
  console.log("ok: empty GET returns schema-1 state");
}

// 2. PUT a valid state
{
  const state = {
    schema: 1,
    updatedAt: 123,
    folders: [{ id: "f-1", name: "工作", color: "#5b8def", createdAt: 1 }],
    tags: [{ id: "t-1", name: "重要", color: "#e8a33d", createdAt: 2 }],
    entries: [
      {
        id: "e-1",
        kind: "input",
        title: "hi",
        text: "hello world",
        session: null,
        folderId: "f-1",
        tagIds: ["t-1", "missing-tag"],
        color: "#2e9e63",
        pinned: false,
        createdAt: 3,
        updatedAt: 4,
      },
      {
        id: "e-2",
        kind: "session",
        title: "会话快照",
        text: null,
        session: {
          sessionId: "session-abc",
          capturedAt: 5,
          lastSeq: 42,
          messageCount: 3,
          chars: 100,
          title: "会话快照",
          agentPreset: null,
          cwd: "D:/workspace",
          records: [{ type: "user/message", seq: 1, role: "user", content: [{ type: "text", text: "hi" }] }],
          transcript: "# 会话转录\n\n## 🧑 用户\nhi",
        },
        folderId: null,
        tagIds: [],
        color: null,
        pinned: true,
        createdAt: 6,
        updatedAt: 7,
      },
    ],
    settings: { window: { x: 10, y: 20, expanded: true }, ui: {} },
  };
  const res = makeRes();
  const req = makeReq("PUT", JSON.stringify({ state }));
  stateRoute.handler(req, res);
  pumpBody(req);
  const payload = JSON.parse(res._body);
  if (payload.ok !== true) throw new Error("PUT failed: " + JSON.stringify(payload));
  console.log("ok: PUT accepted");
}

// 3. GET back and verify sanitization (unknown tag stripped, folder kept)
{
  const res = makeRes();
  stateRoute.handler(makeReq("GET"), res);
  const payload = JSON.parse(res._body);
  const state = payload.state;
  if (state.entries.length !== 2) throw new Error("entry count mismatch");
  const input = state.entries.find((e) => e.id === "e-1");
  if (input.folderId !== "f-1") throw new Error("folderId lost");
  if (input.tagIds.length !== 1 || input.tagIds[0] !== "t-1") throw new Error("unknown tag not stripped: " + JSON.stringify(input.tagIds));
  if (state.folders.length !== 1 || state.tags.length !== 1) throw new Error("folder/tag mismatch");
  const session = state.entries.find((e) => e.id === "e-2");
  if (session.session === null || session.session.transcript === undefined) throw new Error("session payload lost");
  console.log("ok: GET round-trip with sanitization");

  // 4. stored file exists under temp DSH_HOME
  const file = path.join(tmpHome, "kidai-clipboard", "store.json");
  if (!fs.existsSync(file)) throw new Error("store.json not persisted");
  console.log("ok: store.json persisted at", file);
}

// 5. Reject junk
{
  const res = makeRes();
  const req = makeReq("PUT", JSON.stringify({ state: { schema: 99 } }));
  stateRoute.handler(req, res);
  pumpBody(req);
  const payload = JSON.parse(res._body);
  if (payload.ok !== false) throw new Error("invalid schema accepted");
  console.log("ok: junk schema rejected");
}

// 6. Ping
{
  const res = makeRes();
  pingRoute.handler(makeReq("GET"), res);
  const payload = JSON.parse(res._body);
  if (payload.ok !== true) throw new Error("ping failed");
  console.log("ok: ping responds");
}

// 7. Branch-point fields survive sanitization (atSeq / turnCount / totalTurns)
{
  const putRes = makeRes();
  const putReq = makeReq("PUT", JSON.stringify({
    state: {
      schema: 1,
      folders: [],
      tags: [],
      entries: [{
        id: "e-branch",
        kind: "session",
        title: "分支快照",
        text: null,
        session: {
          sessionId: "s-branch",
          capturedAt: 1,
          lastSeq: 7,
          atSeq: 7,
          turnCount: 2,
          totalTurns: 3,
          messageCount: 2,
          chars: 10,
          title: "分支快照",
          agentPreset: null,
          cwd: null,
          records: [],
          transcript: "abc",
        },
        folderId: null,
        tagIds: [],
        color: null,
        pinned: false,
        createdAt: 1,
        updatedAt: 1,
      }],
      settings: { window: null, ui: {} },
    },
  }));
  stateRoute.handler(putReq, putRes);
  pumpBody(putReq);
  if (JSON.parse(putRes._body).ok !== true) throw new Error("branch PUT rejected: " + putRes._body.slice(0, 200));

  const res = makeRes();
  stateRoute.handler(makeReq("GET"), res);
  const entry = JSON.parse(res._body).state.entries.find((e) => e.id === "e-branch");
  if (entry === undefined) throw new Error("branch entry lost");
  if (entry.session.atSeq !== 7) throw new Error("atSeq lost: " + String(entry.session.atSeq));
  if (entry.session.turnCount !== 2) throw new Error("turnCount lost: " + String(entry.session.turnCount));
  if (entry.session.totalTurns !== 3) throw new Error("totalTurns lost: " + String(entry.session.totalTurns));
  console.log("ok: branch-point fields round-trip (atSeq/turnCount/totalTurns)");
}

fs.rmSync(tmpHome, { recursive: true, force: true });
console.log("ALL HOST SMOKE TESTS PASSED");
