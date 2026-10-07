/**
 * @file packages/core/src/execution/sessions/auth-login-handler.test.ts
 * Real Playwright form login and deterministic authentication validation tests against local HTTP server.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as http from 'node:http';
import { getPrismaClient } from '../../database/index.js';
import { AuthLoginHandler } from './auth-login-handler.js';
import { PlaywrightBrowserProvider } from '../browser-provider.js';
import { AuthenticationRejectedError } from './session-errors.js';

describe('AuthLoginHandler Playwright E2E Tests', () => {
  const prisma = getPrismaClient()!;
  let server: http.Server;
  let serverPort: number;
  let baseUrl: string;
  let browserProvider: PlaywrightBrowserProvider;
  let authHandler: AuthLoginHandler;
  let projectId: string;

  before(async () => {
    browserProvider = new PlaywrightBrowserProvider();
    authHandler = new AuthLoginHandler();

    // 1. Spin up local mock authentication HTTP server
    server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:${serverPort}`);

      if (url.pathname === '/login' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <body>
              <form id="login-form" action="/login" method="POST">
                <input id="username" name="username" type="text" placeholder="Username" />
                <input id="password" name="password" type="password" placeholder="Password" />
                <button id="login-btn" type="submit">Sign In</button>
              </form>
            </body>
          </html>
        `);
        return;
      }

      if (url.pathname === '/login' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
          body += chunk;
        });
        req.on('end', () => {
          const params = new URLSearchParams(body);
          const password = params.get('password');

          if (password === 'correct_password_123') {
            res.writeHead(302, {
              Location: '/dashboard',
              'Set-Cookie': 'auth_session=valid_session_token_xyz; Path=/; HttpOnly',
            });
            res.end();
          } else {
            res.writeHead(401, { 'Content-Type': 'text/html' });
            res.end('<html><body><div id="error-msg">Invalid credentials</div></body></html>');
          }
        });
        return;
      }

      if (url.pathname === '/dashboard') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <body>
              <h1>Dashboard</h1>
              <div id="user-menu">User Account Menu</div>
            </body>
          </html>
        `);
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        serverPort = addr.port;
        baseUrl = `http://127.0.0.1:${serverPort}`;
        resolve();
      });
    });

    const project = await prisma.project.create({
      data: {
        name: 'Auth Handler Test Project',
        status: 'ACTIVE',
      },
    });
    projectId = project.id;
  });

  after(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    if (projectId) {
      await prisma.project.delete({ where: { id: projectId } });
    }
  });

  it('authenticates successfully via form login and validates URL_MATCH and ELEMENT_PRESENT', async () => {
    const profile = await prisma.authenticationProfile.create({
      data: {
        projectId,
        name: 'Valid Form Login Profile',
        strategy: 'FORM_LOGIN',
        loginUrl: `${baseUrl}/login`,
        usernameFieldSelector: '#username',
        passwordFieldSelector: '#password',
        submitControlSelector: '#login-btn',
        successValidationType: 'ELEMENT_PRESENT',
        successValidationValue: '#user-menu',
      },
    });

    const browser = await browserProvider.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    const result = await authHandler.authenticate(profile, page, context, {
      testPassword: 'correct_password_123',
    });

    assert.equal(result.status, 'AUTHENTICATED');
    assert.equal(result.strategy, 'FORM_LOGIN');
    assert.ok(page.url().includes('/dashboard'));

    const cookies = await context.cookies();
    assert.ok(cookies.some(c => c.name === 'auth_session'));

    await context.close();
    await browser.close();
  });

  it('rejects wrong credentials and redacts password from error output', async () => {
    const profile = await prisma.authenticationProfile.create({
      data: {
        projectId,
        name: 'Reject Wrong Credential Profile',
        strategy: 'FORM_LOGIN',
        loginUrl: `${baseUrl}/login`,
        usernameFieldSelector: '#username',
        passwordFieldSelector: '#password',
        submitControlSelector: '#login-btn',
        successValidationType: 'URL_MATCH',
        successValidationValue: '/dashboard',
      },
    });

    const browser = await browserProvider.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    await assert.rejects(
      async () => {
        await authHandler.authenticate(profile, page, context, {
          testPassword: 'wrong_secret_password_999',
        });
      },
      (err: unknown) => {
        assert(err instanceof AuthenticationRejectedError);
        assert.ok(!String(err).includes('wrong_secret_password_999'));
        return true;
      },
    );

    await context.close();
    await browser.close();
  });

  it('returns NOT_REQUIRED for NONE authentication strategy', async () => {
    const profile = await prisma.authenticationProfile.create({
      data: {
        projectId,
        name: 'No Auth Profile',
        strategy: 'NONE',
      },
    });

    const browser = await browserProvider.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    const result = await authHandler.authenticate(profile, page, context);
    assert.equal(result.status, 'NOT_REQUIRED');
    assert.equal(result.strategy, 'NONE');

    await context.close();
    await browser.close();
  });
});
