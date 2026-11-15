import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const PREFIX = 'v1:';

function vaultKey() {
  const configured = process.env.ALOAPI_VAULT_KEY;
  if (!configured || Buffer.byteLength(configured, 'utf8') < 32) {
    throw new Error('ALOAPI_VAULT_KEY_MISSING');
  }
  return createHash('sha256').update(configured, 'utf8').digest();
}

export function isVaultCiphertext(value) {
  return typeof value === 'string' && /^v1:[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]*$/.test(value);
}

export function encryptVaultValue(value, key = vaultKey()) {
  if (value === '') return '';
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptVaultValue(value, key = vaultKey()) {
  if (!isVaultCiphertext(value)) throw new Error('INVALID_VAULT_CIPHERTEXT');
  const [ivPart, tagPart, ciphertextPart] = value.slice(PREFIX.length).split('.');
  const iv = Buffer.from(ivPart, 'base64url');
  const tag = Buffer.from(tagPart, 'base64url');
  if (iv.length !== 12 || tag.length !== 16) throw new Error('INVALID_VAULT_CIPHERTEXT');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function constantTimeEqual(left, right) {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function maskSecret(value) {
  if (!value) return '';
  return value.length <= 4 ? '••••' : `••••••••${value.slice(-4)}`;
}

export function decodeLegacyStoredValue(value) {
  if (value.startsWith(PREFIX)) return { value: decryptVaultValue(value), wasPlaintext: false };
  return { value, wasPlaintext: true };
}
