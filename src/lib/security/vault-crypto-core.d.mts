export function isVaultCiphertext(value: string): boolean;
export function encryptVaultValue(value: string, key?: Uint8Array): string;
export function decryptVaultValue(value: string, key?: Uint8Array): string;
export function constantTimeEqual(left: string, right: string): boolean;
export function maskSecret(value: string): string;
export function decodeLegacyStoredValue(value: string): { value: string; wasPlaintext: boolean };
