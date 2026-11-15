// Shared ESM implementation is also used by the offline, idempotent vault migration CLI.
export {
  isVaultCiphertext,
  encryptVaultValue,
  decryptVaultValue,
  constantTimeEqual,
  maskSecret,
  decodeLegacyStoredValue,
} from './vault-crypto-core.mjs';
