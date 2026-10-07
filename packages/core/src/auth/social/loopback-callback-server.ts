/**
 * @file packages/core/src/auth/social/loopback-callback-server.ts
 * Ephemeral 127.0.0.1 loopback HTTP server for receiving OAuth/OIDC browser redirects.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http';
import type { AddressInfo } from 'net';
import { parse as parseUrl } from 'url';
import { parse as parseQueryString } from 'querystring';
import { SocialAuthCancelledError, SocialAuthExpiredError } from '../auth-errors.js';
import type { SocialAuthCallbackPayload } from './social-types.js';

export interface LoopbackServerOptions {
  readonly host?: string;
  readonly port?: number;
  readonly timeoutMs?: number;
}

export interface StartedLoopbackServer {
  readonly port: number;
  readonly redirectUri: string;
  readonly waitForCallback: () => Promise<SocialAuthCallbackPayload>;
  readonly close: (reason?: string) => Promise<void>;
}

export class LoopbackCallbackServer {
  /**
   * Starts an ephemeral loopback HTTP server on 127.0.0.1.
   */
  public static async start(options?: LoopbackServerOptions): Promise<StartedLoopbackServer> {
    const host = options?.host ?? '127.0.0.1';
    const requestedPort = options?.port ?? 0;
    const timeoutMs = options?.timeoutMs ?? 5 * 60 * 1000; // 5 minutes

    return new Promise((resolve, reject) => {
      let server: Server | null = null;
      let timer: NodeJS.Timeout | null = null;
      let settled = false;

      let resolveCallback: (payload: SocialAuthCallbackPayload) => void;
      let rejectCallback: (error: Error) => void;

      const callbackPromise = new Promise<SocialAuthCallbackPayload>((res, rej) => {
        resolveCallback = res;
        rejectCallback = rej;
      });

      const cleanup = async () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        if (server) {
          const currentServer = server;
          server = null;
          await new Promise<void>((cb) => currentServer.close(() => cb()));
        }
      };

      const handleRequest = async (req: IncomingMessage, res: ServerResponse) => {
        const parsedUrl = parseUrl(req.url ?? '', true);
        const pathname = parsedUrl.pathname;

        if (pathname !== '/callback') {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
          return;
        }

        const address = server?.address() as AddressInfo | null;
        const actualPort = address?.port ?? 0;
        const redirectUri = `http://${host}:${actualPort}/callback`;

        let rawBody = '';
        if (req.method === 'POST') {
          req.on('data', (chunk) => {
            rawBody += chunk.toString();
            // Guard against massive payloads (> 1MB)
            if (rawBody.length > 1024 * 1024) {
              req.destroy();
            }
          });

          req.on('end', async () => {
            const bodyParams = parseQueryString(rawBody);
            const state = String(bodyParams.state ?? parsedUrl.query.state ?? '');
            const code = bodyParams.code ? String(bodyParams.code) : parsedUrl.query.code ? String(parsedUrl.query.code) : undefined;
            const idToken = bodyParams.id_token ? String(bodyParams.id_token) : undefined;
            const userJson = bodyParams.user ? String(bodyParams.user) : undefined;
            const error = bodyParams.error ? String(bodyParams.error) : parsedUrl.query.error ? String(parsedUrl.query.error) : undefined;
            const errorDescription = bodyParams.error_description
              ? String(bodyParams.error_description)
              : parsedUrl.query.error_description
                ? String(parsedUrl.query.error_description)
                : undefined;

            sendHtmlResponse(res, error ? false : true);
            await cleanup();

            if (!settled) {
              settled = true;
              resolveCallback({
                state,
                code,
                idToken,
                userJson,
                error,
                errorDescription,
                redirectUri,
              });
            }
          });
        } else {
          // GET request (e.g. Google callback)
          const state = String(parsedUrl.query.state ?? '');
          const code = parsedUrl.query.code ? String(parsedUrl.query.code) : undefined;
          const error = parsedUrl.query.error ? String(parsedUrl.query.error) : undefined;
          const errorDescription = parsedUrl.query.error_description
            ? String(parsedUrl.query.error_description)
            : undefined;

          sendHtmlResponse(res, error ? false : true);
          await cleanup();

          if (!settled) {
            settled = true;
            resolveCallback({
              state,
              code,
              error,
              errorDescription,
              redirectUri,
            });
          }
        }
      };

      server = createServer((req, res) => {
        handleRequest(req, res).catch((err) => {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal Server Error');
          if (!settled) {
            settled = true;
            rejectCallback(err instanceof Error ? err : new Error(String(err)));
          }
        });
      });

      server.on('error', (err) => {
        if (!settled) {
          settled = true;
          reject(err);
          rejectCallback(err);
        }
      });

      server.listen(requestedPort, host, () => {
        const address = server?.address() as AddressInfo;
        const port = address.port;
        const redirectUri = `http://${host}:${port}/callback`;

        // Configure expiration timer
        timer = setTimeout(async () => {
          if (!settled) {
            settled = true;
            await cleanup();
            rejectCallback(
              new SocialAuthExpiredError('Social authentication timed out waiting for browser callback'),
            );
          }
        }, timeoutMs);

        const close = async (reason = 'Cancelled') => {
          if (!settled) {
            settled = true;
            await cleanup();
            rejectCallback(new SocialAuthCancelledError(reason));
          } else {
            await cleanup();
          }
        };

        resolve({
          port,
          redirectUri,
          waitForCallback: () => callbackPromise,
          close,
        });
      });
    });
  }
}

function sendHtmlResponse(res: ServerResponse, success: boolean): void {
  const title = success ? 'Authentication Successful' : 'Authentication Failed';
  const heading = success ? 'Authentication Complete' : 'Authentication Failed';
  const message = success
    ? 'You have successfully authenticated with the platform. You may safely close this browser window and return to the application.'
    : 'Authentication could not be completed. You may close this browser window and try again in the application.';
  const color = success ? '#22c55e' : '#ef4444';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: #0f172a;
      color: #f8fafc;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      padding: 24px;
      box-sizing: border-box;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 32px;
      max-width: 440px;
      text-align: center;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
    }
    .icon {
      width: 48px;
      height: 48px;
      margin: 0 auto 16px;
      color: ${color};
    }
    h1 {
      font-size: 20px;
      margin: 0 0 12px;
      font-weight: 600;
    }
    p {
      font-size: 14px;
      line-height: 1.5;
      color: #94a3b8;
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">
      ${
        success
          ? '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>'
          : '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>'
      }
    </div>
    <h1>${heading}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;

  res.writeHead(success ? 200 : 400, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(html),
    'Cache-Control': 'no-store, no-cache, must-revalidate',
  });
  res.end(html);
}
