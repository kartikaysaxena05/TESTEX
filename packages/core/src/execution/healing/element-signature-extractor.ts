/**
 * @file packages/core/src/execution/healing/element-signature-extractor.ts
 * Extracts structured semantic element signatures from live page elements for candidate comparison.
 */

import type { Locator } from 'playwright';
import type { IElementSignatureExtractor, ElementSemanticSignature } from './healing-types.js';

export class ElementSignatureExtractor implements IElementSignatureExtractor {
  /**
   * Evaluates a live Playwright locator to extract a clean semantic signature.
   */
  public async extractSignature(
    locator: Locator,
    index: number,
  ): Promise<ElementSemanticSignature | null> {
    try {
      const isVisible = await locator.isVisible().catch(() => false);
      const isEnabled = await locator.isEnabled().catch(() => false);

      const raw = await locator
        .evaluate((el: HTMLElement) => {
          const tagName = el.tagName.toLowerCase();
          const role = el.getAttribute('role') || tagName;
          const accessibleName =
            el.getAttribute('aria-label') ||
            (el instanceof HTMLInputElement && el.value ? el.value : null) ||
            (el.innerText && el.innerText.trim()
              ? el.innerText.trim().slice(0, 100)
              : el.textContent && el.textContent.trim()
                ? el.textContent.trim().slice(0, 100)
                : null) ||
            el.getAttribute('title') ||
            el.getAttribute('alt') ||
            null;

          let label: string | null = null;
          if (el.id) {
            const labelEl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
            if (labelEl && labelEl instanceof HTMLElement) {
              label = labelEl.innerText?.trim().slice(0, 100) || null;
            }
          }
          if (!label) {
            const parentLabel = el.closest('label');
            if (parentLabel) {
              label = parentLabel.innerText?.trim().slice(0, 100) || null;
            }
          }

          const placeholder = el.getAttribute('placeholder') || null;
          const testId =
            el.getAttribute('data-testid') ||
            el.getAttribute('data-test') ||
            el.getAttribute('data-qa') ||
            el.getAttribute('id') ||
            null;

          const inputType = el instanceof HTMLInputElement ? el.type.toLowerCase() : null;
          const href = el instanceof HTMLAnchorElement ? el.href : null;

          const formEl = el.closest('form');
          const formAction = formEl ? formEl.getAttribute('action') || formEl.id || null : null;

          // Stable non-generated attributes
          const stableAttributes: Record<string, string> = {};
          const nameAttr = el.getAttribute('name');
          if (nameAttr) stableAttributes.name = nameAttr;
          const typeAttr = el.getAttribute('type');
          if (typeAttr) stableAttributes.type = typeAttr;
          const titleAttr = el.getAttribute('title');
          if (titleAttr) stableAttributes.title = titleAttr;
          const altAttr = el.getAttribute('alt');
          if (altAttr) stableAttributes.alt = altAttr;
          const ariaRole = el.getAttribute('role');
          if (ariaRole) stableAttributes.role = ariaRole;

          // Nearby contextual text (closest fieldset, header, or section)
          const container = el.closest(
            'fieldset, section, form, [role="group"], [role="region"], body',
          );
          const header =
            container?.querySelector('h1, h2, h3, h4, h5, h6, legend') ||
            document.querySelector('h1, h2, h3, h4, h5, h6');
          const contextText =
            header && header instanceof HTMLElement
              ? (header.innerText || header.textContent || '').trim().slice(0, 100)
              : null;

          return {
            tagName,
            role,
            accessibleName,
            label,
            placeholder,
            testId,
            inputType,
            href,
            formAction,
            stableAttributes,
            contextText,
          };
        })
        .catch(() => null);

      if (!raw) {
        return null;
      }

      const selectorRecipe = this.buildSelectorRecipe(raw);

      return {
        elementIndex: index,
        tagName: raw.tagName,
        role: raw.role,
        accessibleName: raw.accessibleName,
        label: raw.label,
        placeholder: raw.placeholder,
        testId: raw.testId,
        inputType: raw.inputType,
        href: raw.href,
        formAction: raw.formAction,
        stableAttributes: raw.stableAttributes,
        contextText: raw.contextText,
        isVisible,
        isEnabled,
        selectorRecipe,
        locator,
      };
    } catch {
      return null;
    }
  }

  private buildSelectorRecipe(raw: {
    readonly tagName: string;
    readonly role?: string | null;
    readonly accessibleName?: string | null;
    readonly testId?: string | null;
    readonly stableAttributes: Record<string, string>;
  }): string {
    if (raw.role && raw.accessibleName) {
      return `page.getByRole('${raw.role}', { name: '${raw.accessibleName.replace(/'/g, "\\'")}' })`;
    }
    if (raw.testId) {
      return `page.getByTestId('${raw.testId.replace(/'/g, "\\'")}')`;
    }
    if (raw.stableAttributes.name) {
      return `page.locator('${raw.tagName}[name="${raw.stableAttributes.name.replace(/"/g, '\\"')}"]')`;
    }
    if (raw.accessibleName) {
      return `page.getByText('${raw.accessibleName.replace(/'/g, "\\'")}')`;
    }
    return `page.locator('${raw.tagName}')`;
  }
}
