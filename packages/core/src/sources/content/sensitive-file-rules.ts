/**
 * @file packages/core/src/sources/content/sensitive-file-rules.ts
 * Centralized deny rules for secret-bearing, credential, and private cryptographic key files.
 */

// Regex patterns for filenames that are strictly denied from raw content access
const SENSITIVE_FILENAME_PATTERNS: readonly RegExp[] = [
  /^\.env(\.[a-zA-Z0-9_-]+)?$/i,
  /\.(pem|key|pkcs12|p12|pfx|jks|keystore)$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)(\.[a-zA-Z0-9_-]+)?$/i,
  /^(credentials|secrets?|service-account)([._a-zA-Z0-9-]+)?\.(json|ya?ml|toml|ini)$/i,
  /^.*service[-_]account.*\.json$/i,
  /^.*firebase[-_]adminsdk.*\.json$/i,
];

/**
 * Checks if a given filename or path is flagged as sensitive / secret-bearing.
 */
export function isSensitiveFile(fileName: string): boolean {
  return SENSITIVE_FILENAME_PATTERNS.some(regex => regex.test(fileName));
}
