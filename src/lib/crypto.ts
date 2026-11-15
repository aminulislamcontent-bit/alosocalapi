// Compatibility wrappers for the existing SetupBot code. Secret encryption is
// now backed only by the operator-provided ALOAPI_VAULT_KEY; there is no silent
// filesystem-generated fallback key.
import { decryptVaultValue, encryptVaultValue, maskSecret } from './security/vault-crypto';

export function encryptSecret(plain: string): string {
  return encryptVaultValue(plain);
}

export function decryptSecret(payload: string): string {
  try {
    return decryptVaultValue(payload);
  } catch {
    return '';
  }
}

export function maskValue(value: string): string {
  return maskSecret(value);
}
