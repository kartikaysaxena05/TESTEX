/**
 * @file packages/core/src/execution/healing/healing-candidate-discovery.ts
 * Bounded interactive candidate discovery engine.
 */

import type { Page } from 'playwright';
import type { ExecutableTargetDescriptorDto } from '@ai-quality/contracts';
import {
  HEALING_BOUNDS,
  type IHealingCandidateDiscovery,
  type IElementSignatureExtractor,
  type ElementSemanticSignature,
} from './healing-types.js';
import { ElementSignatureExtractor } from './element-signature-extractor.js';

export class HealingCandidateDiscovery implements IHealingCandidateDiscovery {
  private readonly extractor: IElementSignatureExtractor;

  constructor(extractor?: IElementSignatureExtractor) {
    this.extractor = extractor ?? new ElementSignatureExtractor();
  }

  /**
   * Discovers candidate elements on the live page within strict bounds.
   */
  public async discoverCandidates(
    page: Page,
    target: ExecutableTargetDescriptorDto,
    maxCandidates: number = HEALING_BOUNDS.MAX_HEALING_CANDIDATES,
  ): Promise<readonly ElementSemanticSignature[]> {
    const candidateSignatures: ElementSemanticSignature[] = [];
    const limit = Math.min(Math.max(1, maxCandidates), HEALING_BOUNDS.MAX_HEALING_CANDIDATES);

    // 1. First probe targeted semantic queries based on target descriptors
    const targetedLocators = this.buildTargetedLocators(page, target);
    for (const loc of targetedLocators) {
      if (candidateSignatures.length >= limit) break;
      const count = await loc.count().catch(() => 0);
      const examineCount = Math.min(count, 5);
      for (let i = 0; i < examineCount; i++) {
        if (candidateSignatures.length >= limit) break;
        const sig = await this.extractor.extractSignature(loc.nth(i), candidateSignatures.length);
        if (sig && !this.isDuplicate(candidateSignatures, sig)) {
          candidateSignatures.push(sig);
        }
      }
    }

    // 2. If fewer than limit candidates found, probe general interactive elements
    if (candidateSignatures.length < limit) {
      const interactiveSelector =
        'button, input, select, textarea, a[href], [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="tab"], [role="menuitem"], [role="textbox"], [data-testid]';
      const interactiveLocators = page.locator(interactiveSelector);
      const totalInteractive = await interactiveLocators.count().catch(() => 0);
      const toExamine = Math.min(totalInteractive, HEALING_BOUNDS.MAX_DOM_NODES_EXAMINED);

      for (let i = 0; i < toExamine; i++) {
        if (candidateSignatures.length >= limit) break;
        const sig = await this.extractor.extractSignature(
          interactiveLocators.nth(i),
          candidateSignatures.length,
        );
        if (sig && !this.isDuplicate(candidateSignatures, sig)) {
          candidateSignatures.push(sig);
        }
      }
    }

    return candidateSignatures;
  }

  private buildTargetedLocators(page: Page, target: ExecutableTargetDescriptorDto) {
    const locators = [];

    // Role-based target query
    if (target.role) {
      try {
        locators.push(
          page.getByRole(target.role as any, {
            name: target.name ?? undefined,
          }),
        );
      } catch {
        // Ignore invalid role formatting
      }
    }

    // Label target query
    if (target.label) {
      locators.push(page.getByLabel(target.label));
    }

    // Placeholder target query
    if (target.placeholder) {
      locators.push(page.getByPlaceholder(target.placeholder));
    }

    // TestId target query
    if (target.testId) {
      locators.push(page.getByTestId(target.testId));
    }

    // Text target query
    if (target.text || target.name) {
      const textVal = target.text ?? target.name;
      if (textVal) {
        locators.push(page.getByText(textVal));
      }
    }

    // Tag / CSS target query
    if (target.css) {
      locators.push(page.locator(target.css));
    }

    return locators;
  }

  private isDuplicate(
    existing: readonly ElementSemanticSignature[],
    candidate: ElementSemanticSignature,
  ): boolean {
    return existing.some(item => {
      if (item.testId && candidate.testId && item.testId === candidate.testId) {
        return true;
      }
      return (
        item.tagName === candidate.tagName &&
        item.role === candidate.role &&
        item.accessibleName === candidate.accessibleName &&
        item.label === candidate.label &&
        item.inputType === candidate.inputType &&
        item.selectorRecipe === candidate.selectorRecipe
      );
    });
  }
}
