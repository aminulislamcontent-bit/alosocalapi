// Shared ESM implementation is also used by the offline, idempotent vault migration CLI.
export {
  isVaultCiphertext,
  encryptVaultValue,
  decryptVaultValue,
  constantTimeEqual,
  maskSecret,
  decodeLegacyStoredValue,
} from './vault-crypto-core.mjs';

export function vaultConfigured(): boolean {
  const key = process.env.ALOAPI_VAULT_KEY ?? '';
  return Buffer.byteLength(key, 'utf8') >= 32;
}
