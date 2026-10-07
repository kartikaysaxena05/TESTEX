/**
 * @file packages/core/src/target-environments/target-auth-vault.ts
 * AES-256-GCM authenticated encryption vault for target authentication credentials (Phase 122).
 */

import crypto from 'node:crypto';
import { TargetEnvValidationError } from './target-env-errors.js';
import { SecretRedactor } from '../execution/sessions/secret-redactor.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;
const DEFAULT_KEY_SALT = 'ai-quality-target-auth-vault-salt-2026';

export interface ITargetAuthVault {
  encrypt(plainPassword: string, contextKey: string): Promise<string>;
  decrypt(encryptedPayload: string, contextKey: string): Promise<string>;
  maskPreview(plainPassword: string): string;
}

export class TargetAuthVault implements ITargetAuthVault {
  private readonly masterKey: Buffer;

  constructor(customKey?: string | Buffer) {
    if (customKey) {
      if (Buffer.isBuffer(customKey)) {
        if (customKey.length !== 32) {
          throw new TargetEnvValidationError('Custom encryption master key buffer must be exactly 32 bytes.');
        }
        this.masterKey = customKey;
      } else {
        this.masterKey = crypto.createHash('sha256').update(customKey).digest();
      }
    } else {
      const envKey = process.env.TARGET_VAULT_KEY ?? process.env.SESSION_SECRET ?? process.env.PLATFORM_SECRET_KEY;
      if (envKey && envKey.trim().length > 0) {
        this.masterKey = crypto.createHash('sha256').update(envKey.trim()).digest();
      } else {
        this.masterKey = crypto.createHash('sha256').update(DEFAULT_KEY_SALT).digest();
      }
    }
  }

  /**
   * Encrypts plaintext password or secret token using AES-256-GCM with contextKey bound as AAD.
   * Format: `v1:<iv_hex>:<auth_tag_hex>:<ciphertext_hex>`
   */
  public async encrypt(plainPassword: string, contextKey: string): Promise<string> {
    if (!plainPassword || typeof plainPassword !== 'string') {
      throw new TargetEnvValidationError('Cannot encrypt empty or invalid credential.');
    }

    // Register secret immediately to redact from any potential logging output
    SecretRedactor.registerSecret(plainPassword);

    const iv = crypto.randomBytes(IV_LENGTH_BYTES);
    const cipher = crypto.createCipheriv(ALGORITHM, this.masterKey, iv);

    if (contextKey) {
      cipher.setAAD(Buffer.from(contextKey, 'utf8'));
    }

    let encrypted = cipher.update(plainPassword, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return `v1:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypts an AES-256-GCM payload and verifies context integrity via AAD.
   */
  public async decrypt(encryptedPayload: string, contextKey: string): Promise<string> {
    if (!encryptedPayload || typeof encryptedPayload !== 'string') {
      throw new TargetEnvValidationError('Invalid encrypted payload format.');
    }

    const parts = encryptedPayload.split(':');
    if (parts.length !== 4 || parts[0] !== 'v1') {
      throw new TargetEnvValidationError('Unrecognized ciphertext format or version mismatch.');
    }

    const [, ivHex, authTagHex, ciphertextHex] = parts;
    if (!ivHex || !authTagHex || !ciphertextHex) {
      throw new TargetEnvValidationError('Invalid initialization vector, tag, or ciphertext.');
    }
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    if (iv.length !== IV_LENGTH_BYTES || authTag.length !== 16) {
      throw new TargetEnvValidationError('Invalid initialization vector or authentication tag length.');
    }

    try {
      const decipher = crypto.createDecipheriv(ALGORITHM, this.masterKey, iv);
      decipher.setAuthTag(authTag);

      if (contextKey) {
        decipher.setAAD(Buffer.from(contextKey, 'utf8'));
      }

      const decrypted = `${decipher.update(ciphertextHex, 'hex', 'utf8')}${decipher.final('utf8')}`;

      // Register decrypted secret with redactor
      SecretRedactor.registerSecret(decrypted);

      return decrypted;
    } catch {
      throw new TargetEnvValidationError('Authentication credential decryption failed: integrity check or key mismatch.');
    }
  }

  /**
   * Masks a credential for UI presentation without revealing the secret.
   */
  public maskPreview(plainPassword: string): string {
    if (!plainPassword || plainPassword.length === 0) {
      return '';
    }
    return '••••••••';
  }
}
