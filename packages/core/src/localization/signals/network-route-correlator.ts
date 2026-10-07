/**
 * @file packages/core/src/localization/signals/network-route-correlator.ts
 * Correlates observed HTTP network endpoints and routes with repository routes, handlers, and services.
 */

import type { LocalizationContext, RawCandidateFact } from '../defect-localization-types.js';

export interface NetworkCorrelationResult {
  readonly facts: readonly RawCandidateFact[];
  readonly observedEndpoint?: string | null;
  readonly httpMethod?: string | null;
  readonly statusCode?: number | null;
  readonly matchedRoutePath?: string | null;
  readonly matchedHandlerFile?: string | null;
  readonly matchedServiceFile?: string | null;
}

export class NetworkRouteCorrelator {
  /**
   * Cleans an endpoint URL or path into a normalized pathname.
   */
  public cleanPathname(urlOrPath: string): string {
    try {
      if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
        const parsed = new URL(urlOrPath);
        return parsed.pathname;
      }
    } catch {
      // ignore
    }
    const withoutQuery = urlOrPath.split('?')[0] ?? urlOrPath;
    return withoutQuery.split('#')[0] ?? withoutQuery;
  }

  /**
   * Correlates HTTP network evidence from failure context against repository files and symbols.
   */
  public correlate(context: LocalizationContext): NetworkCorrelationResult {
    const facts: RawCandidateFact[] = [];

    // Find failing or prominent network request
    const failingRequest =
      context.networkEvidence.find(r => r.statusCode && r.statusCode >= 400) ??
      context.networkEvidence[context.networkEvidence.length - 1];

    const observedEndpoint =
      failingRequest?.url ?? context.technicalLocalization?.httpEndpoint ?? null;
    const httpMethod = failingRequest?.method ?? 'GET';
    const statusCode = failingRequest?.statusCode ?? null;

    if (!observedEndpoint) {
      return {
        facts: [],
        observedEndpoint: null,
        httpMethod: null,
        statusCode: null,
        matchedRoutePath: null,
        matchedHandlerFile: null,
        matchedServiceFile: null,
      };
    }

    const pathname = this.cleanPathname(observedEndpoint);
    const segments = pathname
      .toLowerCase()
      .split('/')
      .filter(s => s.length > 0 && s !== 'api' && s !== 'v1' && s !== 'v2');

    let matchedRoutePath: string | null = pathname;
    let matchedHandlerFile: string | null = null;
    let matchedServiceFile: string | null = null;

    for (const file of context.repositoryFiles) {
      const lowerPath = file.relativePath.toLowerCase();
      let matchCount = 0;

      for (const seg of segments) {
        if (lowerPath.includes(seg)) {
          matchCount++;
        }
      }

      if (matchCount === 0) continue;

      const isRouteOrController =
        lowerPath.includes('route') ||
        lowerPath.includes('controller') ||
        lowerPath.includes('api') ||
        lowerPath.includes('handler') ||
        lowerPath.includes('endpoint');

      const isService =
        lowerPath.includes('service') ||
        lowerPath.includes('domain') ||
        lowerPath.includes('usecase') ||
        lowerPath.includes('manager');

      if (isRouteOrController) {
        if (!matchedHandlerFile) matchedHandlerFile = file.relativePath;

        // Check symbols in this file
        const matchingSymbol = file.symbols.find(
          s =>
            s.name.toLowerCase().includes(httpMethod.toLowerCase()) ||
            segments.some(seg => s.name.toLowerCase().includes(seg)),
        );

        facts.push({
          filePath: file.relativePath,
          symbolName: matchingSymbol ? matchingSymbol.name : null,
          symbolKind: matchingSymbol ? matchingSymbol.kind : null,
          candidateType: 'ROUTE',
          startLine: matchingSymbol ? matchingSymbol.startLine : null,
          endLine: matchingSymbol ? matchingSymbol.endLine : null,
          signal: 'NETWORK_ENDPOINT',
          strength: matchCount >= segments.length ? 'STRONG' : 'MODERATE',
          description: `HTTP ${httpMethod} endpoint '${pathname}' maps to API route '${file.relativePath}'${matchingSymbol ? ` handler symbol '${matchingSymbol.name}'` : ''}.`,
          provenance: `Observed network request: ${httpMethod} ${observedEndpoint} (status ${statusCode ?? 'N/A'})`,
          rawReference: `${httpMethod} ${observedEndpoint}`,
        });
      } else if (isService) {
        if (!matchedServiceFile) matchedServiceFile = file.relativePath;

        const matchingSymbol = file.symbols.find(s =>
          segments.some(seg => s.name.toLowerCase().includes(seg)),
        );

        facts.push({
          filePath: file.relativePath,
          symbolName: matchingSymbol ? matchingSymbol.name : null,
          symbolKind: matchingSymbol ? matchingSymbol.kind : null,
          candidateType: 'SERVICE',
          startLine: matchingSymbol ? matchingSymbol.startLine : null,
          endLine: matchingSymbol ? matchingSymbol.endLine : null,
          signal: 'ROUTE_MAPPING',
          strength: 'MODERATE',
          description: `Backend service '${file.relativePath}' aligns with endpoint domain '${segments.join('/')}'.`,
          provenance: `Domain keyword correlation for endpoint: ${pathname}`,
          rawReference: pathname,
        });
      }
    }

    return {
      facts,
      observedEndpoint,
      httpMethod,
      statusCode,
      matchedRoutePath,
      matchedHandlerFile,
      matchedServiceFile,
    };
  }
}
