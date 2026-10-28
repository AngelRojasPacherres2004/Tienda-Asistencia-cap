import { timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';

const BCRYPT_PATTERN = /^\$2[aby]\$\d{2}\$/;

export function isOperationalPasswordHash(value) {
  return BCRYPT_PATTERN.test(String(value || ''));
}

export async function hashOperationalPassword(value) {
  if (value == null || value === '') return null;
  const password = String(value);
  return isOperationalPasswordHash(password) ? password : bcrypt.hash(password, 12);
}

export async function verifyOperationalPassword(storedValue, suppliedValue) {
  const stored = String(storedValue || '');
  const supplied = String(suppliedValue || '');
  if (!stored || !supplied) return { valid: false, needsUpgrade: false };
  if (isOperationalPasswordHash(stored)) {
    return { valid: await bcrypt.compare(supplied, stored), needsUpgrade: false };
  }
  const left = Buffer.from(stored, 'utf8');
  const right = Buffer.from(supplied, 'utf8');
  const valid = left.length === right.length && timingSafeEqual(left, right);
  return { valid, needsUpgrade: valid };
}
