import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hashOperationalPassword,
  isOperationalPasswordHash,
  verifyOperationalPassword,
} from '../netlify/lib/operational-passwords.js';

test('hashes new operational passwords and verifies them', async () => {
  const hash = await hashOperationalPassword('Temporal-2026');
  assert.equal(isOperationalPasswordHash(hash), true);
  assert.equal((await verifyOperationalPassword(hash, 'Temporal-2026')).valid, true);
  assert.equal((await verifyOperationalPassword(hash, 'incorrecta')).valid, false);
});

test('recognizes a legacy literal only to perform a controlled upgrade', async () => {
  assert.deepEqual(await verifyOperationalPassword('legacy', 'legacy'), { valid: true, needsUpgrade: true });
  assert.deepEqual(await verifyOperationalPassword('legacy', 'otra'), { valid: false, needsUpgrade: false });
});

test('does not hash an existing bcrypt value twice', async () => {
  const hash = await hashOperationalPassword('Temporal-2026');
  assert.equal(await hashOperationalPassword(hash), hash);
});
