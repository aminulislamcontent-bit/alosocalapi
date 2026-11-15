import { decryptVaultValue, encryptVaultValue, isVaultCiphertext } from './vault-crypto';

export function storeCredentialValue(value: string): string {
  return value ? encryptVaultValue(value) : '';
}

/** Server-only: call only for an explicit verification or re-encryption operation. */
export function readCredentialValue(value: string): { plaintext: string; needsMigration: boolean } {
  if (!value) return { plaintext: '', needsMigration: false };
  if (isVaultCiphertext(value)) return { plaintext: decryptVaultValue(value), needsMigration: false };
  return { plaintext: value, needsMigration: true };
}

/** Safe metadata for API/UI responses; no value, prefix, suffix, or masked token is disclosed. */
export function credentialPresence(value: string): { hasValue: boolean; encryptedAtRest: boolean } {
  return { hasValue: value.length > 0, encryptedAtRest: !value || isVaultCiphertext(value) };
}
