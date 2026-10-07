/**
 * @file packages/core/src/environments/reachability-checker.test.ts
 * Unit tests for bounded HTTP preflight reachability validation using local Node http server.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { EnvironmentReachabilityChecker } from './reachability-checker.js';

describe('EnvironmentReachabilityChecker Unit Tests', () => {
  let server: http.Server;
  let baseUrl: string;

  before(async () => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

      if (url.pathname === '/ok') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
      } else if (url.pathname === '/auth-required') {
        res.writeHead(401, { 'Content-Type': 'text/plain' });
        res.end('Unauthorized');
      } else if (url.pathname === '/forbidden') {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
      } else if (url.pathname === '/not-found') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      } else if (url.pathname === '/server-error') {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      } else if (url.pathname === '/redirect-1') {
        res.writeHead(302, { Location: '/ok' });
        res.end();
      } else if (url.pathname === '/redirect-loop-a') {
        res.writeHead(302, { Location: '/redirect-loop-b' });
        res.end();
      } else if (url.pathname === '/redirect-loop-b') {
        res.writeHead(302, { Location: '/redirect-loop-a' });
        res.end();
      } else if (url.pathname === '/slow') {
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('Delayed');
        }, 1500);
      } else if (url.pathname === '/head-not-allowed') {
        if (req.method === 'HEAD') {
          res.writeHead(405, { 'Content-Type': 'text/plain' });
          res.end();
        } else {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('GET Fallback Success');
        }
      } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Default Response');
      }
    });

    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close(err => (err ? reject(err) : resolve()));
    });
  });

  it('should report REACHABLE for HTTP 200 responses', async () => {
    const checker = new EnvironmentReachabilityChecker();
    const result = await checker.check(`${baseUrl}/ok`, { timeoutMs: 3000 });

    assert.equal(result.status, 'REACHABLE');
    assert.equal(result.statusCode, 200);
    assert.equal(result.requestedUrl, `${baseUrl}/ok`);
    assert.equal(result.redirectCount, 0);
    assert.ok(result.responseTimeMs >= 0);
  });

  it('should follow redirects and report final URL', async () => {
    const checker = new EnvironmentReachabilityChecker();
    const result = await checker.check(`${baseUrl}/redirect-1`, { timeoutMs: 3000 });

    assert.equal(result.status, 'REACHABLE');
    assert.equal(result.statusCode, 200);
    assert.equal(result.redirectCount, 1);
    assert.equal(result.finalUrl, `${baseUrl}/ok`);
  });

  it('should detect circular redirect loops safely', async () => {
    const checker = new EnvironmentReachabilityChecker();
    const result = await checker.check(`${baseUrl}/redirect-loop-a`, { timeoutMs: 3000 });

    assert.equal(result.status, 'REDIRECT_LOOP');
    assert.ok(result.message.includes('Circular redirect') || result.message.includes('redirect'));
  });

  it('should report AUTHENTICATION_REQUIRED for 401 and 403', async () => {
    const checker = new EnvironmentReachabilityChecker();

    const res401 = await checker.check(`${baseUrl}/auth-required`, { timeoutMs: 3000 });
    assert.equal(res401.status, 'AUTHENTICATION_REQUIRED');
    assert.equal(res401.statusCode, 401);

    const res403 = await checker.check(`${baseUrl}/forbidden`, { timeoutMs: 3000 });
    assert.equal(res403.status, 'AUTHENTICATION_REQUIRED');
    assert.equal(res403.statusCode, 403);
  });

  it('should report REACHABLE with status code for 404 and 500 responses', async () => {
    const checker = new EnvironmentReachabilityChecker();

    const res404 = await checker.check(`${baseUrl}/not-found`, { timeoutMs: 3000 });
    assert.equal(res404.status, 'REACHABLE');
    assert.equal(res404.statusCode, 404);

    const res500 = await checker.check(`${baseUrl}/server-error`, { timeoutMs: 3000 });
    assert.equal(res500.status, 'REACHABLE');
    assert.equal(res500.statusCode, 500);
  });

  it('should fall back to GET when HEAD returns 405 Method Not Allowed', async () => {
    const checker = new EnvironmentReachabilityChecker();
    const result = await checker.check(`${baseUrl}/head-not-allowed`, { timeoutMs: 3000 });

    assert.equal(result.status, 'REACHABLE');
    assert.equal(result.statusCode, 200);
  });

  it('should handle request timeouts gracefully', async () => {
    const checker = new EnvironmentReachabilityChecker();
    const result = await checker.check(`${baseUrl}/slow`, { timeoutMs: 300 });

    assert.equal(result.status, 'TIMEOUT');
    assert.ok(result.message.includes('timed out'));
  });

  it('should report UNREACHABLE for connection refused', async () => {
    const checker = new EnvironmentReachabilityChecker();
    // Connect to a closed port
    const result = await checker.check('http://127.0.0.1:59999/test', { timeoutMs: 1000 });

    assert.equal(result.status, 'UNREACHABLE');
    assert.ok(
      result.message.includes('ECONNREFUSED') || result.message.includes('Connection failed'),
    );
  });
});
