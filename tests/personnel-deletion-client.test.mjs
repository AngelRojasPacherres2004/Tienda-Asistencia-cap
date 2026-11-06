import test from 'node:test';
import assert from 'node:assert/strict';
import { removePersonnel } from '../src/lib/personnelDeletion.js';

function server(deletion, verification) {
  const calls = [];
  return { calls, api: async (path, options) => {
    calls.push({ path, ...options });
    const result = options.method === 'DELETE' ? deletion : verification;
    if (result instanceof Error) throw result;
    return result;
  } };
}

test('solo una respuesta explícita y válida confirma el borrado', async () => {
  const s = server({ eliminado: true });
  assert.deepEqual(await removePersonnel(s.api, 299), { kind: 'deleted' });
  assert.equal(s.calls.length, 1);
});

test('el historial genera un aviso y no intenta verificar ni repetir la eliminación', async () => {
  const s = server({ eliminado: false, tiene_historial: true });
  assert.equal((await removePersonnel(s.api, 299)).kind, 'history');
  assert.equal(s.calls.length, 1);
});

for (const badPayload of [null, {}, { eliminado: 'true' }, { eliminado: true, tiene_historial: true }]) {
  test(`respuesta inválida ${JSON.stringify(badPayload)} se verifica antes de informar`, async () => {
    const s = server(badPayload, { existe: true });
    assert.equal((await removePersonnel(s.api, 299)).kind, 'retained');
    assert.equal(s.calls.length, 2);
    assert.equal(s.calls[1].cacheTtlMs, 0);
    assert.equal(s.calls.filter(call => call.method === 'DELETE').length, 1);
  });
}

test('respuesta perdida pero usuario ausente: informa su ausencia sin afirmar quién lo borró', async () => {
  const s = server(new TypeError('Failed to fetch'), { existe: false });
  assert.equal((await removePersonnel(s.api, 299)).kind, 'already_removed');
  assert.equal(s.calls.filter(call => call.method === 'DELETE').length, 1);
});

test('error de servidor ambiguo comprueba el estado', async () => {
  const s = server(Object.assign(new Error('Internal server error'), { status: 500 }), { existe: true });
  assert.equal((await removePersonnel(s.api, 299)).kind, 'retained');
});

test('sin conexión mantiene estado desconocido; la siguiente comprobación solo hace GET', async () => {
  const s = server(new Error('Timeout'), new TypeError('Failed to fetch'));
  assert.equal((await removePersonnel(s.api, 299)).kind, 'unknown');
  s.calls.length = 0;
  assert.equal((await removePersonnel(s.api, 299, { verifyOnly: true })).kind, 'unknown');
  assert.equal(s.calls.length, 1);
  assert.notEqual(s.calls[0].method, 'DELETE');
});

test('sesión expirada o permisos insuficientes no se disfrazan de éxito', async () => {
  for (const status of [400, 401, 403, 409, 422, 429]) {
    const s = server(Object.assign(new Error('Acción rechazada'), { status }));
    await assert.rejects(removePersonnel(s.api, 299), /Acción rechazada/);
    assert.equal(s.calls.length, 1);
  }
});

test('si pierde permisos durante la verificación conserva el resultado como desconocido', async () => {
  const s = server({}, Object.assign(new Error('Sesión expirada'), { status: 401 }));
  const result = await removePersonnel(s.api, 299);
  assert.equal(result.kind, 'unknown');
  assert.match(result.message, /Sesión expirada/);
});
