// Dual-entry behavior test for the settings page WITHOUT a browser:
// runs the real client apply(ctx) against a mini slot engine implementing the
// same contract as dsh-client-ui-slots (inject-on-declare, spec/subscribe,
// register/dispose), then asserts:
//   A) Hub absent  -> settings.section entry registered, hub tab absent;
//      Hub appearing later -> settings entry removed, hub tab registered.
//   B) Hub present from the start -> hub tab registered, no settings entry.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(root, "lib", "client.js"), "utf8");

// ---------- mini slot engine ----------
function createSlotEngine(knows) {
  const declared = new Map(knows.map((name) => [name, { kind: "list", scope: "root" }]));
  const pending = new Map();
  const entries = [];
  const listeners = new Set();
  const engine = {
    spec(name) {
      return declared.get(name);
    },
    getVersion(name) {
      let v = 0;
      for (const e of entries) if (e.name === name) v += 1;
      return v;
    },
    subscribe(name, cb) {
      listeners.add({ name, cb });
      return () => listeners.delete({ name, cb });
    },
    inject(name, fn) {
      if (declared.has(name)) {
        const dispose = fn();
        entries.push({ injectDisposer: dispose });
        return () => {
          dispose();
        };
      }
      if (!pending.has(name)) pending.set(name, []);
      pending.get(name).push(fn);
    },
    register(options, component) {
      const record = { name: options.name, options, component, disposed: false };
      entries.push(record);
      engine.records = engine.records ?? [];
      engine.records.push(record);
      for (const l of listeners) if (l.name === options.name) l.cb();
      return () => {
        record.disposed = true;
        const index = engine.records.indexOf(record);
        if (index >= 0) engine.records.splice(index, 1);
        for (const l of listeners) if (l.name === options.name) l.cb();
      };
    },
    records: [],
    declare(name) {
      declared.set(name, { kind: "list", scope: "root" });
      const waiters = pending.get(name) ?? [];
      pending.delete(name);
      for (const fn of waiters) {
        const dispose = fn();
        entries.push({ injectDisposer: dispose });
      }
      for (const l of listeners) if (l.name === name) l.cb();
    },
    entriesOf(name) {
      return engine.records.filter((r) => r.name === name && !r.disposed);
    },
  };
  return engine;
}

// ---------- stubs ----------
function makeStore(decl) {
  let state = decl.init();
  const actions = {};
  for (const key of Object.keys(decl.actions)) {
    actions[key] = (...params) => {
      const draft = structuredClone(state);
      decl.actions[key](draft, ...params);
      state = draft;
    };
  }
  return {
    actions,
    getSnapshot: () => state,
    subscribe: () => () => {},
    store: { update: (mutator) => { const draft = structuredClone(state); mutator(draft); state = draft; } },
    clearPersisted() {},
  };
}

function makeCtx(engine) {
  return {
    locale: {
      register: () => {},
      bind: () => (key, params) => key + (params ? ":" + JSON.stringify(params) : ""),
    },
    slots: engine,
    sessions: {
      list: { getSnapshot: () => ({ current: undefined, byId: {} }) },
      scope: () => null,
      binding: () => undefined,
      open: () => {},
      fork: async () => "child-id",
    },
    remote: { session: { follow: async function* () {}, page: async () => ({ ok: true, value: { records: [], hasMore: false } }) } },
    effect: () => () => {},
  };
}

function loadPlugin(engine) {
  const registered = { id: null, factory: null };
  const sandbox = {
    window: { __ModuleLoader__: { load: (entry) => { registered.id = entry.id; registered.factory = entry.factory; } }, addEventListener() {}, removeEventListener() {} },
    console,
    setTimeout,
    clearTimeout,
    crypto: globalThis.crypto,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    document: undefined,
    fetch: async () => { throw new Error("offline probe"); },
    navigator: {},
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: "client.js" });
  if (registered.id !== "kidai-clipboard") throw new Error("plugin did not register");
  const mod = registered.factory((id) => {
    if (id === "react/jsx-runtime") return { jsx: () => ({}), jsxs: () => ({}) };
    if (id === "react") {
      return {
        Component: class Component {},
        createContext: () => ({}),
        useState: () => [null, () => {}],
        useEffect: () => {},
        useRef: () => ({ current: null }),
        useCallback: () => {},
        useMemo: () => {},
        useContext: () => null,
        useSyncExternalStore: () => null,
      };
    }
    if (id === "@deepseek-ai/dsh-client-ui-primitives") return new Proxy({}, { get: () => () => {} });
    if (id === "@deepseek-ai/dsh-client-store") return { defineStore: (decl) => ({ create: () => makeStore(decl) }), createSnapshotStore: () => makeStore({ init: () => ({}), actions: {} }) };
    throw new Error("unexpected require " + id);
  });
  mod.apply(makeCtx(engine));
  return mod;
}

// ---------- scenario A: hub appears after mount ----------
{
  const engine = createSlotEngine(["sidebar.footer.action", "shell.overlay", "settings.section"]);
  loadPlugin(engine);
  const settingsEntries = engine.entriesOf("settings.section").filter((r) => r.options.id === "kidai-clipboard");
  const hubEntries = engine.entriesOf("kidai-hub.tabs");
  if (settingsEntries.length !== 1) throw new Error("A: settings.section entry expected without hub, got " + settingsEntries.length);
  if (hubEntries.length !== 0) throw new Error("A: hub tab must not exist without hub");
  console.log("A1 ok: hub absent -> settings.section entry registered");
  engine.declare("kidai-hub.tabs"); // simulate kidai-hub mounting
  const settingsAfter = engine.entriesOf("settings.section").filter((r) => r.options.id === "kidai-clipboard");
  const hubAfter = engine.entriesOf("kidai-hub.tabs").filter((r) => r.options.key === "kidai-clipboard");
  if (settingsAfter.length !== 0) throw new Error("A: settings entry must be removed when hub appears");
  if (hubAfter.length !== 1) throw new Error("A: hub tab entry expected after hub declares, got " + hubAfter.length);
  if (hubAfter[0].options.order !== 60) throw new Error("A: hub tab order mismatch");
  console.log("A2 ok: hub appears -> settings entry removed, hub tab registered (key kidai-clipboard, order 60)");
}

// ---------- scenario B: hub present from the start ----------
{
  const engine = createSlotEngine(["sidebar.footer.action", "shell.overlay", "settings.section", "kidai-hub.tabs"]);
  loadPlugin(engine);
  const settingsEntries = engine.entriesOf("settings.section").filter((r) => r.options.id === "kidai-clipboard");
  const hubEntries = engine.entriesOf("kidai-hub.tabs").filter((r) => r.options.key === "kidai-clipboard");
  if (hubEntries.length !== 1) throw new Error("B: hub tab expected, got " + hubEntries.length);
  if (settingsEntries.length !== 0) throw new Error("B: settings section must NOT register when hub present");
  // floating window + launcher must also be registered
  const overlay = engine.entriesOf("shell.overlay").filter((r) => r.options.id === "kidai-clipboard");
  const launcher = engine.entriesOf("sidebar.footer.action").filter((r) => r.options.id === "kidai-clipboard");
  if (overlay.length !== 1 || launcher.length !== 1) throw new Error("B: overlay/launcher registration mismatch");
  console.log("B ok: hub from start -> hub tab + overlay + launcher; no settings duplicate");
}

console.log("SLOT CONTRACT TESTS PASSED");
