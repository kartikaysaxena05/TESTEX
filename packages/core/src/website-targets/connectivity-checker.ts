/**
 * @file packages/core/src/website-targets/connectivity-checker.ts
 * Bounded connectivity verification engine with DNS validation, redirect safety,
 * TLS status inspection, and cancellation support.
 */

import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns/promises';
import type {
  ConnectivityCheckResultDto,
  EnvironmentType,
  TargetConnectionStatus,
} from '@ai-quality/contracts';
import { UrlSafetyEvaluator } from './url-safety.js';

export interface ConnectivityCheckerOptions {
  readonly timeoutMs?: number;
  readonly ignoreHttpsErrors?: boolean;
  readonly signal?: AbortSignal;
  readonly environmentType?: EnvironmentType;
}

export class WebsiteTargetConnectivityChecker {
  public static readonly DEFAULT_TIMEOUT_MS = 5000;
  public static readonly MAX_REDIRECTS = 5;
  public static readonly MAX_BODY_BYTES = 32768;

  /**
   * Performs an authoritative preflight connectivity test against a website URL.
   */
  public async check(
    rawUrl: string,
    options: ConnectivityCheckerOptions = {},
  ): Promise<ConnectivityCheckResultDto> {
    const startTime = performance.now();
    const checkedAt = new Date().toISOString();

    if (options.signal?.aborted) {
      return {
        status: 'UNKNOWN',
        statusCode: null,
        statusText: null,
        requestedUrl: rawUrl,
        resolvedFinalUrl: null,
        responseTimeMs: 0,
        redirectCount: 0,
        tlsValid: null,
        message: 'Connectivity check was cancelled before initiation.',
        checkedAt,
        dnsResolved: false,
      };
    }

    let normalized: ReturnType<typeof UrlSafetyEvaluator.normalizeAndValidate>;
    try {
      normalized = UrlSafetyEvaluator.normalizeAndValidate(
        rawUrl,
        options.environmentType ?? 'LOCAL',
      );
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - startTime);
      const errMsg = err instanceof Error ? err.message : 'Invalid website target URL.';
      return {
        status: 'BLOCKED',
        statusCode: null,
        statusText: null,
        requestedUrl: rawUrl,
        resolvedFinalUrl: null,
        responseTimeMs: durationMs,
        redirectCount: 0,
        tlsValid: null,
        message: errMsg,
        checkedAt,
        dnsResolved: false,
      };
    }

    // 1. DNS Resolution Check (skip for numeric IPs and localhost)
    let dnsResolved = true;
    const host = normalized.hostname;
    const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host.includes(':');

    if (!isIp && host !== 'localhost') {
      try {
        await dns.lookup(host);
      } catch (dnsErr: unknown) {
        dnsResolved = false;
        const durationMs = Math.round(performance.now() - startTime);
        const errMsg = dnsErr instanceof Error ? dnsErr.message : 'DNS lookup failed';
        return {
          status: 'UNREACHABLE',
          statusCode: null,
          statusText: null,
          requestedUrl: rawUrl,
          resolvedFinalUrl: null,
          responseTimeMs: durationMs,
          redirectCount: 0,
          tlsValid: null,
          message: `DNS resolution failed for host '${host}': ${errMsg}`,
          checkedAt,
          dnsResolved: false,
        };
      }
    }

    // 2. HTTP/HTTPS Probe
    const timeoutMs = Math.max(500, Math.min(30000, options.timeoutMs ?? WebsiteTargetConnectivityChecker.DEFAULT_TIMEOUT_MS));
    const ignoreHttpsErrors = options.ignoreHttpsErrors ?? false;

    return this.executeProbe(
      normalized.normalizedUrl,
      timeoutMs,
      ignoreHttpsErrors,
      options.signal,
      startTime,
      checkedAt,
      options.environmentType ?? 'LOCAL',
    );
  }

  private executeProbe(
    targetUrl: string,
    timeoutMs: number,
    ignoreHttpsErrors: boolean,
    signal: AbortSignal | undefined,
    startTime: number,
    checkedAt: string,
    environmentType: EnvironmentType,
  ): Promise<ConnectivityCheckResultDto> {
    return new Promise<ConnectivityCheckResultDto>(resolve => {
      let redirectCount = 0;
      let currentUrl = targetUrl;
      const visitedUrls = new Set<string>([currentUrl]);
      let activeRequest: http.ClientRequest | null = null;

      const onAbort = () => {
        if (activeRequest) {
          activeRequest.destroy();
        }
        const durationMs = Math.round(performance.now() - startTime);
        resolve({
          status: 'UNKNOWN',
          statusCode: null,
          statusText: null,
          requestedUrl: targetUrl,
          resolvedFinalUrl: currentUrl,
          responseTimeMs: durationMs,
          redirectCount,
          tlsValid: null,
          message: 'Connectivity check was cancelled by user.',
          checkedAt,
          dnsResolved: true,
        });
      };

      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
      }

      const performRequest = (urlToFetch: string, method: 'HEAD' | 'GET') => {
        if (signal?.aborted) {
          return onAbort();
        }

        let parsed: URL;
        try {
          parsed = new URL(urlToFetch);
        } catch {
          const durationMs = Math.round(performance.now() - startTime);
          return resolve({
            status: 'BLOCKED',
            statusCode: null,
            statusText: null,
            requestedUrl: targetUrl,
            resolvedFinalUrl: urlToFetch,
            responseTimeMs: durationMs,
            redirectCount,
            tlsValid: null,
            message: `Malformed destination URL: ${urlToFetch}`,
            checkedAt,
            dnsResolved: true,
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
            'User-Agent': 'AI-Quality-Platform-Target-Check/1.0',
            Accept: '*/*',
          },
          timeout: timeoutMs,
          rejectUnauthorized: !ignoreHttpsErrors,
        };

        let isCompleted = false;
        const complete = (result: ConnectivityCheckResultDto) => {
          if (!isCompleted) {
            isCompleted = true;
            if (signal) {
              signal.removeEventListener('abort', onAbort);
            }
            resolve(result);
          }
        };

        const req = client.request(reqOptions, res => {
          const statusCode = res.statusCode ?? 0;
          const statusText = res.statusMessage ?? '';

          // Fallback to GET if HEAD method not allowed
          if (method === 'HEAD' && (statusCode === 405 || statusCode === 501)) {
            req.destroy();
            return performRequest(urlToFetch, 'GET');
          }

          // Handle Redirects
          if (
            (statusCode === 301 ||
              statusCode === 302 ||
              statusCode === 303 ||
              statusCode === 307 ||
              statusCode === 308) &&
            res.headers.location
          ) {
            redirectCount++;
            if (redirectCount > WebsiteTargetConnectivityChecker.MAX_REDIRECTS) {
              req.destroy();
              const durationMs = Math.round(performance.now() - startTime);
              return complete({
                status: 'UNREACHABLE',
                statusCode,
                statusText,
                requestedUrl: targetUrl,
                resolvedFinalUrl: urlToFetch,
                responseTimeMs: durationMs,
                redirectCount,
                tlsValid: isHttps,
                message: `Exceeded maximum redirect hop limit (${WebsiteTargetConnectivityChecker.MAX_REDIRECTS}).`,
                checkedAt,
                dnsResolved: true,
              });
            }

            let nextUrl: string;
            try {
              nextUrl = new URL(res.headers.location, urlToFetch).toString();
            } catch {
              req.destroy();
              const durationMs = Math.round(performance.now() - startTime);
              return complete({
                status: 'BLOCKED',
                statusCode,
                statusText,
                requestedUrl: targetUrl,
                resolvedFinalUrl: res.headers.location,
                responseTimeMs: durationMs,
                redirectCount,
                tlsValid: isHttps,
                message: `Invalid redirect Location header: '${res.headers.location}'`,
                checkedAt,
                dnsResolved: true,
              });
            }

            // REDIRECT SAFETY: Validate destination URL against SSRF and cloud metadata
            try {
              UrlSafetyEvaluator.normalizeAndValidate(nextUrl, environmentType);
            } catch (safetyErr: unknown) {
              req.destroy();
              const durationMs = Math.round(performance.now() - startTime);
              const reason = safetyErr instanceof Error ? safetyErr.message : 'Blocked redirect';
              return complete({
                status: 'BLOCKED',
                statusCode,
                statusText,
                requestedUrl: targetUrl,
                resolvedFinalUrl: nextUrl,
                responseTimeMs: durationMs,
                redirectCount,
                tlsValid: null,
                message: `Redirect destination blocked: ${reason}`,
                checkedAt,
                dnsResolved: true,
              });
            }

            if (visitedUrls.has(nextUrl)) {
              req.destroy();
              const durationMs = Math.round(performance.now() - startTime);
              return complete({
                status: 'UNREACHABLE',
                statusCode,
                statusText,
                requestedUrl: targetUrl,
                resolvedFinalUrl: nextUrl,
                responseTimeMs: durationMs,
                redirectCount,
                tlsValid: isHttps,
                message: `Circular redirect loop detected: '${nextUrl}'`,
                checkedAt,
                dnsResolved: true,
              });
            }

            visitedUrls.add(nextUrl);
            currentUrl = nextUrl;
            req.destroy();
            return performRequest(nextUrl, method);
          }

          // Read bounded response
          let bytesRead = 0;
          res.on('data', chunk => {
            bytesRead += chunk.length;
            if (bytesRead > WebsiteTargetConnectivityChecker.MAX_BODY_BYTES) {
              res.destroy();
            }
          });

          res.on('end', () => {
            const durationMs = Math.round(performance.now() - startTime);
            let status: TargetConnectionStatus = 'VERIFIED_REACHABLE';
            let message = `Website responded with HTTP ${statusCode} ${statusText}`.trim();

            if (statusCode >= 200 && statusCode < 400) {
              status = 'VERIFIED_REACHABLE';
            } else if (statusCode >= 400 && statusCode < 600) {
              // Target is reachable and answering HTTP requests
              status = 'VERIFIED_REACHABLE';
              message = `Target reachable with HTTP ${statusCode} ${statusText}`.trim();
            }

            complete({
              status,
              statusCode,
              statusText,
              requestedUrl: targetUrl,
              resolvedFinalUrl: currentUrl,
              responseTimeMs: durationMs,
              redirectCount,
              tlsValid: isHttps ? true : null,
              message,
              checkedAt,
              dnsResolved: true,
            });
          });

          res.on('error', err => {
            const durationMs = Math.round(performance.now() - startTime);
            complete({
              status: 'UNREACHABLE',
              statusCode: null,
              statusText: null,
              requestedUrl: targetUrl,
              resolvedFinalUrl: currentUrl,
              responseTimeMs: durationMs,
              redirectCount,
              tlsValid: isHttps ? false : null,
              message: `Response stream error: ${err.message}`,
              checkedAt,
              dnsResolved: true,
            });
          });
        });

        activeRequest = req;

        req.on('timeout', () => {
          req.destroy();
          const durationMs = Math.round(performance.now() - startTime);
          complete({
            status: 'UNREACHABLE',
            statusCode: null,
            statusText: null,
            requestedUrl: targetUrl,
            resolvedFinalUrl: currentUrl,
            responseTimeMs: durationMs,
            redirectCount,
            tlsValid: isHttps ? false : null,
            message: `Connection timed out after ${timeoutMs}ms.`,
            checkedAt,
            dnsResolved: true,
          });
        });

        req.on('error', err => {
          const durationMs = Math.round(performance.now() - startTime);
          const errCode = (err as { code?: string }).code || '';
          const errMsg = err.message || '';

          const isTls =
            errCode.includes('CERT') ||
            errCode.includes('SELF_SIGNED') ||
            errCode.includes('DEPTH_ZERO') ||
            errMsg.includes('certificate') ||
            errMsg.includes('TLS') ||
            errMsg.includes('SSL');

          if (isTls) {
            complete({
              status: 'UNREACHABLE',
              statusCode: null,
              statusText: null,
              requestedUrl: targetUrl,
              resolvedFinalUrl: currentUrl,
              responseTimeMs: durationMs,
              redirectCount,
              tlsValid: false,
              message: `TLS/SSL certificate validation failed: ${errMsg}`,
              checkedAt,
              dnsResolved: true,
            });
          } else {
            complete({
              status: 'UNREACHABLE',
              statusCode: null,
              statusText: null,
              requestedUrl: targetUrl,
              resolvedFinalUrl: currentUrl,
              responseTimeMs: durationMs,
              redirectCount,
              tlsValid: isHttps ? false : null,
              message: `Unable to connect to target application: ${errCode || errMsg}`,
              checkedAt,
              dnsResolved: true,
            });
          }
        });

        req.end();
      };

      performRequest(currentUrl, 'HEAD');
    });
  }
}
