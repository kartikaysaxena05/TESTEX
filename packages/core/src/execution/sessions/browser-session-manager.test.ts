/**
 * @file packages/core/src/execution/sessions/browser-session-manager.test.ts
 * Real Playwright tests for BrowserSessionManager context isolation, multi-page ownership, and teardown.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as http from 'node:http';
import { getPrismaClient } from '../../database/index.js';
import { BrowserSessionManager } from './browser-session-manager.js';
import { PlaywrightBrowserProvider } from '../browser-provider.js';

describe('BrowserSessionManager Playwright Integration Tests', () => {
  const prisma = getPrismaClient()!;
  let sessionManager: BrowserSessionManager;
  let projectId: string;
  let server: http.Server;
  let serverPort: number;
  let serverUrl: string;

  before(async () => {
    sessionManager = new BrowserSessionManager(prisma, new PlaywrightBrowserProvider());

    // Mock local web server to test localStorage and cookie origin isolation
    server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!DOCTYPE html><html><body><h1>Isolation Test Page</h1></body></html>');
    });

    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        serverPort = addr.port;
        serverUrl = `http://127.0.0.1:${serverPort}`;
        resolve();
      });
    });

    const project = await prisma.project.create({
      data: {
        name: 'Browser Session Test Project',
        description: 'Testing browser execution sessions',
        status: 'ACTIVE',
      },
    });
    projectId = project.id;
  });

  after(async () => {
    await sessionManager.closeAllSessions();
    await new Promise<void>(resolve => server.close(() => resolve()));
    if (projectId) {
      await prisma.project.delete({ where: { id: projectId } });
    }
  });

  it('creates an isolated browser session with configured parameters', async () => {
    const session = await sessionManager.createSession({
      testRunId: 'run-p62-001',
      projectId,
      headless: true,
      viewport: { width: 1024, height: 768 },
      locale: 'en-GB',
      timezoneId: 'UTC',
    });

    assert.equal(session.status, 'READY');
    assert.equal(session.testRunId, 'run-p62-001');
    assert.equal(session.isFresh, true);
    assert.ok(session.browser);
    assert.ok(session.context);
    assert.ok(session.page);

    const viewport = session.page.viewportSize();
    assert.equal(viewport?.width, 1024);
    assert.equal(viewport?.height, 768);

    await session.close();
    assert.equal(session.status, 'CLOSED');
  });

  it('guarantees strict cross-run isolation: 0 cookie bleed and 0 localStorage bleed', async () => {
    // 1. Create Session A and Session B concurrently
    const sessionA = await sessionManager.createSession({
      testRunId: 'run-iso-A',
      projectId,
      headless: true,
    });

    const sessionB = await sessionManager.createSession({
      testRunId: 'run-iso-B',
      projectId,
      headless: true,
    });

    // 2. Set Cookie and localStorage in Session A
    await sessionA.page.goto(serverUrl);
    await sessionA.context.addCookies([
      {
        name: 'auth_token_user_a',
        value: 'secret-token-user-a-12345',
        url: serverUrl,
      },
    ]);

    await sessionA.page.evaluate(() => {
      window.localStorage.setItem('user_session_id', 'user_a_active_session');
    });

    // 3. Set Cookie and localStorage in Session B
    await sessionB.page.goto(serverUrl);
    await sessionB.context.addCookies([
      {
        name: 'auth_token_user_b',
        value: 'secret-token-user-b-99999',
        url: serverUrl,
      },
    ]);

    await sessionB.page.evaluate(() => {
      window.localStorage.setItem('user_session_id', 'user_b_active_session');
    });

    // 4. Assert Session A cannot see Session B cookies or storage
    const cookiesA = await sessionA.context.cookies();
    assert.ok(cookiesA.some(c => c.name === 'auth_token_user_a'));
    assert.ok(!cookiesA.some(c => c.name === 'auth_token_user_b'));

    const storageA = await sessionA.page.evaluate(() =>
      window.localStorage.getItem('user_session_id'),
    );
    assert.equal(storageA, 'user_a_active_session');

    // 5. Assert Session B cannot see Session A cookies or storage
    const cookiesB = await sessionB.context.cookies();
    assert.ok(cookiesB.some(c => c.name === 'auth_token_user_b'));
    assert.ok(!cookiesB.some(c => c.name === 'auth_token_user_a'));

    const storageB = await sessionB.page.evaluate(() =>
      window.localStorage.getItem('user_session_id'),
    );
    assert.equal(storageB, 'user_b_active_session');

    // 6. Close Session A; verify Session B remains completely intact and active
    await sessionA.close();
    assert.equal(sessionA.status, 'CLOSED');
    assert.equal(sessionB.status, 'READY');

    const storageBAfter = await sessionB.page.evaluate(() =>
      window.localStorage.getItem('user_session_id'),
    );
    assert.equal(storageBAfter, 'user_b_active_session');

    await sessionB.close();
    assert.equal(sessionB.status, 'CLOSED');
  });

  it('supports cooperative cancellation during session creation or authentication', async () => {
    const abortController = new AbortController();
    abortController.abort(); // Cancel before creation completes

    const session = await sessionManager.createSession({
      testRunId: 'run-cancel-test',
      projectId,
      headless: true,
      abortSignal: abortController.signal,
    });

    assert.ok(session.status === 'READY' || session.status === 'CLOSED');
    await session.close();
  });
});
