/**
 * @file packages/core/src/jira/jira-url-validator.test.ts
 * Unit and adversarial tests for Jira Base URL validation and SSRF defenses (V7 Phase 89).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JiraUrlValidator } from './jira-url-validator.js';
import { JiraConfigurationInvalidError, JiraSecurityError } from './jira-errors.js';

describe('JiraUrlValidator (Phase 89)', () => {
  describe('Base URL Validation & Normalization', () => {
    it('normalizes valid Jira Cloud HTTPS URLs and removes trailing slashes', () => {
      const url = 'https://my-company.atlassian.net///';
      const normalized = JiraUrlValidator.validateAndNormalizeBaseUrl(url);
      assert.equal(normalized, 'https://my-company.atlassian.net');
    });

    it('preserves valid custom domain HTTPS URLs with ports', () => {
      const url = 'https://jira.enterprise.corp:8443/jira/';
      const normalized = JiraUrlValidator.validateAndNormalizeBaseUrl(url);
      assert.equal(normalized, 'https://jira.enterprise.corp:8443/jira');
    });

    it('rejects empty or whitespace-only URLs', () => {
      assert.throws(
        () => JiraUrlValidator.validateAndNormalizeBaseUrl('   '),
        JiraConfigurationInvalidError,
      );
    });

    it('rejects URLs exceeding maximum permitted length', () => {
      const longUrl = `https://${'a'.repeat(600)}.atlassian.net`;
      assert.throws(
        () => JiraUrlValidator.validateAndNormalizeBaseUrl(longUrl),
        JiraConfigurationInvalidError,
      );
    });

    it('rejects malformed URLs without valid protocol or host', () => {
      assert.throws(
        () => JiraUrlValidator.validateAndNormalizeBaseUrl('not-a-valid-url'),
        JiraConfigurationInvalidError,
      );
    });

    it('rejects URLs with out-of-range port numbers', () => {
      assert.throws(
        () => JiraUrlValidator.validateAndNormalizeBaseUrl('https://jira.corp:99999'),
        JiraConfigurationInvalidError,
      );
    });
  });

  describe('Adversarial Protocol & Credential Attacks', () => {
    it('strictly rejects insecure HTTP in production mode', () => {
      assert.throws(
        () => JiraUrlValidator.validateAndNormalizeBaseUrl('http://my-company.atlassian.net'),
        JiraSecurityError,
      );
    });

    it('allows HTTP in explicit test mode for local mock servers', () => {
      const normalized = JiraUrlValidator.validateAndNormalizeBaseUrl('http://127.0.0.1:8080', {
        allowLocalhostForTesting: true,
      });
      assert.equal(normalized, 'http://127.0.0.1:8080');
    });

    it('rejects javascript: and dangerous URI schemes', () => {
      const dangerous = [
        'javascript:alert(1)',
        'file:///etc/passwd',
        'data:text/html,<html>',
        'ftp://jira.corp',
        'gopher://jira.corp',
        'ldap://jira.corp',
      ];

      for (const uri of dangerous) {
        assert.throws(
          () => JiraUrlValidator.validateAndNormalizeBaseUrl(uri),
          JiraSecurityError,
          `Expected scheme rejection for: ${uri}`,
        );
      }
    });

    it('rejects embedded user or password credentials', () => {
      const attackUrls = [
        'https://user:password@my-company.atlassian.net',
        'https://admin@my-company.atlassian.net',
      ];

      for (const uri of attackUrls) {
        assert.throws(
          () => JiraUrlValidator.validateAndNormalizeBaseUrl(uri),
          JiraSecurityError,
          `Expected credential rejection for: ${uri}`,
        );
      }
    });
  });

  describe('SSRF Protection & Address Boundary Defenses', () => {
    it('blocks loopback and localhost addresses in production', () => {
      const loopbacks = [
        'https://localhost',
        'https://127.0.0.1',
        'https://127.0.0.2',
        'https://[::1]',
        'https://0.0.0.0',
      ];

      for (const target of loopbacks) {
        assert.throws(
          () => JiraUrlValidator.validateAndNormalizeBaseUrl(target),
          JiraSecurityError,
          `Expected loopback rejection for: ${target}`,
        );
      }
    });

    it('blocks cloud metadata endpoints even in test mode', () => {
      const metadataTargets = [
        'https://169.254.169.254',
        'http://169.254.169.254',
        'https://metadata.google.internal',
        'http://metadata.google.internal',
        'https://100.100.100.200',
        'https://instance-data',
      ];

      for (const target of metadataTargets) {
        assert.throws(
          () =>
            JiraUrlValidator.validateAndNormalizeBaseUrl(target, {
              allowLocalhostForTesting: true,
            }),
          JiraSecurityError,
          `Expected metadata endpoint rejection for: ${target}`,
        );
      }
    });

    it('blocks private RFC 1918 IPv4 ranges in production', () => {
      const privateIps = [
        'https://10.0.0.1',
        'https://10.255.255.254',
        'https://172.16.0.1',
        'https://172.31.255.254',
        'https://192.168.1.1',
        'https://192.168.254.254',
        'https://169.254.1.1', // Link-local
      ];

      for (const target of privateIps) {
        assert.throws(
          () => JiraUrlValidator.validateAndNormalizeBaseUrl(target),
          JiraSecurityError,
          `Expected private IP rejection for: ${target}`,
        );
      }
    });

    it('blocks private and link-local IPv6 ranges', () => {
      const privateIpv6 = [
        'https://[fe80::1]',
        'https://[fc00::1]',
        'https://[fd12:3456:789a:1::1]',
      ];

      for (const target of privateIpv6) {
        assert.throws(
          () => JiraUrlValidator.validateAndNormalizeBaseUrl(target),
          JiraSecurityError,
          `Expected IPv6 rejection for: ${target}`,
        );
      }
    });
  });
});
