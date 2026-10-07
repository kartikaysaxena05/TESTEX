/**
 * @file packages/core/src/localization/signals/ui-component-correlator.ts
 * Correlates failed UI elements, DOM selectors, and component contexts with repository frontend components.
 */

import type { LocalizationContext, RawCandidateFact } from '../defect-localization-types.js';

export interface UiCorrelationResult {
  readonly facts: readonly RawCandidateFact[];
  readonly domSelector?: string | null;
  readonly uiComponentName?: string | null;
  readonly matchedComponentFile?: string | null;
  readonly matchedEventHandler?: string | null;
}

export class UiComponentCorrelator {
  /**
   * Correlates DOM elements, component selectors, and action targets with UI source components.
   */
  public correlate(context: LocalizationContext): UiCorrelationResult {
    const facts: RawCandidateFact[] = [];

    const domSelector =
      context.technicalLocalization?.domSelector ?? context.failedStep?.target ?? null;

    const uiComponentName =
      context.technicalLocalization?.uiComponentName ??
      this.inferComponentNameFromSelector(domSelector);

    if (!domSelector && !uiComponentName) {
      return {
        facts: [],
        domSelector: null,
        uiComponentName: null,
        matchedComponentFile: null,
        matchedEventHandler: null,
      };
    }

    const tokens: string[] = [];
    if (uiComponentName) tokens.push(uiComponentName.toLowerCase());
    if (domSelector) {
      const cleaned = domSelector
        .replace(/[#[\]"'.=_-]/g, ' ')
        .split(/\s+/)
        .filter(
          t =>
            t.length > 2 && !['data', 'testid', 'btn', 'input', 'button'].includes(t.toLowerCase()),
        );
      tokens.push(...cleaned.map(t => t.toLowerCase()));
    }

    let matchedComponentFile: string | null = null;
    let matchedEventHandler: string | null = null;

    for (const file of context.repositoryFiles) {
      const lowerPath = file.relativePath.toLowerCase();
      const isUiFile =
        lowerPath.endsWith('.tsx') ||
        lowerPath.endsWith('.jsx') ||
        lowerPath.endsWith('.vue') ||
        lowerPath.endsWith('.svelte') ||
        lowerPath.includes('/components/') ||
        lowerPath.includes('/views/') ||
        lowerPath.includes('/pages/');

      if (!isUiFile) continue;

      let score = 0;
      for (const token of tokens) {
        if (lowerPath.includes(token)) {
          score += 25;
        }
      }

      if (score === 0) continue;

      if (!matchedComponentFile) matchedComponentFile = file.relativePath;

      // Find matching component or handler symbol
      const componentSymbol = file.symbols.find(s => {
        const lowerName = s.name.toLowerCase();
        return tokens.some(t => lowerName.includes(t));
      });

      const handlerSymbol = file.symbols.find(s => {
        const lowerName = s.name.toLowerCase();
        return lowerName.startsWith('handle') || lowerName.startsWith('on');
      });

      if (handlerSymbol && !matchedEventHandler) {
        matchedEventHandler = handlerSymbol.name;
      }

      const matchingSymbol = componentSymbol ?? handlerSymbol;

      facts.push({
        filePath: file.relativePath,
        symbolName: matchingSymbol ? matchingSymbol.name : null,
        symbolKind: matchingSymbol ? matchingSymbol.kind : null,
        candidateType: 'COMPONENT',
        startLine: matchingSymbol ? matchingSymbol.startLine : null,
        endLine: matchingSymbol ? matchingSymbol.endLine : null,
        signal: 'DOM_COMPONENT',
        strength: score >= 50 ? 'STRONG' : 'MODERATE',
        description: `Failed UI selector '${domSelector ?? uiComponentName}' maps to component '${file.relativePath}'${matchingSymbol ? ` (symbol '${matchingSymbol.name}')` : ''}.`,
        provenance: `Step action target: ${domSelector ?? uiComponentName}`,
        rawReference: domSelector ?? uiComponentName ?? '',
      });
    }

    return {
      facts,
      domSelector,
      uiComponentName,
      matchedComponentFile,
      matchedEventHandler,
    };
  }

  private inferComponentNameFromSelector(selector?: string | null): string | null {
    if (!selector) return null;
    const match = selector.match(/data-testid=["']([a-zA-Z0-9_-]+)["']/);
    if (match && match[1]) {
      return match[1];
    }
    return null;
  }
}
