/**
 * @file packages/core/src/environments/reachability-checker.ts
 * Bounded HTTP preflight reachability verification engine.
 */

import http from 'node:http';
import https from 'node:https';
import type { EnvironmentReachabilityResultDto, ReachabilityStatus } from '@ai-quality/contracts';
import { REACHABILITY_BOUNDS } from './environment-types.js';
import { UrlValidator } from './url-validator.js';
import { EnvironmentDomainError } from './environment-errors.js';

export interface ReachabilityCheckerOptions {
  readonly timeoutMs?: number;
  readonly ignoreHttpsErrors?: boolean;
}

export class EnvironmentReachabilityChecker {
  /**
   * Performs a bounded preflight reachability check against a target URL.
   * Never transmits sensitive credentials or downloads unbounded response bodies.
   */
  public async check(
    rawUrl: string,
    options: ReachabilityCheckerOptions = {},
  ): Promise<EnvironmentReachabilityResultDto> {
    const startTime = performance.now();
    const checkedAt = new Date().toISOString();

    let normalizedUrl: string;
    try {
      normalizedUrl = UrlValidator.validateAndNormalizeBaseUrl(rawUrl);
    } catch (err) {
      const durationMs = Math.round(performance.now() - startTime);
      return {
        status: 'INVALID_URL',
        statusCode: null,
        statusText: null,
        requestedUrl: rawUrl,
        finalUrl: null,
        responseTimeMs: durationMs,
        redirectCount: 0,
        message:
          err instanceof EnvironmentDomainError
            ? err.message
            : 'Invalid target application base URL format.',
        checkedAt,
      };
    }

    const timeoutMs = Math.max(
      REACHABILITY_BOUNDS.MIN_TIMEOUT_MS,
      Math.min(
        REACHABILITY_BOUNDS.MAX_TIMEOUT_MS,
        options.timeoutMs ?? REACHABILITY_BOUNDS.DEFAULT_TIMEOUT_MS,
      ),
    );

    const ignoreHttpsErrors = options.ignoreHttpsErrors ?? false;

    return this.executeHttpCheck(normalizedUrl, timeoutMs, ignoreHttpsErrors, startTime, checkedAt);
  }

  private executeHttpCheck(
    targetUrl: string,
    timeoutMs: number,
    ignoreHttpsErrors: boolean,
    startTime: number,
    checkedAt: string,
  ): Promise<EnvironmentReachabilityResultDto> {
    return new Promise<EnvironmentReachabilityResultDto>(resolve => {
      let redirectCount = 0;
      let currentUrl = targetUrl;
      const visitedUrls = new Set<string>([currentUrl]);

      const performRequest = (urlToFetch: string, method: 'HEAD' | 'GET') => {
        let parsed: URL;
        try {
          parsed = new URL(urlToFetch);
        } catch {
          const durationMs = Math.round(performance.now() - startTime);
          return resolve({
            status: 'INVALID_URL',
            statusCode: null,
            statusText: null,
            requestedUrl: targetUrl,
            finalUrl: urlToFetch,
            responseTimeMs: durationMs,
            redirectCount,
            message: `Invalid URL encountered during reachability check: "${urlToFetch}"`,
            checkedAt,
          });
        }

        const isHttps = parsed.protocol === 'https:';
        const client = isHttps ? https : http;

        const reqOptions: https.RequestOptions = {
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port || (isHttps ? 443 : 80),
          path: `${parsed.pathname || '/'}${parsed.search || ''}`,
          method,
          headers: {
            'User-Agent': 'AI-Quality-Platform-Preflight/1.0',
            Accept: '*/*',
          },
          timeout: timeoutMs,
          rejectUnauthorized: !ignoreHttpsErrors,
        };

        let isCompleted = false;

        const complete = (result: EnvironmentReachabilityResultDto) => {
          if (!isCompleted) {
            isCompleted = true;
            resolve(result);
          }
        };

        const req = client.request(reqOptions, res => {
          const statusCode = res.statusCode ?? 0;
          const statusText = res.statusMessage ?? '';

          // Handle 405 / 501 on HEAD -> Fallback to bounded GET
          if (method === 'HEAD' && (statusCode === 405 || statusCode === 501)) {
            req.destroy();
            return performRequest(urlToFetch, 'GET');
          }

          // Handle Redirects (301, 302, 303, 307, 308)
          if (
            (statusCode === 301 ||
              statusCode === 302 ||
              statusCode === 303 ||
              statusCode === 307 ||
              statusCode === 308) &&
            res.headers.location
          ) {
            redirectCount++;
            if (redirectCount > REACHABILITY_BOUNDS.MAX_REDIRECT_HOPS) {
              req.destroy();
              const durationMs = Math.round(performance.now() - startTime);
              return complete({
                status: 'REDIRECT_LOOP',
                statusCode,
                statusText,
                requestedUrl: targetUrl,
                finalUrl: urlToFetch,
                responseTimeMs: durationMs,
                redirectCount,
                message: `Exceeded maximum redirect limit (${REACHABILITY_BOUNDS.MAX_REDIRECT_HOPS} hops).`,
                checkedAt,
              });
            }

            let nextUrl: string;
            try {
              nextUrl = new URL(res.headers.location, urlToFetch).toString();
            } catch {
              const durationMs = Math.round(performance.now() - startTime);
              return complete({
                status: 'INVALID_URL',
                statusCode,
                statusText,
                requestedUrl: targetUrl,
                finalUrl: res.headers.location,
                responseTimeMs: durationMs,
                redirectCount,
                message: `Invalid redirect Location header received: "${res.headers.location}"`,
                checkedAt,
              });
            }

            if (visitedUrls.has(nextUrl)) {
              req.destroy();
              const durationMs = Math.round(performance.now() - startTime);
              return complete({
                status: 'REDIRECT_LOOP',
                statusCode,
                statusText,
                requestedUrl: targetUrl,
                finalUrl: nextUrl,
                responseTimeMs: durationMs,
                redirectCount,
                message: `Circular redirect detected to URL: "${nextUrl}".`,
                checkedAt,
              });
            }

            visitedUrls.add(nextUrl);
            currentUrl = nextUrl;
            req.destroy();
            return performRequest(nextUrl, method);
          }

          // Consume bounded response body to prevent hanging connections
          let bytesRead = 0;
          res.on('data', chunk => {
            bytesRead += chunk.length;
            if (bytesRead > REACHABILITY_BOUNDS.MAX_RESPONSE_BYTES) {
              res.destroy(); // Stop consuming further bytes
            }
          });

          res.on('end', () => {
            const durationMs = Math.round(performance.now() - startTime);
            let status: ReachabilityStatus = 'REACHABLE';
            let message = `Endpoint responded with HTTP ${statusCode} ${statusText}`.trim();

            if (statusCode === 401 || statusCode === 403) {
              status = 'AUTHENTICATION_REQUIRED';
              message = `Endpoint requires authentication (HTTP ${statusCode} ${statusText || (statusCode === 401 ? 'Unauthorized' : 'Forbidden')}).`;
            } else if (statusCode >= 200 && statusCode < 300) {
              status = 'REACHABLE';
              message = `Endpoint reachable (HTTP ${statusCode} ${statusText || 'OK'}).`;
            } else if (statusCode >= 400 && statusCode < 500) {
              status = 'REACHABLE';
              message = `Endpoint reachable with client status HTTP ${statusCode} ${statusText || 'Not Found'}.`;
            } else if (statusCode >= 500) {
              status = 'REACHABLE';
              message = `Endpoint reachable with server status HTTP ${statusCode} ${statusText || 'Server Error'}.`;
            }

            complete({
              status,
              statusCode,
              statusText,
              requestedUrl: targetUrl,
              finalUrl: currentUrl,
              responseTimeMs: durationMs,
              redirectCount,
              message,
              checkedAt,
            });
          });

          res.on('error', err => {
            const durationMs = Math.round(performance.now() - startTime);
            complete({
              status: 'UNREACHABLE',
              statusCode: null,
              statusText: null,
              requestedUrl: targetUrl,
              finalUrl: currentUrl,
              responseTimeMs: durationMs,
              redirectCount,
              message: `Response stream error: ${err.message}`,
              checkedAt,
            });
          });
        });

        req.on('timeout', () => {
          req.destroy();
          const durationMs = Math.round(performance.now() - startTime);
          complete({
            status: 'TIMEOUT',
            statusCode: null,
            statusText: null,
            requestedUrl: targetUrl,
            finalUrl: currentUrl,
            responseTimeMs: durationMs,
            redirectCount,
            message: `Connection timed out after ${timeoutMs}ms.`,
            checkedAt,
          });
        });

        req.on('error', err => {
          const durationMs = Math.round(performance.now() - startTime);
          const errCode = (err as { code?: string }).code || '';
          const errMsg = err.message || '';

          if (
            errCode.includes('CERT') ||
            errCode.includes('SELF_SIGNED') ||
            errCode.includes('DEPTH_ZERO') ||
            errMsg.includes('certificate') ||
            errMsg.includes('TLS') ||
            errMsg.includes('SSL')
          ) {
            complete({
              status: 'TLS_ERROR',
              statusCode: null,
              statusText: null,
              requestedUrl: targetUrl,
              finalUrl: currentUrl,
              responseTimeMs: durationMs,
              redirectCount,
              message: `TLS/SSL certificate validation error: ${errMsg}`,
              checkedAt,
            });
          } else {
            complete({
              status: 'UNREACHABLE',
              statusCode: null,
              statusText: null,
              requestedUrl: targetUrl,
              finalUrl: currentUrl,
              responseTimeMs: durationMs,
              redirectCount,
              message: `Unable to connect to target application (${errCode || errMsg}).`,
              checkedAt,
            });
          }
        });

        req.end();
      };

      performRequest(currentUrl, 'HEAD');
    });
  }
}
