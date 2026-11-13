// AES-256-GCM encryption for SetupBot Pro master export (spec GLOBAL RULES:
// "Encrypt ALL secrets at rest using AES-256-GCM").
// Key source: env SETUPBOT_ENC_KEY (hex/utf-8, >= 32 chars) — otherwise a key
// is auto-generated once and persisted to db/.setupbot-key (0600).

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

let cachedKey: Buffer | null = null;

function loadKey(): Buffer {
  if (cachedKey) return cachedKey;

  const envKey = process.env.SETUPBOT_ENC_KEY;
  if (envKey && envKey.length >= 32) {
    cachedKey = crypto.createHash('sha256').update(envKey).digest();
    return cachedKey;
  }

  // Persisted fallback key
  const keyPath = path.join(process.cwd(), 'db', '.setupbot-key');
  try {
    if (fs.existsSync(keyPath)) {
      cachedKey = Buffer.from(fs.readFileSync(keyPath, 'utf8').trim(), 'hex');
      if (cachedKey.length === 32) return cachedKey;
    }
  } catch { /* fall through to regenerate */ }

  const fresh = crypto.randomBytes(32);
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  fs.writeFileSync(keyPath, fresh.toString('hex'), { mode: 0o600 });
  cachedKey = fresh;
  return cachedKey;
}

/** Encrypt plaintext → "v1:<iv>.<tag>.<ciphertext>" (all base64url) */
export function encryptSecret(plain: string): string {
  if (!plain) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', loadKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64url')}.${tag.toString('base64url')}.${ct.toString('base64url')}`;
}

/** Decrypt an encryptSecret() output (returns '' for empty/garbage) */
export function decryptSecret(payload: string): string {
  try {
    if (!payload.startsWith('v1:')) return '';
    const [ivB, tagB, ctB] = payload.slice(3).split('.');
    if (!ivB || !tagB || !ctB) return '';
    const decipher = crypto.createDecipheriv('aes-256-gcm', loadKey(), Buffer.from(ivB, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ctB, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

/** Spec masking: first 4 + last 4, e.g. "EAAB...x7Kq" */
export function maskValue(v: string): string {
  if (!v) return '';
  if (v.length <= 8) return v.slice(0, 2) + '…' + v.slice(-2);
  return `${v.slice(0, 4)}…${v.slice(-4)}`;
}
