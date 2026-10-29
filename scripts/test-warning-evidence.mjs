import assert from 'node:assert/strict';
import { createOperationsDomain } from '../netlify/domains/operations.js';

let requestedFolder = '';
const supabase = {
  from: () => ({ select: () => ({ eq: () => ({ eq: (_key, store) => ({ maybeSingle: async () => ({ data: store === 1 ? { id: 12 } : null, error: null }) }) }) }) }),
  storage: { from: () => ({
    list: async folder => { requestedFolder = folder; return { data: [{ id: 'file', name: 'prueba.pdf' }], error: null }; },
    createSignedUrl: async path => ({ data: { signedUrl: `signed:${path}` }, error: null }),
  }) },
};
const domain = createOperationsDomain({ supabase, createSecurityDomain: () => ({}), httpError: (message, status) => Object.assign(new Error(message), { status }), dbError: error => error });
assert.deepEqual(await domain.warningEvidence(12, { rol: 'jefe_tienda', tienda_id: 1 }), { url: 'signed:1/amonestacion-12/prueba.pdf', nombre: 'prueba.pdf' });
assert.equal(requestedFolder, '1/amonestacion-12');
await assert.rejects(() => domain.warningEvidence(12, { rol: 'jefe_tienda', tienda_id: 2 }), error => error.status === 404);
console.log('La evidencia se limita a la tienda y amonestación autorizadas.');
