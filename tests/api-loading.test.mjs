import test from 'node:test';
import assert from 'node:assert/strict';
import { api, clearApiCache, setStoreContext } from '../src/lib/api.js';

const jsonResponse = (payload, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

test('agrupa consultas GET iguales mientras la primera sigue cargando', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    await new Promise(resolve => setTimeout(resolve, 20));
    return jsonResponse({ rows: [1, 2, 3] });
  };
  clearApiCache();
  setStoreContext(null);
  try {
    const [first, second] = await Promise.all([
      api('/catalogo', { cacheTtlMs: 0 }),
      api('/catalogo', { cacheTtlMs: 0 }),
    ]);
    assert.equal(calls, 1);
    assert.deepEqual(first, second);
  } finally {
    globalThis.fetch = originalFetch;
    clearApiCache();
  }
});

test('reutiliza lecturas recientes e invalida la caché después de una escritura', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, options = {}) => {
    calls += 1;
    return jsonResponse({ call: calls, method: options.method || 'GET' });
  };
  clearApiCache();
  setStoreContext(null);
  try {
    const first = await api('/tiendas');
    const cached = await api('/tiendas');
    assert.equal(calls, 1);
    assert.equal(cached.call, first.call);
    await api('/tiendas', { method: 'POST', body: { nombre: 'Nueva' } });
    const refreshed = await api('/tiendas');
    assert.equal(calls, 3);
    assert.notEqual(refreshed.call, first.call);
  } finally {
    globalThis.fetch = originalFetch;
    clearApiCache();
  }
});

test('reintenta una lectura ante un fallo transitorio del servidor', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return calls === 1 ? jsonResponse({ error: 'Temporal' }, 503) : jsonResponse({ ok: true });
  };
  clearApiCache();
  setStoreContext(null);
  try {
    assert.deepEqual(await api('/resumen', { cacheTtlMs: 0 }), { ok: true });
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    clearApiCache();
  }
});
