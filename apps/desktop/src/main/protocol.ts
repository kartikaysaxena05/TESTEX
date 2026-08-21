import electron from 'electron';
import { resolve, normalize, extname } from 'node:path';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { getLogger } from '@ai-quality/core';

export const APP_PROTOCOL_SCHEME = 'app' as const;
export const APP_RENDERER_HOST = 'renderer' as const;

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/**
 * Get Content-Type header value for a given file path.
 */
export function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

/**
 * Register the custom application protocol scheme with required security privileges.
 * MUST be called before app is ready.
 */
export function registerRendererScheme(): void {
  if (electron?.protocol) {
    electron.protocol.registerSchemesAsPrivileged([
      {
        scheme: APP_PROTOCOL_SCHEME,
        privileges: {
          standard: true,
          secure: true,
          supportFetchAPI: true,
          bypassCSP: false,
          stream: true,
        },
      },
    ]);
  }
}

/**
 * Pure helper function to resolve and validate requests against the renderer distribution directory.
 * Returns null if the request attempts path traversal, targets an invalid host, or does not exist.
 */
export function resolveRendererFilePath(rawUrl: string, rendererDistDir: string): string | null {
  try {
    const parsed = new URL(rawUrl);

    if (parsed.protocol !== `${APP_PROTOCOL_SCHEME}:`) {
      return null;
    }

    if (parsed.host !== APP_RENDERER_HOST) {
      return null;
    }

    // Decode and sanitize relative pathname
    let rawPath = decodeURIComponent(parsed.pathname);
    if (rawPath.startsWith('/')) {
      rawPath = rawPath.slice(1);
    }
    if (rawPath === '' || rawPath === '/') {
      rawPath = 'index.html';
    }

    // Null byte injection defense
    if (rawPath.includes('\0')) {
      return null;
    }

    const safeBase = resolve(rendererDistDir);
    const normalizedRelative = normalize(rawPath);
    const resolvedPath = resolve(safeBase, normalizedRelative);

    // Path traversal verification: resolved path must strictly reside inside the base directory
    if (!resolvedPath.startsWith(safeBase)) {
      return null;
    }

    // Ensure the path exists and is a regular file
    if (!existsSync(resolvedPath) || !statSync(resolvedPath).isFile()) {
      return null;
    }

    return resolvedPath;
  } catch {
    return null;
  }
}

/**
 * Register the active handler for the app:// custom protocol.
 */
export function setupCustomProtocolHandler(rendererDistDir: string): void {
  if (electron?.protocol) {
    electron.protocol.handle(APP_PROTOCOL_SCHEME, async request => {
      const resolved = resolveRendererFilePath(request.url, rendererDistDir);

      if (!resolved) {
        return new Response('Not Found or Access Denied', {
          status: 404,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }

      try {
        const fileContent = readFileSync(resolved);
        const mimeType = getMimeType(resolved);
        return new Response(fileContent, {
          status: 200,
          headers: {
            'Content-Type': mimeType,
            'X-Content-Type-Options': 'nosniff',
          },
        });
      } catch (err) {
        getLogger().error('protocol.file_read_failed', err);
        return new Response('Internal Server Error', {
          status: 500,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
    });
  }
}
