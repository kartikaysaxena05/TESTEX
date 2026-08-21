import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  maskDatabaseUrl,
  validateDatabaseUrl,
  DatabaseNotConfiguredError,
  DatabaseConnectionError,
  DatabaseQueryError,
  mapPrismaError,
  DatabaseManager,
  getDatabaseManager,
  closeDatabaseManager,
  getPrismaClient,
  disconnectPrismaClient,
} from './index.js';

describe('PostgreSQL Database Subsystem Unit Tests (Prisma ORM)', () => {
  describe('URL Parsing and Credential Masking', () => {
    it('should strip passwords from PostgreSQL connection URLs', () => {
      const sensitiveUrl =
        'postgresql://admin:superSecretPass123@127.0.0.1:5432/ai_quality_platform';
      const masked = maskDatabaseUrl(sensitiveUrl);

      assert.strictEqual(
        masked.includes('superSecretPass123'),
        false,
        'Masked URL must never contain the original password',
      );
      assert.ok(masked.includes('***'), 'Masked URL must contain *** replacement');
      assert.ok(masked.includes('admin'), 'Masked URL preserves username');
      assert.ok(masked.includes('127.0.0.1:5432'), 'Masked URL preserves host and port');
      assert.ok(masked.includes('ai_quality_platform'), 'Masked URL preserves database name');
    });

    it('should validate allowed postgresql:// and postgres:// URL schemes', () => {
      const validPg = validateDatabaseUrl('postgresql://localhost:5432/testdb');
      assert.strictEqual(validPg.valid, true);
      assert.strictEqual(validPg.databaseName, 'testdb');

      const validP = validateDatabaseUrl('postgres://user:pass@dbhost:5432/prod_db');
      assert.strictEqual(validP.valid, true);
      assert.strictEqual(validP.databaseName, 'prod_db');
    });

    it('should reject invalid or unsupported database protocols', () => {
      const mysql = validateDatabaseUrl('mysql://localhost:3306/db');
      assert.strictEqual(mysql.valid, false);
      assert.ok(mysql.error?.includes('Invalid protocol'));

      const http = validateDatabaseUrl('http://localhost:5432/db');
      assert.strictEqual(http.valid, false);

      const empty = validateDatabaseUrl('');
      assert.strictEqual(empty.valid, false);
    });
  });

  describe('Database Error Classes and Prisma Error Mapping', () => {
    it('should instantiate error classes with correct names and codes', () => {
      const notConfigured = new DatabaseNotConfiguredError();
      assert.strictEqual(notConfigured.name, 'DatabaseNotConfiguredError');
      assert.strictEqual(notConfigured.code, 'DATABASE_NOT_CONFIGURED');

      const connError = new DatabaseConnectionError('Failed to connect to host');
      assert.strictEqual(connError.name, 'DatabaseConnectionError');
      assert.strictEqual(connError.code, 'DATABASE_CONNECTION_FAILED');

      const queryError = new DatabaseQueryError('Syntax error in query');
      assert.strictEqual(queryError.name, 'DatabaseQueryError');
      assert.strictEqual(queryError.code, 'DATABASE_QUERY_FAILED');
    });

    it('should map Prisma errors to sanitized DatabaseError instances', () => {
      const mappedAuth = mapPrismaError(new Error('P1000: Authentication failed against database'));
      assert.strictEqual(mappedAuth.code, 'DATABASE_CONNECTION_FAILED');
      assert.strictEqual(mappedAuth.message, 'Database authentication failed.');

      const mappedUnreachable = mapPrismaError(new Error("P1001: Can't reach database server"));
      assert.strictEqual(mappedUnreachable.code, 'DATABASE_CONNECTION_FAILED');
      assert.strictEqual(mappedUnreachable.message, 'Cannot reach PostgreSQL database server.');

      const mappedGeneric = mapPrismaError(new Error('Internal unexpected exception'));
      assert.strictEqual(mappedGeneric.code, 'DATABASE_ERROR');
      assert.strictEqual(mappedGeneric.message, 'Database operation failed.');
    });
  });

  describe('Prisma Client and DatabaseManager Singleton Lifecycle', () => {
    it('should provide a process-level singleton instance and close helper', async () => {
      const instance1 = getDatabaseManager();
      const instance2 = getDatabaseManager();
      assert.strictEqual(instance1, instance2, 'getDatabaseManager must return identical instance');

      await closeDatabaseManager();
      assert.ok(true, 'closeDatabaseManager must execute cleanly');
    });

    it('should manage PrismaClient singleton instance', async () => {
      const client1 = getPrismaClient();
      const client2 = getPrismaClient();
      assert.strictEqual(client1, client2, 'getPrismaClient must return identical instance');

      await disconnectPrismaClient();
      await disconnectPrismaClient(); // Idempotent disconnect
      assert.ok(true, 'disconnectPrismaClient must be idempotent');
    });

    it('should return not-configured status when DATABASE_URL is missing', async () => {
      const previousUrl = process.env['DATABASE_URL'];
      delete process.env['DATABASE_URL'];

      try {
        const manager = new DatabaseManager();
        const status = await manager.getStatus();
        assert.strictEqual(status.status, 'not-configured');
      } finally {
        if (previousUrl !== undefined) {
          process.env['DATABASE_URL'] = previousUrl;
        }
      }
    });

    it('should return unavailable status when connecting to unreachable host', async () => {
      const previousUrl = process.env['DATABASE_URL'];
      // Point to a non-existent port with immediate rejection
      process.env['DATABASE_URL'] = 'postgresql://localhost:59999/nonexistent';

      try {
        const manager = new DatabaseManager();
        const status = await manager.getStatus();
        assert.strictEqual(status.status, 'unavailable');
        await manager.close();
      } finally {
        if (previousUrl !== undefined) {
          process.env['DATABASE_URL'] = previousUrl;
        }
      }
    });
  });
});
