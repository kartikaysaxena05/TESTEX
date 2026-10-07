/**
 * @file packages/core/src/auth/password-hasher.ts
 * Memory-hard scrypt password hashing and constant-time verification for V8 Phase 113.
 */

import crypto from 'node:crypto';
import { AUTH_BOUNDS, type IPasswordHasher, type PasswordHashResult } from './auth-types.js';
import { InvalidAuthInputError } from './auth-errors.js';
import { SecretRedactor } from '../execution/sessions/secret-redactor.js';

const DUMMY_SALT = '0000000000000000000000000000000000000000000000000000000000000000';
const DUMMY_PASSWORD = 'dummy_timing_protection_password_2026';

function scryptDeriveKey(
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: crypto.ScryptOptions,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) {
        reject(err);
      } else {
        resolve(derivedKey as Buffer);
      }
    });
  });
}

export class PasswordHasher implements IPasswordHasher {
  private readonly n: number;
  private readonly r: number;
  private readonly p: number;
  private readonly keylen: number;
  private readonly saltBytes: number;

  constructor(options?: {
    readonly n?: number;
    readonly r?: number;
    readonly p?: number;
    readonly keylen?: number;
    readonly saltBytes?: number;
  }) {
    this.n = options?.n ?? AUTH_BOUNDS.SCRYPT_N;
    this.r = options?.r ?? AUTH_BOUNDS.SCRYPT_R;
    this.p = options?.p ?? AUTH_BOUNDS.SCRYPT_P;
    this.keylen = options?.keylen ?? AUTH_BOUNDS.SCRYPT_KEYLEN;
    this.saltBytes = options?.saltBytes ?? AUTH_BOUNDS.SALT_BYTES;
  }

  /**
   * Hashes a plaintext password using memory-hard scrypt.
   * Registers plaintext password with SecretRedactor immediately.
   * Serialized format: `$scrypt$v=1$N=<n>,r=<r>,p=<p>$<salt_hex>$<hash_hex>`
   */
  public async hash(password: string): Promise<PasswordHashResult> {
    if (!password || typeof password !== 'string') {
      throw new InvalidAuthInputError('Password must be a non-empty string.');
    }

    // Immediately redact plaintext password across all application memory and logs
    SecretRedactor.registerSecret(password);

    const salt = crypto.randomBytes(this.saltBytes);
    const derivedKey = await scryptDeriveKey(password, salt, this.keylen, {
      cost: this.n,
      blockSize: this.r,
      parallelization: this.p,
      maxmem: 64 * 1024 * 1024,
    });

    const saltHex = salt.toString('hex');
    const hashHex = derivedKey.toString('hex');
    const serializedHash = `$scrypt$v=1$N=${this.n},r=${this.r},p=${this.p}$${saltHex}$${hashHex}`;

    return {
      passwordHash: serializedHash,
      algorithm: 'scrypt',
      parameters: {
        N: this.n,
        r: this.r,
        p: this.p,
        keylen: this.keylen,
      },
      version: 1,
    };
  }

  /**
   * Verifies a candidate password against a serialized hash in constant time.
   */
  public async verify(password: string, serializedHash: string): Promise<boolean> {
    if (
      !password ||
      typeof password !== 'string' ||
      !serializedHash ||
      typeof serializedHash !== 'string'
    ) {
      return false;
    }

    // Register secret immediately
    SecretRedactor.registerSecret(password);

    try {
      // Parse serialized format: $scrypt$v=1$N=16384,r=8,p=1$<salt>$<hash>
      const parts = serializedHash.split('$');
      if (parts.length !== 6 || parts[1] !== 'scrypt' || !parts[2] || !parts[2].startsWith('v=')) {
        return false;
      }

      const paramString = parts[3];
      if (!paramString) {
        return false;
      }

      // Parse parameters
      const paramParts = paramString.split(',');
      const params: Record<string, number> = {};
      for (const pair of paramParts) {
        const [k, v] = pair.split('=');
        if (k && v) {
          params[k] = parseInt(v, 10);
        }
      }

      const cost = params['N'] ?? this.n;
      const blockSize = params['r'] ?? this.r;
      const parallelization = params['p'] ?? this.p;

      const saltHex = parts[4];
      const storedHashHex = parts[5];

      if (!saltHex || !storedHashHex) {
        return false;
      }

      const salt = Buffer.from(saltHex, 'hex');
      const storedHashBuffer = Buffer.from(storedHashHex, 'hex');

      const computedKey = await scryptDeriveKey(password, salt, storedHashBuffer.length, {
        cost,
        blockSize,
        parallelization,
        maxmem: 64 * 1024 * 1024,
      });

      if (computedKey.length !== storedHashBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(computedKey, storedHashBuffer);
    } catch {
      return false;
    }
  }

  /**
   * Computes dummy hash to eliminate timing leaks on non-existent account authentication.
   */
  public async performDummyHash(): Promise<void> {
    const salt = Buffer.from(DUMMY_SALT, 'hex');
    await scryptDeriveKey(DUMMY_PASSWORD, salt, this.keylen, {
      cost: this.n,
      blockSize: this.r,
      parallelization: this.p,
      maxmem: 64 * 1024 * 1024,
    });
  }
}
