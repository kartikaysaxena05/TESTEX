/**
 * @file apps/desktop/src/main/secure-storage/desktop-secure-storage.ts
 * Desktop secure storage abstraction leveraging Electron safeStorage with AES-256-GCM fallback for V8 Phase 113.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import electron from 'electron';
import { SecretRedactor } from '@ai-quality/core';

export interface IDesktopSecureStorage {
  storeSessionToken(token: string): Promise<void>;
  retrieveSessionToken(): Promise<string | null>;
  clearSessionToken(): Promise<void>;
}

const FALLBACK_SECRET_SALT = 'ai-quality-desktop-secure-storage-salt-2026';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

export class DesktopSecureStorage implements IDesktopSecureStorage {
  private readonly storageFilePath: string | null;
  private inMemoryFallback: string | null = null;
  private readonly fallbackKey: Buffer;

  constructor(options?: { readonly storagePath?: string; readonly inMemoryOnly?: boolean }) {
    if (options?.inMemoryOnly) {
      this.storageFilePath = null;
    } else if (options?.storagePath) {
      this.storageFilePath = options.storagePath;
    } else {
      try {
        const app = electron.app;
        if (app && typeof app.getPath === 'function') {
          const userDataDir = app.getPath('userData');
          this.storageFilePath = path.join(userDataDir, 'auth-session.dat');
        } else {
          this.storageFilePath = null;
        }
      } catch {
        this.storageFilePath = null;
      }
    }

    const envKey = process.env.DESKTOP_SECURE_KEY ?? FALLBACK_SECRET_SALT;
    this.fallbackKey = crypto.createHash('sha256').update(envKey).digest();
  }

  /**
   * Encrypts and persists the bearer session token.
   */
  public async storeSessionToken(token: string): Promise<void> {
    if (!token || typeof token !== 'string') {
      await this.clearSessionToken();
      return;
    }

    SecretRedactor.registerSecret(token);

    let encryptedBuffer: Buffer;

    // Check if Electron safeStorage is available and supported
    if (
      electron.safeStorage &&
      typeof electron.safeStorage.isEncryptionAvailable === 'function' &&
      electron.safeStorage.isEncryptionAvailable()
    ) {
      encryptedBuffer = electron.safeStorage.encryptString(token);
    } else {
      // Fallback AES-256-GCM encryption
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(ALGORITHM, this.fallbackKey, iv);
      const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
      const authTag = cipher.getAuthTag();
      // Format: [iv (12 bytes)][tag (16 bytes)][ciphertext]
      encryptedBuffer = Buffer.concat([iv, authTag, encrypted]);
    }

    if (this.storageFilePath) {
      const dir = path.dirname(this.storageFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.storageFilePath, encryptedBuffer);
    } else {
      this.inMemoryFallback = encryptedBuffer.toString('base64');
    }
  }

  /**
   * Decrypts and retrieves the stored bearer session token.
   * If corrupted or tampered with, purges storage and returns null safely.
   */
  public async retrieveSessionToken(): Promise<string | null> {
    let encryptedBuffer: Buffer | null = null;

    if (this.storageFilePath) {
      if (!fs.existsSync(this.storageFilePath)) {
        return null;
      }
      try {
        encryptedBuffer = fs.readFileSync(this.storageFilePath);
      } catch {
        return null;
      }
    } else if (this.inMemoryFallback) {
      encryptedBuffer = Buffer.from(this.inMemoryFallback, 'base64');
    }

    if (!encryptedBuffer || encryptedBuffer.length === 0) {
      return null;
    }

    try {
      let token: string;

      if (
        electron.safeStorage &&
        typeof electron.safeStorage.isEncryptionAvailable === 'function' &&
        electron.safeStorage.isEncryptionAvailable()
      ) {
        token = electron.safeStorage.decryptString(encryptedBuffer);
      } else {
        if (encryptedBuffer.length < IV_LENGTH + 16) {
          await this.clearSessionToken();
          return null;
        }

        const iv = encryptedBuffer.subarray(0, IV_LENGTH);
        const authTag = encryptedBuffer.subarray(IV_LENGTH, IV_LENGTH + 16);
        const ciphertext = encryptedBuffer.subarray(IV_LENGTH + 16);

        const decipher = crypto.createDecipheriv(ALGORITHM, this.fallbackKey, iv);
        decipher.setAuthTag(authTag);
        token = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
      }

      SecretRedactor.registerSecret(token);
      return token;
    } catch {
      // Data was tampered with or key changed: purge file and return null safely
      await this.clearSessionToken();
      return null;
    }
  }

  /**
   * Purges stored credentials.
   */
  public async clearSessionToken(): Promise<void> {
    this.inMemoryFallback = null;
    if (this.storageFilePath && fs.existsSync(this.storageFilePath)) {
      try {
        fs.unlinkSync(this.storageFilePath);
      } catch {
        // Ignore deletion errors
      }
    }
  }
}
