import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function worker() {
  const events = new Map(),
    entries = new Map(),
    removed = [],
    fetched = [],
    installed = [];
  const code = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
  const cache = {
    addAll: async (requests) => {
      for (const request of requests) {
        installed.push(request);
        entries.set(
          new URL(request.url).pathname,
          new Response("release-one:" + new URL(request.url).pathname),
        );
      }
    },
    match: async (path) => entries.get(path)?.clone(),
  };
  vm.runInNewContext(code, {
    self: {
      location: { origin: "https://pos.test" },
      clients: { claim: async () => {} },
      addEventListener: (name, handler) => events.set(name, handler),
      skipWaiting: () => {},
    },
    caches: {
      open: async () => cache,
      keys: async () => ["unrelated-cache", "gin-jia-pos-old"],
      delete: async (key) => removed.push(key),
    },
    URL,
    Request: class extends Request {
      constructor(path, options) {
        super(new URL(path, "https://pos.test"), options);
      }
    },
    fetch: async (request) => {
      fetched.push(request);
      return new Response("new-release");
    },
  });
  async function dispatch(name, properties = {}) {
    let result;
    events.get(name)({
      ...properties,
      waitUntil: (promise) => {
        result = promise;
      },
      respondWith: (promise) => {
        result = promise;
      },
    });
    return result;
  }
  return { dispatch, installed, removed, fetched };
}

test("worker installs the complete local release, including Rust and datepicker", async () => {
  const app = worker();
  await app.dispatch("install");
  const paths = app.installed.map((request) => new URL(request.url).pathname);
  assert.ok(paths.includes("/wasm/pos_domain_bg.wasm"));
  assert.ok(paths.includes("/vendor/air-datepicker.js"));
  assert.ok(app.installed.every((request) => request.cache === "reload"));
  await app.dispatch("activate");
  assert.deepEqual(app.removed, ["gin-jia-pos-old"]);
});

test("worker serves HTML, JS and Wasm from the same installed release", async () => {
  const app = worker();
  await app.dispatch("install");
  for (const path of ["/js/app.js", "/wasm/pos_domain_bg.wasm"]) {
    const response = await app.dispatch("fetch", {
      request: { method: "GET", url: "https://pos.test" + path, mode: "cors" },
    });
    assert.equal(await response.text(), "release-one:" + path);
  }
  const response = await app.dispatch("fetch", {
    request: { method: "GET", url: "https://pos.test/?section=search", mode: "navigate" },
  });
  assert.equal(await response.text(), "release-one:/index.html");
  assert.equal(app.fetched.length, 0);
});

test("worker never intercepts APIs, auth, cross-origin responses or mutations", async () => {
  const app = worker();
  for (const request of [
    { url: "https://pos.test/api/orders", method: "GET", mode: "cors" },
    { url: "https://pos.test/__/auth/handler", method: "GET", mode: "navigate" },
    { url: "https://external.test/js/app.js", method: "GET", mode: "cors" },
    { url: "https://pos.test/js/app.js", method: "POST", mode: "cors" },
    { url: "https://pos.test/__/firebase/init.json", method: "GET", mode: "cors" },
  ])
    assert.equal(await app.dispatch("fetch", { request }), undefined);
});
