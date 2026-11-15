import {
  constants,
  createPrivateKey,
  generateKeyPairSync,
  privateDecrypt,
  pbkdf2 as pbkdf2Callback,
  randomBytes,
} from 'node:crypto';
import { promisify } from 'node:util';
import { db } from '@/lib/db';
import { decryptVaultValue, encryptVaultValue } from '@/lib/security/vault-crypto';

const KEY_TTL_MS = 2 * 60_000;
const PBKDF2_ITERATIONS = 600_000;
const MAX_ACTIVE_KEYS = 128;
const pbkdf2 = promisify(pbkdf2Callback);

export interface CredentialTransferEnvelope {
  keyId: string;
  wrappedPassphrase: string;
  salt: string;
  iv: string;
  ciphertext: string;
}

function decodeBase64Url(value: unknown, minBytes: number, maxBytes: number): Buffer {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('INVALID_CREDENTIAL_TRANSFER');
  const buffer = Buffer.from(value, 'base64url');
  if (buffer.length < minBytes || buffer.length > maxBytes || buffer.toString('base64url') !== value) {
    throw new Error('INVALID_CREDENTIAL_TRANSFER');
  }
  return buffer;
}

/**
 * Issue a short-lived public key. Its private part is encrypted with the shared
 * ALOAPI vault key and stored in the database, so any worker can consume it.
 * A per-process Map is deliberately avoided: it breaks behind load balancers,
 * serverless routing, and process restarts.
 */
export async function issueCredentialTransferKey(): Promise<{ keyId: string; publicKey: string; expiresInSeconds: number }> {
  const now = new Date();
  await db.credentialTransferKey.deleteMany({ where: { expiresAt: { lte: now } } });
  const activeCount = await db.credentialTransferKey.count({ where: { expiresAt: { gt: now } } });
  if (activeCount >= MAX_ACTIVE_KEYS) throw new Error('CREDENTIAL_TRANSFER_KEY_LIMIT');

  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicExponent: 0x10001,
  });
  const keyId = randomBytes(18).toString('base64url');
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const privateKeyCiphertext = encryptVaultValue(privateKeyPem);
  const expiresAt = new Date(now.getTime() + KEY_TTL_MS);

  await db.credentialTransferKey.create({
    data: { id: keyId, privateKeyCiphertext, expiresAt },
  });

  return {
    keyId,
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    expiresInSeconds: KEY_TTL_MS / 1000,
  };
}

/** Decrypts a browser-created AES-GCM envelope; caller must immediately re-encrypt at rest. */
export async function decryptCredentialTransfer(input: unknown): Promise<string> {
  if (!input || typeof input !== 'object') throw new Error('INVALID_CREDENTIAL_TRANSFER');
  const envelope = input as Partial<CredentialTransferEnvelope>;
  if (typeof envelope.keyId !== 'string' || !/^[A-Za-z0-9_-]{24}$/.test(envelope.keyId)) {
    throw new Error('INVALID_CREDENTIAL_TRANSFER');
  }

  const now = new Date();
  const record = await db.credentialTransferKey.findUnique({ where: { id: envelope.keyId } });
  if (!record || record.expiresAt <= now) {
    if (record) await db.credentialTransferKey.deleteMany({ where: { id: record.id } });
    throw new Error('CREDENTIAL_TRANSFER_KEY_EXPIRED');
  }

  // Conditional deletion makes the key one-use across workers: concurrent
  // requests may read the row, but only one can atomically claim it.
  const claimed = await db.credentialTransferKey.deleteMany({
    where: { id: record.id, expiresAt: { gt: now } },
  });
  if (claimed.count !== 1) throw new Error('CREDENTIAL_TRANSFER_KEY_EXPIRED');

  let privateKeyBytes: Buffer | undefined;
  let passphraseBytes: Buffer | undefined;
  let aesKey: Buffer | undefined;
  let plaintext: Buffer | undefined;
  try {
    const wrappedPassphrase = decodeBase64Url(envelope.wrappedPassphrase, 1, 256);
    const salt = decodeBase64Url(envelope.salt, 16, 16);
    const iv = decodeBase64Url(envelope.iv, 12, 12);
    const ciphertext = decodeBase64Url(envelope.ciphertext, 17, 24_000);
    const pem = decryptVaultValue(record.privateKeyCiphertext);
    privateKeyBytes = Buffer.from(pem, 'utf8');
    const decryptedPassphrase = privateDecrypt({
      key: createPrivateKey(privateKeyBytes),
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    }, wrappedPassphrase);
    passphraseBytes = decryptedPassphrase;
    if (passphraseBytes.length < 16 || passphraseBytes.length > 128) throw new Error('INVALID_CREDENTIAL_TRANSFER');
    const passphrase = new TextDecoder('utf-8', { fatal: true }).decode(passphraseBytes);
    aesKey = await pbkdf2(passphrase, salt, PBKDF2_ITERATIONS, 32, 'sha256') as Buffer;
    passphraseBytes.fill(0);
    const tag = ciphertext.subarray(ciphertext.length - 16);
    const encrypted = ciphertext.subarray(0, ciphertext.length - 16);
    const { createDecipheriv } = await import('node:crypto');
    const decipher = createDecipheriv('aes-256-gcm', aesKey, iv);
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    if (plaintext.length === 0 || plaintext.length > 16_384) throw new Error('INVALID_CREDENTIAL_TRANSFER');
    return new TextDecoder('utf-8', { fatal: true }).decode(plaintext);
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_CREDENTIAL_TRANSFER') throw error;
    throw new Error('INVALID_CREDENTIAL_TRANSFER');
  } finally {
    privateKeyBytes?.fill(0);
    passphraseBytes?.fill(0);
    aesKey?.fill(0);
    plaintext?.fill(0);
  }
}
