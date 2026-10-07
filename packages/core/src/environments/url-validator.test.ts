/**
 * @file packages/core/src/environments/url-validator.test.ts
 * Unit tests for URL validation, normalization, and route resolution.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { UrlValidator } from './url-validator.js';
import { InvalidBaseUrlError, UnsupportedProtocolError } from './environment-errors.js';

describe('UrlValidator Unit Tests', () => {
  describe('Base URL Validation & Normalization', () => {
    it('should validate and normalize standard HTTPS URLs', () => {
      const result = UrlValidator.validateAndNormalizeBaseUrl('https://example.com/');
      assert.equal(result, 'https://example.com');
    });

    it('should lowercase hostname and strip trailing slash', () => {
      const result = UrlValidator.validateAndNormalizeBaseUrl(
        'HTTPS://MyApp.Example.COM:8080/app/',
      );
      assert.equal(result, 'https://myapp.example.com:8080/app');
    });

    it('should allow localhost with port', () => {
      const result = UrlValidator.validateAndNormalizeBaseUrl('http://localhost:3000');
      assert.equal(result, 'http://localhost:3000');
    });

    it('should allow 127.0.0.1 IP address with port', () => {
      const result = UrlValidator.validateAndNormalizeBaseUrl('http://127.0.0.1:8080/api');
      assert.equal(result, 'http://127.0.0.1:8080/api');
    });

    it('should trim surrounding whitespace', () => {
      const result = UrlValidator.validateAndNormalizeBaseUrl('  https://test.example.com   ');
      assert.equal(result, 'https://test.example.com');
    });

    it('should reject empty or whitespace-only URLs', () => {
      assert.throws(
        () => UrlValidator.validateAndNormalizeBaseUrl('   '),
        (err: unknown) => err instanceof InvalidBaseUrlError,
      );
    });

    it('should reject unsupported protocols (ftp, file, javascript, data)', () => {
      assert.throws(
        () => UrlValidator.validateAndNormalizeBaseUrl('ftp://files.example.com'),
        (err: unknown) => err instanceof UnsupportedProtocolError,
      );

      assert.throws(
        () => UrlValidator.validateAndNormalizeBaseUrl('file:///etc/passwd'),
        (err: unknown) => err instanceof UnsupportedProtocolError,
      );

      assert.throws(
        () => UrlValidator.validateAndNormalizeBaseUrl('javascript:alert(1)'),
        (err: unknown) => err instanceof UnsupportedProtocolError,
      );

      assert.throws(
        () => UrlValidator.validateAndNormalizeBaseUrl('data:text/html,<h1>test</h1>'),
        (err: unknown) => err instanceof UnsupportedProtocolError,
      );
    });

    it('should reject URLs with embedded user credentials', () => {
      assert.throws(
        () => UrlValidator.validateAndNormalizeBaseUrl('https://admin:secret123@example.com'),
        (err: unknown) => err instanceof InvalidBaseUrlError && err.message.includes('credentials'),
      );
    });

    it('should reject excessively long URLs exceeding 2048 chars', () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(2050);
      assert.throws(
        () => UrlValidator.validateAndNormalizeBaseUrl(longUrl),
        (err: unknown) =>
          err instanceof InvalidBaseUrlError &&
          err.message.includes('exceeds maximum permitted length'),
      );
    });

    it('should reject invalid or malformed URLs', () => {
      assert.throws(
        () => UrlValidator.validateAndNormalizeBaseUrl('not-a-url'),
        (err: unknown) => err instanceof InvalidBaseUrlError,
      );
    });
  });

  describe('Route & URL Resolution', () => {
    it('should resolve simple relative path against base URL', () => {
      const resolved = UrlValidator.resolveTargetUrl('https://example.com', '/login');
      assert.equal(resolved, 'https://example.com/login');
    });

    it('should resolve relative path when base URL has subpath', () => {
      const resolved = UrlValidator.resolveTargetUrl('https://example.com/app', '/dashboard');
      assert.equal(resolved, 'https://example.com/app/dashboard');
    });

    it('should merge query parameters cleanly', () => {
      const resolved = UrlValidator.resolveTargetUrl(
        'https://example.com/app?org=1',
        '/users?role=admin',
      );
      assert.equal(resolved, 'https://example.com/app/users?org=1&role=admin');
    });

    it('should preserve URL fragment if provided in relative path', () => {
      const resolved = UrlValidator.resolveTargetUrl('https://example.com', '/docs#section-1');
      assert.equal(resolved, 'https://example.com/docs#section-1');
    });

    it('should return base URL unchanged when path is empty or root slash', () => {
      const resolved = UrlValidator.resolveTargetUrl('https://example.com/app', '/');
      assert.equal(resolved, 'https://example.com/app');
    });
  });
});
