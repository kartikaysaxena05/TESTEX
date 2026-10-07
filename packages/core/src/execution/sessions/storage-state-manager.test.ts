/**
 * @file packages/core/src/execution/sessions/storage-state-manager.test.ts
 * Integration tests for StorageStateManager verifying path safety, serialization, and deletion.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { StorageStateManager } from './storage-state-manager.js';
import { StorageStateInvalidError, StorageStateNotFoundError } from './session-errors.js';
import { PlaywrightBrowserProvider } from '../browser-provider.js';

describe('StorageStateManager Tests', () => {
  const testStorageDir = path.join(
    process.cwd(),
    '.system_generated',
    'test_storage_states_' + Date.now(),
  );
  let manager: StorageStateManager;
  let browserProvider: PlaywrightBrowserProvider;

  before(async () => {
    manager = new StorageStateManager(testStorageDir);
    browserProvider = new PlaywrightBrowserProvider();
  });

  after(async () => {
    await fs.rm(testStorageDir, { recursive: true, force: true });
  });

  it('strictly rejects path traversal and arbitrary filesystem paths', () => {
    assert.throws(
      () => manager.resolveSafePath('../../etc/passwd'),
      (err: unknown) => {
        assert(err instanceof StorageStateInvalidError);
        return true;
      },
    );

    assert.throws(
      () => manager.resolveSafePath('/absolute/path/secret.json'),
      (err: unknown) => {
        assert(err instanceof StorageStateInvalidError);
        return true;
      },
    );

    assert.throws(
      () => manager.resolveSafePath('sub/dir/key'),
      (err: unknown) => {
        assert(err instanceof StorageStateInvalidError);
        return true;
      },
    );
  });

  it('saves and loads storage state from a browser context', async () => {
    const browser = await browserProvider.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.setContent('<html><body><h1>Test Storage</h1></body></html>');
    await context.addCookies([
      {
        name: 'session_token',
        value: 'abc-123-xyz',
        domain: 'localhost',
        path: '/',
        expires: Date.now() / 1000 + 3600,
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
      },
    ]);

    const stateKey = manager.generateKey('proj-123', 'admin_session');
    const metadata = await manager.saveStorageState(context, stateKey, 'proj-123');

    assert.equal(metadata.storageStateKey, stateKey);
    assert.equal(metadata.cookieCount, 1);
    assert.ok(metadata.fileSizeBytes > 0);

    const loadedPath = await manager.loadStorageState(stateKey);
    assert.ok(loadedPath.endsWith(`${stateKey}.json`));

    // Delete state file
    const deleted = await manager.deleteStorageState(stateKey);
    assert.equal(deleted, true);

    await assert.rejects(
      async () => {
        await manager.loadStorageState(stateKey);
      },
      (err: unknown) => {
        assert(err instanceof StorageStateNotFoundError);
        return true;
      },
    );

    await context.close();
    await browser.close();
  });
});
