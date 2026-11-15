'use client';

export interface CredentialTransferEnvelope {
  keyId: string;
  wrappedPassphrase: string;
  salt: string;
  iv: string;
  ciphertext: string;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function pemToBytes(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, '');
  const binary = atob(body);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

/**
 * Encrypts a credential in the browser using a user-selected transfer passphrase.
 * The passphrase is only ever wrapped to the short-lived server public key; it
 * is not written to browser storage or sent as plaintext in the request body.
 */
export async function encryptCredentialForTransfer(value: string, passphrase: string): Promise<CredentialTransferEnvelope> {
  if (!window.crypto?.subtle) throw new Error('This browser does not support secure credential transfer.');
  const passphraseBytes = new TextEncoder().encode(passphrase);
  if (passphraseBytes.length < 16 || passphraseBytes.length > 128) {
    throw new Error('Choose a unique transfer passphrase between 16 and 128 UTF-8 bytes. Do not use your provider password.');
  }
  const valueBytes = new TextEncoder().encode(value);
  if (!valueBytes.length || valueBytes.length > 16_384) throw new Error('Credential value must be between 1 and 16,384 UTF-8 bytes.');

  try {
    const keyResponse = await fetch('/api/security/credential-transfer-key', { method: 'POST', cache: 'no-store', credentials: 'same-origin' });
    const keyData = await keyResponse.json();
    if (!keyResponse.ok || typeof keyData.keyId !== 'string' || typeof keyData.publicKey !== 'string') {
      throw new Error(keyData.error ?? 'Could not initialize secure credential transfer.');
    }

    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const passphraseKey = await window.crypto.subtle.importKey('raw', passphraseBytes, 'PBKDF2', false, ['deriveKey']);
    const aesKey = await window.crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 600_000, hash: 'SHA-256' },
      passphraseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt'],
    );
    const encrypted = new Uint8Array(await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, aesKey, valueBytes));
    const publicKey = await window.crypto.subtle.importKey(
      'spki', pemToBytes(keyData.publicKey), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt'],
    );
    const wrappedPassphrase = new Uint8Array(await window.crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, passphraseBytes));

    return {
      keyId: keyData.keyId,
      wrappedPassphrase: toBase64Url(wrappedPassphrase),
      salt: toBase64Url(salt),
      iv: toBase64Url(iv),
      ciphertext: toBase64Url(encrypted),
    };
  } finally {
    passphraseBytes.fill(0);
    valueBytes.fill(0);
  }
}
