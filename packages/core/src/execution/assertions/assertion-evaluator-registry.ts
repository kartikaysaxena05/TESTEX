/**
 * @file packages/core/src/execution/assertions/assertion-evaluator-registry.ts
 * Registry mapping AssertionType to concrete IAssertionEvaluator instances.
 */

import type { AssertionType } from '@ai-quality/contracts';
import type { IAssertionEvaluator } from './assertion-types.js';
import { InvalidAssertionTypeError } from './assertion-errors.js';
import { LocatorResolver } from '../actions/locator-resolver.js';
import { SecretRedactor } from '../sessions/secret-redactor.js';
import { VisibilityAssertionEvaluator } from './evaluators/visibility-assertion-evaluator.js';
import { ExistenceAssertionEvaluator } from './evaluators/existence-assertion-evaluator.js';
import { StateAssertionEvaluator } from './evaluators/state-assertion-evaluator.js';
import { TextAssertionEvaluator } from './evaluators/text-assertion-evaluator.js';
import { ValueAssertionEvaluator } from './evaluators/value-assertion-evaluator.js';
import { UrlAssertionEvaluator } from './evaluators/url-assertion-evaluator.js';
import { TitleAssertionEvaluator } from './evaluators/title-assertion-evaluator.js';
import { CountAssertionEvaluator } from './evaluators/count-assertion-evaluator.js';
import { AttributeAssertionEvaluator } from './evaluators/attribute-assertion-evaluator.js';

export class AssertionEvaluatorRegistry {
  private readonly evaluators: Map<AssertionType, IAssertionEvaluator> = new Map();

  constructor(locatorResolver?: LocatorResolver, secretRedactor?: SecretRedactor) {
    const resolver = locatorResolver ?? new LocatorResolver();
    const redactor = secretRedactor ?? new SecretRedactor();

    this.registerEvaluator(new VisibilityAssertionEvaluator(resolver, redactor));
    this.registerEvaluator(new ExistenceAssertionEvaluator(resolver, redactor));
    this.registerEvaluator(new StateAssertionEvaluator(resolver, redactor));
    this.registerEvaluator(new TextAssertionEvaluator(resolver, redactor));
    this.registerEvaluator(new ValueAssertionEvaluator(resolver, redactor));
    this.registerEvaluator(new UrlAssertionEvaluator(resolver, redactor));
    this.registerEvaluator(new TitleAssertionEvaluator(resolver, redactor));
    this.registerEvaluator(new CountAssertionEvaluator(resolver, redactor));
    this.registerEvaluator(new AttributeAssertionEvaluator(resolver, redactor));
  }

  public registerEvaluator(evaluator: IAssertionEvaluator): void {
    for (const type of evaluator.supportedTypes) {
      this.evaluators.set(type, evaluator);
    }
  }

  public getEvaluator(type: AssertionType): IAssertionEvaluator {
    const evaluator = this.evaluators.get(type);
    if (!evaluator) {
      throw new InvalidAssertionTypeError(type);
    }
    return evaluator;
  }
}
