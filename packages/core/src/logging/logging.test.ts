/**
 * @file packages/core/src/logging/logging.test.ts
 * Unit and integration tests for secret redaction, error serialization, structured logging, and log rotation.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { redactValue, sanitizeStringCredentials, isSensitiveKey } from './redaction.js';
import { serializeError } from './error-serializer.js';
import { AppLogger } from './logger.js';
import { RotatingLogStream } from './file-stream.js';

describe('Logging Subsystem — Secret Redaction Tests', () => {
  it('should redact sensitive keys in flat objects', () => {
    const input = {
      password: 'TEST_SECRET_DO_NOT_LEAK_PASSWORD',
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret',
      accessToken: 'access-token-value',
      refreshToken: 'refresh-token-value',
      apiKey: 'api-key-12345',
      authorization: 'Bearer super-secret-token',
      cookie: 'session_id=abcdef123456',
      databaseUrl: 'postgresql://admin:supersecret@localhost:5432/db',
      DATABASE_URL: 'postgresql://postgres:secretpass@127.0.0.1:5432/prod',
      privateKey: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASC',
      projectId: 'b5e1b212-0000-4000-8000-000000000001',
      status: 'ACTIVE',
    };

    const redacted = redactValue(input) as Record<string, unknown>;

    assert.strictEqual(redacted['password'], '[REDACTED]');
    assert.strictEqual(redacted['token'], '[REDACTED]');
    assert.strictEqual(redacted['accessToken'], '[REDACTED]');
    assert.strictEqual(redacted['refreshToken'], '[REDACTED]');
    assert.strictEqual(redacted['apiKey'], '[REDACTED]');
    assert.strictEqual(redacted['authorization'], '[REDACTED]');
    assert.strictEqual(redacted['cookie'], '[REDACTED]');
    assert.strictEqual(redacted['databaseUrl'], '[REDACTED]');
    assert.strictEqual(redacted['DATABASE_URL'], '[REDACTED]');
    assert.strictEqual(redacted['privateKey'], '[REDACTED]');

    // Verify non-sensitive fields are preserved
    assert.strictEqual(redacted['projectId'], 'b5e1b212-0000-4000-8000-000000000001');
    assert.strictEqual(redacted['status'], 'ACTIVE');
  });

  it('should redact secrets inside nested objects and arrays', () => {
    const input = {
      project: {
        id: '123',
        meta: {
          token: 'nested-secret-token',
          apiKey: 'deeply-nested-api-key',
        },
        environments: [
          { name: 'staging', secret: 'env-secret' },
          { name: 'prod', cookie: 'admin-cookie' },
        ],
      },
    };

    const redacted = redactValue(input) as {
      project: {
        id: string;
        meta: { token: string; apiKey: string };
        environments: Array<{ name: string; secret?: string; cookie?: string }>;
      };
    };

    assert.strictEqual(redacted.project.id, '123');
    assert.strictEqual(redacted.project.meta.token, '[REDACTED]');
    assert.strictEqual(redacted.project.meta.apiKey, '[REDACTED]');
    assert.strictEqual(redacted.project.environments[0]?.secret, '[REDACTED]');
    assert.strictEqual(redacted.project.environments[1]?.cookie, '[REDACTED]');
  });

  it('should sanitize credentials inside URL strings and Authorization headers', () => {
    const rawUrl = 'postgresql://admin:super_secret_password_123@localhost:5432/my_database';
    const sanitizedUrl = sanitizeStringCredentials(rawUrl);
    assert.strictEqual(sanitizedUrl, 'postgresql://[REDACTED]@localhost:5432/my_database');

    const rawHttpsUrl = 'https://bot_user:secret_api_token@api.example.com/v1/resource';
    const sanitizedHttps = sanitizeStringCredentials(rawHttpsUrl);
    assert.strictEqual(sanitizedHttps, 'https://[REDACTED]@api.example.com/v1/resource');

    const bearerHeader = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature';
    const sanitizedBearer = sanitizeStringCredentials(bearerHeader);
    assert.strictEqual(sanitizedBearer, 'Bearer [REDACTED]');
  });

  it('should not false-positive on harmless operational keys', () => {
    assert.strictEqual(isSensitiveKey('projectId'), false);
    assert.strictEqual(isSensitiveKey('environmentId'), false);
    assert.strictEqual(isSensitiveKey('requestId'), false);
    assert.strictEqual(isSensitiveKey('durationMs'), false);
    assert.strictEqual(isSensitiveKey('errorCode'), false);
    assert.strictEqual(isSensitiveKey('statusCode'), false);
    assert.strictEqual(isSensitiveKey('name'), false);
    assert.strictEqual(isSensitiveKey('description'), false);
  });
});

describe('Logging Subsystem — Error Serialization Tests', () => {
  it('should safely serialize standard Error instances', () => {
    const err = new Error('Database connection failed.');
    (err as Error & { code: string }).code = 'P2002';

    const serialized = serializeError(err);
    assert.strictEqual(serialized.name, 'Error');
    assert.strictEqual(serialized.message, 'Database connection failed.');
    assert.strictEqual(serialized.code, 'P2002');
    assert.ok(serialized.stack && serialized.stack.includes('logging.test.js'));
  });

  it('should sanitize URL credentials embedded in error messages and stack traces', () => {
    const err = new Error(
      'Failed to connect to postgresql://user:my_secret_pass@127.0.0.1:5432/db',
    );
    const serialized = serializeError(err);
    assert.strictEqual(
      serialized.message,
      'Failed to connect to postgresql://[REDACTED]@127.0.0.1:5432/db',
    );
  });

  it('should safely serialize string, number, object, null, and undefined errors', () => {
    assert.deepStrictEqual(serializeError('Simple string error'), {
      name: 'Error',
      message: 'Simple string error',
    });

    assert.deepStrictEqual(serializeError(404), {
      name: 'PrimitiveError',
      message: '404',
    });

    assert.deepStrictEqual(serializeError(null), {
      name: 'Error',
      message: 'Unknown error occurred.',
    });

    assert.deepStrictEqual(serializeError(undefined), {
      name: 'Error',
      message: 'Unknown error occurred.',
    });

    const objErr = serializeError({ custom: 'error_details', secret: 'hide_me' });
    assert.strictEqual(objErr.name, 'ObjectError');
    assert.ok(objErr.message.includes('custom'));
    assert.ok(objErr.message.includes('[REDACTED]'));
    assert.strictEqual(objErr.message.includes('hide_me'), false);
  });
});

describe('Logging Subsystem — Structured File Output & Rotation Tests', () => {
  let tempLogDir: string;

  beforeEach(() => {
    tempLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-quality-log-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempLogDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('should write structured JSON log records to file in temporary directory', () => {
    const logger = new AppLogger({
      logDir: tempLogDir,
      logFileName: 'test.log',
      level: 'debug',
      isDevelopment: false,
    });

    logger.info('project.created', {
      projectId: 'b5e1b212-0000-4000-8000-000000000001',
      password: 'DO_NOT_LOG_THIS_PASSWORD',
    });

    const logFile = path.join(tempLogDir, 'test.log');
    assert.strictEqual(fs.existsSync(logFile), true);

    const content = fs.readFileSync(logFile, 'utf-8');
    const lines = content.trim().split('\n');
    assert.strictEqual(lines.length, 1);

    const record = JSON.parse(lines[0]!) as Record<string, unknown>;
    assert.strictEqual(record['level'], 'info');
    assert.strictEqual(record['event'], 'project.created');
    assert.strictEqual(record['projectId'], 'b5e1b212-0000-4000-8000-000000000001');
    assert.strictEqual(record['password'], '[REDACTED]');
    assert.ok(typeof record['timestamp'] === 'string');
  });

  it('should rotate log files when file size threshold is exceeded', () => {
    const stream = new RotatingLogStream({
      logDir: tempLogDir,
      logFileName: 'rotating.log',
      maxFileSizeBytes: 120, // Tiny threshold to trigger rotation
      maxRetainedFiles: 3,
    });

    // Write multiple lines that exceed 120 bytes
    stream.writeLine(JSON.stringify({ event: 'event_1', data: 'first_payload_data' }));
    stream.writeLine(JSON.stringify({ event: 'event_2', data: 'second_payload_data' }));
    stream.writeLine(JSON.stringify({ event: 'event_3', data: 'third_payload_data' }));
    stream.writeLine(JSON.stringify({ event: 'event_4', data: 'fourth_payload_data' }));

    const activeFile = path.join(tempLogDir, 'rotating.log');
    const rotated1 = path.join(tempLogDir, 'rotating.log.1');

    assert.strictEqual(fs.existsSync(activeFile), true);
    assert.strictEqual(fs.existsSync(rotated1), true);
  });

  it('should handle log injection attacks safely without corrupting JSON lines', () => {
    const logger = new AppLogger({
      logDir: tempLogDir,
      logFileName: 'injection.log',
      level: 'info',
      isDevelopment: false,
    });

    const maliciousMessage =
      'Normal message\n{"fake_level":"fatal","fake_event":"pwned"}\r\n\x1b[31mRed Alert\x1b[0m';
    logger.info('user.action', { message: maliciousMessage });

    const logFile = path.join(tempLogDir, 'injection.log');
    const content = fs.readFileSync(logFile, 'utf-8');
    const lines = content.trim().split('\n');

    // Must be exactly 1 valid JSON line
    assert.strictEqual(lines.length, 1);
    const parsed = JSON.parse(lines[0]!) as { event: string; message: string };
    assert.strictEqual(parsed.event, 'user.action');
    assert.strictEqual(parsed.message, maliciousMessage);
  });
});
