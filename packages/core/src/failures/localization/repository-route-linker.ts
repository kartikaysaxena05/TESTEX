/**
 * @file packages/core/src/failures/localization/repository-route-linker.ts
 * Links API endpoints, routes, and UI components to V2 indexed RepositoryFile and RepositorySymbol.
 */

import type { TechnicalLocalizationFacts } from './localization-types.js';

export interface RepositoryLinkResult {
  readonly repositoryFileId?: string | null;
  readonly repositorySymbolId?: string | null;
  readonly matchedFilePath?: string | null;
  readonly matchedSymbolName?: string | null;
  readonly matchedLineNumber?: number | null;
  readonly confidence: 'EXACT' | 'HIGH' | 'MODERATE' | 'NONE';
  readonly explanation: string;
}

export class RepositoryRouteLinker {
  /**
   * Attempts to match a target (URL endpoint, route path, or component selector)
   * against the project's indexed repository files and symbols.
   */
  public linkTarget(
    facts: TechnicalLocalizationFacts,
    targetIdentifier: string,
    targetKind: 'API_ENDPOINT' | 'UI_COMPONENT' | 'ROUTE',
  ): RepositoryLinkResult {
    if (!targetIdentifier || facts.repositoryFiles.length === 0) {
      return {
        confidence: 'NONE',
        explanation: 'No target identifier or indexed repository files available.',
      };
    }

    if (targetKind === 'API_ENDPOINT') {
      return this.linkApiEndpoint(facts, targetIdentifier);
    } else if (targetKind === 'UI_COMPONENT') {
      return this.linkUiComponent(facts, targetIdentifier);
    } else {
      return this.linkRoute(facts, targetIdentifier);
    }
  }

  private cleanPathname(urlOrPath: string): string {
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

  private linkApiEndpoint(
    facts: TechnicalLocalizationFacts,
    urlOrPath: string,
  ): RepositoryLinkResult {
    const pathname = this.cleanPathname(urlOrPath);
    // Tokenize: e.g. "/api/v1/auth/login" -> ["api", "v1", "auth", "login"]
    const segments = pathname
      .toLowerCase()
      .split('/')
      .filter(s => s.length > 0 && s !== 'api' && s !== 'v1' && s !== 'v2');
    if (segments.length === 0) {
      segments.push(pathname.toLowerCase());
    }

    let bestMatch: {
      file: (typeof facts.repositoryFiles)[0];
      symbol?: (typeof facts.repositoryFiles)[0]['symbols'][0];
      score: number;
      explanation: string;
    } | null = null;

    for (const file of facts.repositoryFiles) {
      const lowerRelPath = file.relativePath.toLowerCase();
      let score = 0;
      let reason = '';

      // Check file path matching tokens
      for (const seg of segments) {
        if (lowerRelPath.includes(seg)) {
          score += 30;
          reason += `Path contains "${seg}". `;
        }
      }

      // If file looks like a route or controller
      if (
        lowerRelPath.includes('route') ||
        lowerRelPath.includes('controller') ||
        lowerRelPath.includes('api')
      ) {
        score += 10;
      }

      // Check symbols in this file
      let matchedSymbol: (typeof facts.repositoryFiles)[0]['symbols'][0] | undefined;
      for (const sym of file.symbols) {
        const lowerSym = sym.name.toLowerCase();
        for (const seg of segments) {
          if (
            lowerSym === seg ||
            lowerSym === `handle${seg}` ||
            lowerSym === `post${seg}` ||
            lowerSym === `get${seg}` ||
            lowerSym.includes(seg)
          ) {
            score += 40;
            matchedSymbol = sym;
            reason += `Symbol "${sym.name}" matches "${seg}". `;
            break;
          }
        }
      }

      if (score > (bestMatch?.score ?? 0)) {
        bestMatch = { file, symbol: matchedSymbol, score, explanation: reason.trim() };
      }
    }

    if (!bestMatch || bestMatch.score < 20) {
      return {
        confidence: 'NONE',
        explanation: `No repository file or symbol matched endpoint "${pathname}".`,
      };
    }

    const confidence =
      bestMatch.score >= 60 ? 'EXACT' : bestMatch.score >= 30 ? 'HIGH' : 'MODERATE';
    return {
      repositoryFileId: bestMatch.file.id,
      repositorySymbolId: bestMatch.symbol?.id ?? null,
      matchedFilePath: bestMatch.file.relativePath,
      matchedSymbolName: bestMatch.symbol?.name ?? null,
      matchedLineNumber: bestMatch.symbol?.startLine ?? 1,
      confidence,
      explanation: `Mapped API endpoint "${pathname}" to ${bestMatch.file.relativePath}${bestMatch.symbol ? ` -> ${bestMatch.symbol.name}()` : ''}. (${bestMatch.explanation})`,
    };
  }

  private linkUiComponent(
    facts: TechnicalLocalizationFacts,
    componentOrSelector: string,
  ): RepositoryLinkResult {
    // Extract component-like tokens (e.g. "LoginForm", "[data-testid='login-button']", "#submit-btn")
    const cleaned = componentOrSelector.replace(/[[\]'"]|data-testid=|id=|class=/g, ' ').trim();
    const tokens = cleaned
      .split(/[-_\s.]+/)
      .filter(t => t.length > 2)
      .map(t => t.toLowerCase());

    let bestMatch: {
      file: (typeof facts.repositoryFiles)[0];
      symbol?: (typeof facts.repositoryFiles)[0]['symbols'][0];
      score: number;
      explanation: string;
    } | null = null;

    for (const file of facts.repositoryFiles) {
      const lowerRelPath = file.relativePath.toLowerCase();
      let score = 0;
      let reason = '';

      for (const tok of tokens) {
        if (lowerRelPath.includes(tok)) {
          score += 25;
          reason += `Path contains "${tok}". `;
        }
      }

      let matchedSymbol: (typeof facts.repositoryFiles)[0]['symbols'][0] | undefined;
      for (const sym of file.symbols) {
        const lowerSym = sym.name.toLowerCase();
        for (const tok of tokens) {
          if (lowerSym === tok || lowerSym.includes(tok)) {
            score += 35;
            matchedSymbol = sym;
            reason += `Symbol "${sym.name}" matches token "${tok}". `;
            break;
          }
        }
      }

      if (score > (bestMatch?.score ?? 0)) {
        bestMatch = { file, symbol: matchedSymbol, score, explanation: reason.trim() };
      }
    }

    if (!bestMatch || bestMatch.score < 20) {
      return {
        confidence: 'NONE',
        explanation: `No UI component or file matched identifier "${componentOrSelector}".`,
      };
    }

    const confidence = bestMatch.score >= 50 ? 'EXACT' : 'HIGH';
    return {
      repositoryFileId: bestMatch.file.id,
      repositorySymbolId: bestMatch.symbol?.id ?? null,
      matchedFilePath: bestMatch.file.relativePath,
      matchedSymbolName: bestMatch.symbol?.name ?? null,
      matchedLineNumber: bestMatch.symbol?.startLine ?? 1,
      confidence,
      explanation: `Mapped UI identifier "${componentOrSelector}" to ${bestMatch.file.relativePath}${bestMatch.symbol ? ` -> ${bestMatch.symbol.name}` : ''}.`,
    };
  }

  private linkRoute(facts: TechnicalLocalizationFacts, routePath: string): RepositoryLinkResult {
    const cleanRoute = this.cleanPathname(routePath);
    const tokens = cleanRoute
      .toLowerCase()
      .split('/')
      .filter(t => t.length > 0);

    let bestMatch: {
      file: (typeof facts.repositoryFiles)[0];
      score: number;
    } | null = null;

    for (const file of facts.repositoryFiles) {
      const lowerRelPath = file.relativePath.toLowerCase();
      let score = 0;

      for (const tok of tokens) {
        if (lowerRelPath.includes(tok)) {
          score += 20;
        }
      }

      if (score > (bestMatch?.score ?? 0)) {
        bestMatch = { file, score };
      }
    }

    if (!bestMatch || bestMatch.score < 20) {
      return {
        confidence: 'NONE',
        explanation: `No route file matched route "${cleanRoute}".`,
      };
    }

    return {
      repositoryFileId: bestMatch.file.id,
      matchedFilePath: bestMatch.file.relativePath,
      matchedLineNumber: 1,
      confidence: 'HIGH',
      explanation: `Mapped route "${cleanRoute}" to ${bestMatch.file.relativePath}.`,
    };
  }
}
