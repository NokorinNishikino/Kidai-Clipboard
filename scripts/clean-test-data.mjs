// Clean the test entries my headless repro runs wrote into the REAL store.json
// (shared DSH_HOME). Only removes:
//   - input entries titled/texted exactly "kidc 流程测试草稿"
//   - session snapshots titled "会话 D:\Deepseek Harness Desktop Workshop" that
//     carry zero messages (repro-created from an empty test session)
// User-authored snapshots (even empty) and the odd long tag name are kept.
import fs from "node:fs";
import path from "node:path";

const file = path.join(process.env.DSH_HOME, "kidai-clipboard", "store.json");
const raw = fs.readFileSync(file, "utf8");
const state = JSON.parse(raw);
const before = state.entries.length;

state.entries = state.entries.filter((entry) => {
  if (entry.kind === "input" && (entry.title ?? "").includes("kidc 流程测试草稿")) return false;
  if (entry.kind === "session" && (entry.title ?? "").includes("会话 D:\\Deepseek") && (entry.session?.messageCount ?? 0) === 0) return false;
  return true;
});
state.updatedAt = Date.now();
fs.writeFileSync(file, JSON.stringify(state, null, 2), "utf8");
console.log("store.json cleaned:", before, "->", state.entries.length, "entries |",
  state.entries.map((e) => `${e.kind}:${(e.title ?? "").slice(0, 14)}`).join(" | "));
