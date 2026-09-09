// Smoke-test the client half module contract without a browser:
// evaluate lib/client.js with a stubbed module table and assert the
// returned { apply, inject } contract and module-scope correctness.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(root, "lib", "client.js"), "utf8");

const noop = () => {};
const snapshot = { getSnapshot: () => ({}), subscribe: () => noop };
const storeHandle = {
  actions: {},
  getSnapshot: () => ({}),
  subscribe: () => noop,
  store: { update: () => {} },
  clearPersisted: noop,
};
const requireStub = (id) => {
  if (id === "react/jsx-runtime") {
    return { jsx: noop, jsxs: noop };
  }
  if (id === "react") {
    return {
      createContext: () => ({}),
      useState: noop,
      useEffect: noop,
      useRef: () => ({ current: null }),
      useCallback: noop,
      useMemo: noop,
      useContext: () => null,
      useSyncExternalStore: noop,
      forwardRef: noop,
      memo: noop,
      Component: class Component {},
    };
  }
  if (id === "@deepseek-ai/dsh-client-ui-primitives") {
    return new Proxy({}, { get: () => noop });
  }
  if (id === "@deepseek-ai/dsh-client-store") {
    return {
      defineStore: () => ({ create: () => storeHandle }),
      createSnapshotStore: () => snapshot,
    };
  }
  throw new Error("unexpected require: " + id);
};

let registered = null;
const sandbox = {
  window: {
    __ModuleLoader__: {
      load: (entry) => {
        registered = entry;
      },
    },
  },
  console,
  setTimeout,
  clearTimeout,
  crypto: globalThis.crypto,
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "client.js" });

if (registered === null) throw new Error("plugin did not register via window.__ModuleLoader__.load");
if (registered.id !== "kidai-clipboard") throw new Error(`unexpected id ${registered.id}`);
const moduleExports = registered.factory(requireStub);
if (typeof moduleExports.apply !== "function") throw new Error("apply is not a function");
if (!Array.isArray(moduleExports.inject)) throw new Error("inject is not an array");
const expected = ["slots", "locale", "sessions", "remote", "remote.session", "conversation"];
for (const name of expected) if (!moduleExports.inject.includes(name)) throw new Error(`inject missing ${name}`);
console.log("OK: client half contract verified");
console.log("inject:", moduleExports.inject.join(", "));
