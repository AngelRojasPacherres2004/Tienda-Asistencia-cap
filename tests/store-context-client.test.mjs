import test from "node:test";
import assert from "node:assert/strict";
import { api, downloadFile, lockStoreContext, setStoreContext } from "../src/lib/api.js";
import { consumeStoreNavigation, restartStoreNavigation } from "../src/lib/storeNavigation.js";

test("changing stores blocks the continuation of an old upload before it can save to either store", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  let finishUpload;
  globalThis.fetch = (url, init) => {
    requests.push({ url, store: init.headers["X-Store-Context"] });
    if (url.endsWith("/archivo")) return new Promise(resolve => { finishUpload = () => resolve(new Response(JSON.stringify({ path: "10/old-upload.pdf" }))); });
    return Promise.resolve(new Response("{}"));
  };
  try {
    setStoreContext({ rol: "jefe_tienda", tienda_id: 10 });
    const uploadThenSave = (async () => {
      const upload = await api("/mi-tienda-gestion/archivo", { method: "POST", body: { nombre: "old-upload.pdf" } });
      return api("/mi-tienda-gestion/documentos", { method: "POST", body: { archivo_path: upload.path } });
    })();
    lockStoreContext();
    await api("/auth/tienda", { method: "POST", body: { tienda_id: 20 } });
    finishUpload();
    await assert.rejects(uploadThenSave, /tienda está cambiando/);
    await assert.rejects(downloadFile("/api/reportes/personal/export.xlsx", "personal.xlsx"), /tienda está cambiando/);
    assert.deepEqual(requests, [{ url: "/api/mi-tienda-gestion/archivo", store: "10" }, { url: "/api/auth/tienda", store: "10" }]);
    // A fresh page initializes the next context; no old form survives that navigation.
    setStoreContext({ rol: "jefe_tienda", tienda_id: 20 });
    await api("/usuarios");
    assert.equal(requests.at(-1).store, "20");
  } finally { globalThis.fetch = originalFetch; setStoreContext(null); }
});

test("a new store restores only the page for the same account and role, once, without keeping form data", () => {
  const originalWindow = globalThis.window, originalStorage = globalThis.sessionStorage;
  const values = new Map(); let reloads = 0;
  globalThis.sessionStorage = { setItem: (key, value) => values.set(key, value), getItem: key => values.get(key), removeItem: key => values.delete(key) };
  globalThis.window = { location: { reload: () => reloads++ } };
  const account = { id: 2, rol: "jefe_tienda" };
  try {
    restartStoreNavigation(account, "mi-tienda-gestion", "Acceso actualizado");
    assert.equal(reloads, 1);
    assert.deepEqual(consumeStoreNavigation(account), { id: 2, rol: "jefe_tienda", page: "mi-tienda-gestion", notice: "Acceso actualizado" });
    assert.equal(consumeStoreNavigation(account), null);
    restartStoreNavigation(account, "usuarios");
    assert.equal(consumeStoreNavigation({ id: 3, rol: "jefe_tienda" }), null);
    restartStoreNavigation(account, "usuarios");
    assert.equal(consumeStoreNavigation({ id: 2, rol: "vendedor" }), null);
  } finally { globalThis.window = originalWindow; globalThis.sessionStorage = originalStorage; }
});
