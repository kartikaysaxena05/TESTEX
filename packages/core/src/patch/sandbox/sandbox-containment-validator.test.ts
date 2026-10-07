/**
 * @file packages/core/src/patch/sandbox/sandbox-containment-validator.test.ts
 * Unit tests for SandboxContainmentValidator: path containment, traversal escapes,
 * symlink escape traps, sensitive file blocking, .git metadata protection, and binary detection.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SandboxContainmentValidator } from './sandbox-containment-validator.js';
import {
  PatchSandboxGitMetadataBlockedError,
  PatchSandboxPathTraversalError,
  PatchSandboxSensitiveFileBlockedError,
  PatchSandboxSymlinkEscapeError,
  PatchSandboxUnauthorizedFileError,
  PatchSandboxUnsupportedBinaryError,
} from './sandbox-errors.js';

describe('SandboxContainmentValidator', () => {
  let tempDir: string;
  let sandboxRoot: string;
  let outsideDir: string;

  before(() => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'validator-test-')));
    sandboxRoot = path.join(tempDir, 'sandbox');
    outsideDir = path.join(tempDir, 'outside');
    fs.mkdirSync(sandboxRoot, { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });
  });

  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('normalizeRelativePath', () => {
    it('normalizes normal relative paths and strips leading ./', () => {
      assert.equal(
        SandboxContainmentValidator.normalizeRelativePath('src/utils.ts'),
        'src/utils.ts',
      );
      assert.equal(
        SandboxContainmentValidator.normalizeRelativePath('./src/utils.ts'),
        'src/utils.ts',
      );
      assert.equal(
        SandboxContainmentValidator.normalizeRelativePath('.//src/utils.ts'),
        'src/utils.ts',
      );
    });

    it('rejects empty or whitespace paths', () => {
      assert.throws(
        () => SandboxContainmentValidator.normalizeRelativePath(''),
        PatchSandboxPathTraversalError,
      );
      assert.throws(
        () => SandboxContainmentValidator.normalizeRelativePath(null as unknown as string),
        PatchSandboxPathTraversalError,
      );
    });

    it('rejects null byte injection', () => {
      assert.throws(
        () => SandboxContainmentValidator.normalizeRelativePath('src/foo\0.ts'),
        PatchSandboxPathTraversalError,
      );
    });

    it('rejects URI-encoded traversal strings', () => {
      assert.throws(
        () => SandboxContainmentValidator.normalizeRelativePath('src/%2e%2e/secret.ts'),
        PatchSandboxPathTraversalError,
      );
      assert.throws(
        () => SandboxContainmentValidator.normalizeRelativePath('src/%2f/etc/passwd'),
        PatchSandboxPathTraversalError,
      );
    });

    it('rejects absolute paths (POSIX and Windows drive/UNC)', () => {
      assert.throws(
        () => SandboxContainmentValidator.normalizeRelativePath('/etc/passwd'),
        PatchSandboxPathTraversalError,
      );
      assert.throws(
        () => SandboxContainmentValidator.normalizeRelativePath('C:\\windows\\system32'),
        PatchSandboxPathTraversalError,
      );
      assert.throws(
        () => SandboxContainmentValidator.normalizeRelativePath('//server/share/file'),
        PatchSandboxPathTraversalError,
      );
    });
  });

  describe('validatePathContainment', () => {
    it('allows valid subpaths inside sandbox root', () => {
      const resolved = SandboxContainmentValidator.validatePathContainment(
        sandboxRoot,
        'src/index.ts',
      );
      assert.equal(resolved, path.join(sandboxRoot, 'src', 'index.ts'));
    });

    it('detects and rejects parent directory traversal attempts (..)', () => {
      assert.throws(
        () => SandboxContainmentValidator.validatePathContainment(sandboxRoot, '../outside.ts'),
        PatchSandboxPathTraversalError,
      );
      assert.throws(
        () =>
          SandboxContainmentValidator.validatePathContainment(sandboxRoot, 'src/../../outside.ts'),
        PatchSandboxPathTraversalError,
      );
    });
  });

  describe('validateGitMetadata', () => {
    it('strictly forbids paths targeting .git directory or metadata', () => {
      assert.throws(
        () => SandboxContainmentValidator.validateGitMetadata('.git/config'),
        PatchSandboxGitMetadataBlockedError,
      );
      assert.throws(
        () => SandboxContainmentValidator.validateGitMetadata('.git/HEAD'),
        PatchSandboxGitMetadataBlockedError,
      );
      assert.throws(
        () => SandboxContainmentValidator.validateGitMetadata('modules/.git/HEAD'),
        PatchSandboxGitMetadataBlockedError,
      );
    });

    it('allows non-git metadata files like .gitignore or git-service.ts', () => {
      assert.doesNotThrow(() => SandboxContainmentValidator.validateGitMetadata('.gitignore'));
      assert.doesNotThrow(() =>
        SandboxContainmentValidator.validateGitMetadata('src/git/git-service.ts'),
      );
    });
  });

  describe('validateSensitiveFiles', () => {
    it('blocks environment files and secrets', () => {
      assert.throws(
        () => SandboxContainmentValidator.validateSensitiveFiles('.env'),
        PatchSandboxSensitiveFileBlockedError,
      );
      assert.throws(
        () => SandboxContainmentValidator.validateSensitiveFiles('.env.production'),
        PatchSandboxSensitiveFileBlockedError,
      );
      assert.throws(
        () => SandboxContainmentValidator.validateSensitiveFiles('config/.env.local'),
        PatchSandboxSensitiveFileBlockedError,
      );
    });

    it('blocks ssh keys and certificates', () => {
      assert.throws(
        () => SandboxContainmentValidator.validateSensitiveFiles('id_rsa'),
        PatchSandboxSensitiveFileBlockedError,
      );
      assert.throws(
        () => SandboxContainmentValidator.validateSensitiveFiles('.ssh/id_ed25519'),
        PatchSandboxSensitiveFileBlockedError,
      );
      assert.throws(
        () => SandboxContainmentValidator.validateSensitiveFiles('certs/server.pem'),
        PatchSandboxSensitiveFileBlockedError,
      );
      assert.throws(
        () => SandboxContainmentValidator.validateSensitiveFiles('certs/privkey.key'),
        PatchSandboxSensitiveFileBlockedError,
      );
    });

    it('blocks credentials and token files', () => {
      assert.throws(
        () => SandboxContainmentValidator.validateSensitiveFiles('credentials.json'),
        PatchSandboxSensitiveFileBlockedError,
      );
      assert.throws(
        () => SandboxContainmentValidator.validateSensitiveFiles('secrets.yaml'),
        PatchSandboxSensitiveFileBlockedError,
      );
    });

    it('allows safe application source code files', () => {
      assert.doesNotThrow(() =>
        SandboxContainmentValidator.validateSensitiveFiles('src/auth/login.ts'),
      );
      assert.doesNotThrow(() =>
        SandboxContainmentValidator.validateSensitiveFiles('src/models/user.ts'),
      );
    });
  });

  describe('validateAllowedScope', () => {
    it('passes when all target files are within authorized allowlist', () => {
      const targetFiles = ['src/validator.ts', 'src/types.ts'];
      const authorized = ['src/validator.ts', 'src/types.ts', 'src/index.ts'];
      assert.doesNotThrow(() =>
        SandboxContainmentValidator.validateAllowedScope(targetFiles, authorized),
      );
    });

    it('throws PatchSandboxUnauthorizedFileError when target file is outside allowlist', () => {
      const targetFiles = ['src/validator.ts', 'src/unauthorized.ts'];
      const authorized = ['src/validator.ts'];
      assert.throws(
        () => SandboxContainmentValidator.validateAllowedScope(targetFiles, authorized),
        PatchSandboxUnauthorizedFileError,
      );
    });
  });

  describe('validateSymlinkEscape', () => {
    it('detects symlinks pointing outside the sandbox root and throws PatchSandboxSymlinkEscapeError', () => {
      const outsideTarget = path.join(outsideDir, 'secret.txt');
      fs.writeFileSync(outsideTarget, 'secret content', 'utf8');

      const symlinkPath = path.join(sandboxRoot, 'escape_link');
      try {
        fs.symlinkSync(outsideTarget, symlinkPath);
      } catch {
        // Fallback if symlink permissions restricted
        return;
      }

      assert.throws(
        () => SandboxContainmentValidator.validateSymlinkEscape(sandboxRoot, 'escape_link'),
        PatchSandboxSymlinkEscapeError,
      );
    });

    it('allows symlinks pointing safely within the sandbox root', () => {
      const internalTarget = path.join(sandboxRoot, 'safe.txt');
      fs.writeFileSync(internalTarget, 'safe content', 'utf8');

      const symlinkPath = path.join(sandboxRoot, 'safe_link');
      try {
        fs.symlinkSync(internalTarget, symlinkPath);
      } catch {
        return;
      }

      assert.doesNotThrow(() =>
        SandboxContainmentValidator.validateSymlinkEscape(sandboxRoot, 'safe_link'),
      );
    });
  });

  describe('validateBinaryContent', () => {
    it('detects null bytes in binary files and rejects them', () => {
      const binaryContent = 'GIF89a\0\x01\0';
      assert.throws(
        () => SandboxContainmentValidator.validateBinaryContent(binaryContent, 'image.gif'),
        PatchSandboxUnsupportedBinaryError,
      );
    });

    it('allows UTF-8 text content without null bytes', () => {
      const textContent = 'export function hello(): string {\n  return "world";\n}\n';
      assert.doesNotThrow(() =>
        SandboxContainmentValidator.validateBinaryContent(textContent, 'src/hello.ts'),
      );
    });
  });

  describe('performAllChecks', () => {
    it('returns valid result with complete securityChecks object when all checks pass', () => {
      const result = SandboxContainmentValidator.performAllChecks(
        sandboxRoot,
        ['src/hello.ts'],
        ['src/hello.ts'],
      );
      assert.equal(result.isValid, true);
      assert.equal(result.securityChecks.pathContainmentPassed, true);
      assert.equal(result.securityChecks.symlinkEscapePassed, true);
      assert.equal(result.securityChecks.allowedFileScopePassed, true);
      assert.equal(result.securityChecks.sensitiveFilesProtected, true);
      assert.equal(result.securityChecks.gitMetadataProtected, true);
      assert.equal(result.securityChecks.binaryFilesBlocked, true);
      assert.equal(result.securityChecks.hardlinkIsolated, true);
    });
  });
});
