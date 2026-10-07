/**
 * @file packages/core/src/git-repositories/git-credential-vault.ts
 * AES-256-GCM authenticated encryption vault for Git credentials (tokens/passwords) with SecretRedactor integration.
 */

import crypto from 'node:crypto';
import { GitProviderAuthError } from './git-repository-errors.js';
import { SecretRedactor } from '../execution/sessions/secret-redactor.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12; // 96-bit IV standard for GCM
const DEFAULT_KEY_SALT = 'ai-quality-platform-git-vault-salt-2026';

export interface IGitCredentialVault {
  encrypt(plainToken: string, connectionId: string): Promise<string>;
  decrypt(encryptedPayload: string, connectionId: string): Promise<string>;
}

export class GitCredentialVault implements IGitCredentialVault {
  private readonly masterKey: Buffer;

  constructor(customKey?: string | Buffer) {
    if (customKey) {
      if (Buffer.isBuffer(customKey)) {
        if (customKey.length !== 32) {
          throw new GitProviderAuthError('Custom encryption master key buffer must be exactly 32 bytes.');
        }
        this.masterKey = customKey;
      } else {
        this.masterKey = crypto.createHash('sha256').update(customKey).digest();
      }
    } else {
      const envKey = process.env.GIT_VAULT_KEY ?? process.env.PLATFORM_SECRET_KEY;
      if (envKey && envKey.trim().length > 0) {
        this.masterKey = crypto.createHash('sha256').update(envKey.trim()).digest();
      } else {
        this.masterKey = crypto.createHash('sha256').update(DEFAULT_KEY_SALT).digest();
      }
    }
  }

  /**
   * Encrypts a plaintext API token or password using AES-256-GCM.
   * Format: `v1:<iv_hex>:<auth_tag_hex>:<ciphertext_hex>`
   */
  public async encrypt(plainToken: string, connectionId: string): Promise<string> {
    if (!plainToken || typeof plainToken !== 'string') {
      throw new GitProviderAuthError('Cannot encrypt empty or invalid credential.');
    }

    // Register secret immediately to redact from any potential logging output
    SecretRedactor.registerSecret(plainToken);

    const iv = crypto.randomBytes(IV_LENGTH_BYTES);
    const cipher = crypto.createCipheriv(ALGORITHM, this.masterKey, iv);

    // Bind connectionId as Associated Authenticated Data (AAD) to prevent ciphertext reuse across connections
    if (connectionId) {
      cipher.setAAD(Buffer.from(connectionId, 'utf8'));
    }

    const encrypted = Buffer.concat([cipher.update(plainToken, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return `v1:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  /**
   * Decrypts an AES-256-GCM payload and registers the resulting plaintext token with SecretRedactor.
   */
  public async decrypt(encryptedPayload: string, connectionId: string): Promise<string> {
    if (!encryptedPayload || typeof encryptedPayload !== 'string') {
      throw new GitProviderAuthError('Cannot decrypt empty or invalid payload.');
    }

    const parts = encryptedPayload.split(':');
    if (parts.length !== 4 || parts[0] !== 'v1') {
      throw new GitProviderAuthError(
        'Invalid encrypted credential envelope. Expected v1:<iv>:<tag>:<ciphertext>.',
      );
    }

    const [, ivHex, tagHex, cipherHex] = parts;
    if (!ivHex || !tagHex || !cipherHex) {
      throw new GitProviderAuthError('Encrypted credential envelope contains empty segments.');
    }

    try {
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(tagHex, 'hex');
      const ciphertext = Buffer.from(cipherHex, 'hex');

      const decipher = crypto.createDecipheriv(ALGORITHM, this.masterKey, iv);

      if (connectionId) {
        decipher.setAAD(Buffer.from(connectionId, 'utf8'));
      }

      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');

      // Re-register decrypted token with SecretRedactor
      SecretRedactor.registerSecret(decrypted);

      return decrypted;
    } catch (err: unknown) {
      if (err instanceof GitProviderAuthError) {
        throw err;
      }
      throw new GitProviderAuthError(
        `Failed to decrypt credentials: ${err instanceof Error ? err.message : 'Authentication tag verification failed'}`,
      );
    }
  }
}
