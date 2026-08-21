/**
 * @file packages/core/src/requirements/classification/requirement-classifier.ts
 * Pure, deterministic rule-based requirement classifier and multidimensional metadata enricher.
 *
 * CRITICAL INVARIANTS:
 * 1. PURE & DETERMINISTIC: Running 1,000 times on the same input produces identical output.
 * 2. NO HALLUCINATION: Never invents compliance laws, domains, actors, or risks not evidenced in source text.
 * 3. NO THIRD-PARTY LLM / AI: Pure regex, linguistic decomposition, and keyword rule matching.
 */

import {
  CLASSIFIER_VERSION,
  CLASSIFICATION_LIMITS,
  type RequirementClassificationDraft,
} from './classification-types.js';
import type {
  RequirementCategory,
  RequirementSubCategory,
  RequirementPriority,
  RequirementRiskLevel,
  RequirementCriticality,
  ClassificationReasonCode,
  RequirementRepresentationDto,
} from '@ai-quality/contracts';

interface ClassifierInput {
  readonly originalText: string;
  readonly structuredRepresentation?: RequirementRepresentationDto | null;
  readonly provenanceSectionPath?: string | null;
  readonly existingPriority?: RequirementPriority;
}

export class RequirementClassifier {
  /**
   * Deterministically classifies a requirement and extracts multidimensional metadata.
   */
  public static classify(input: ClassifierInput): RequirementClassificationDraft {
    const text = input.originalText.trim();
    const rep = input.structuredRepresentation;
    const reasons: ClassificationReasonCode[] = [];
    const tagsSet = new Set<string>();

    // 1. Check for Vague / Unclassifiable Text
    if (this.isVagueOrUnclassifiable(text)) {
      return {
        category: 'UNKNOWN',
        subCategory: null,
        domain: null,
        module: null,
        businessCapability: null,
        actors: rep?.actor ? [rep.actor] : [],
        securityRelevant: false,
        performanceRelevant: false,
        complianceRelevant: false,
        complianceStandards: [],
        priority: input.existingPriority ?? 'UNSPECIFIED',
        riskLevel: 'UNSPECIFIED',
        criticality: 'UNSPECIFIED',
        tags: [],
        reasons: ['UNCLASSIFIABLE_VAGUE_TEXT'],
        classifierVersion: CLASSIFIER_VERSION,
      };
    }

    // 2. Section Context
    if (input.provenanceSectionPath) {
      const sectionLower = input.provenanceSectionPath.toLowerCase();
      if (/security|auth/i.test(sectionLower)) {
        reasons.push('SECTION_CONTEXT');
      }
    }

    // 3. Extract Explicit Compliance Standards
    const complianceStandards = this.extractComplianceStandards(text);
    const complianceRelevant = complianceStandards.length > 0;
    if (complianceRelevant) {
      reasons.push('EXPLICIT_COMPLIANCE_STANDARD');
      for (const std of complianceStandards) {
        tagsSet.add(std.toLowerCase().replace(/\s+/g, '-'));
      }
    }

    // 4. Detect Security Signals
    const securitySignals = this.detectSecuritySignals(text);
    const securityRelevant = securitySignals.isSecurity;
    for (const reason of securitySignals.reasons) {
      if (!reasons.includes(reason)) reasons.push(reason);
    }
    for (const tag of securitySignals.tags) {
      tagsSet.add(tag);
    }

    // 5. Detect Performance Signals
    const performanceSignals = this.detectPerformanceSignals(text, rep);
    const performanceRelevant = performanceSignals.isPerformance;
    for (const reason of performanceSignals.reasons) {
      if (!reasons.includes(reason)) reasons.push(reason);
    }
    for (const tag of performanceSignals.tags) {
      tagsSet.add(tag);
    }

    // 6. Detect Availability Signals
    const availabilitySignals = this.detectAvailabilitySignals(text);
    if (availabilitySignals.isAvailability) {
      if (!reasons.includes('AVAILABILITY_PERCENTAGE')) {
        reasons.push('AVAILABILITY_PERCENTAGE');
      }
      tagsSet.add('availability');
    }

    // 7. Detect Usability & Accessibility Signals
    const accessibilitySignals = this.detectAccessibilitySignals(text);
    if (accessibilitySignals.isAccessibility) {
      if (!reasons.includes('ACCESSIBILITY_STANDARD')) {
        reasons.push('ACCESSIBILITY_STANDARD');
      }
      tagsSet.add('accessibility');
    }
    const usabilitySignals = this.detectUsabilitySignals(text);
    if (usabilitySignals.isUsability) {
      if (!reasons.includes('USABILITY_PATTERN')) {
        reasons.push('USABILITY_PATTERN');
      }
      tagsSet.add('usability');
    }

    // 8. Detect Business Rule Signals
    const businessRuleSignals = this.detectBusinessRuleSignals(text);
    if (businessRuleSignals.isBusinessRule) {
      if (!reasons.includes('BUSINESS_RULE_PATTERN')) {
        reasons.push('BUSINESS_RULE_PATTERN');
      }
      tagsSet.add('business-rule');
    }

    // 9. Detect Interface & Integration Signals
    const interfaceSignals = this.detectInterfaceSignals(text);
    if (interfaceSignals.isInterface) {
      if (!reasons.includes('EXTERNAL_SYSTEM_INTEGRATION')) {
        reasons.push('EXTERNAL_SYSTEM_INTEGRATION');
      }
      tagsSet.add('interface');
      for (const t of interfaceSignals.tags) tagsSet.add(t);
    }

    // 10. Detect Data & Retention Signals
    const dataRetentionSignals = this.detectDataRetentionSignals(text);
    if (dataRetentionSignals.isDataRetention) {
      if (!reasons.includes('DATA_RETENTION_PATTERN')) {
        reasons.push('DATA_RETENTION_PATTERN');
      }
      tagsSet.add('data-retention');
    }

    // 11. Detect Technical Constraint Signals
    const constraintSignals = this.detectTechnicalConstraintSignals(text);
    if (constraintSignals.isConstraint) {
      if (!reasons.includes('TECHNICAL_CONSTRAINT_PATTERN')) {
        reasons.push('TECHNICAL_CONSTRAINT_PATTERN');
      }
      tagsSet.add('constraint');
    }

    // 12. Derive Primary Category and SubCategory
    const { category, subCategory } = this.deriveCategory({
      securityRelevant,
      performanceRelevant,
      isAvailability: availabilitySignals.isAvailability,
      isAccessibility: accessibilitySignals.isAccessibility,
      isUsability: usabilitySignals.isUsability,
      isBusinessRule: businessRuleSignals.isBusinessRule,
      isInterface: interfaceSignals.isInterface,
      isDataRetention: dataRetentionSignals.isDataRetention,
      isConstraint: constraintSignals.isConstraint,
      complianceRelevant,
      text,
      rep,
    });

    if (category === 'FUNCTIONAL' && reasons.length === 0) {
      reasons.push('DEFAULT_FUNCTIONAL_HEURISTIC');
    }

    // 13. Extract Actors (Reuse Phase 37 actor + extract additional)
    const actors = this.deriveActors(text, rep);
    if (actors.length > 0 && !reasons.includes('STRUCTURED_ACTOR_PRESENT')) {
      reasons.push('STRUCTURED_ACTOR_PRESENT');
    }

    // 14. Extract Domain and Module
    const { domain, module: modName } = this.deriveDomainAndModule(text, category, subCategory);

    // 15. Extract Business Capability
    const businessCapability = this.deriveBusinessCapability(text, rep);

    // 16. Derive Priority
    let priority: RequirementPriority = 'UNSPECIFIED';
    if (input.existingPriority && input.existingPriority !== 'UNSPECIFIED') {
      priority = input.existingPriority;
    } else {
      priority = this.derivePriority(text, category, subCategory);
    }

    // 17. Derive Risk Level and Criticality
    const { riskLevel, criticality } = this.deriveRiskAndCriticality({
      text,
      category,
      subCategory,
      securityRelevant,
      complianceRelevant,
    });

    // 18. Build Bounded Canonical Tags
    const tags = Array.from(tagsSet)
      .map(t =>
        t
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9-_]/g, ''),
      )
      .filter(t => t.length >= 2 && t.length <= CLASSIFICATION_LIMITS.MAX_TAG_LENGTH)
      .slice(0, CLASSIFICATION_LIMITS.MAX_TAGS);

    return {
      category,
      subCategory,
      domain,
      module: modName,
      businessCapability,
      actors,
      securityRelevant,
      performanceRelevant,
      complianceRelevant,
      complianceStandards,
      priority,
      riskLevel,
      criticality,
      tags,
      reasons,
      classifierVersion: CLASSIFIER_VERSION,
    };
  }

  /**
   * Detects vague or vacuous requirement text that lacks substantive semantics.
   */
  private static isVagueOrUnclassifiable(text: string): boolean {
    const lower = text.toLowerCase();
    const vaguePatterns = [
      /^the\s+system\s+shall\s+work\s+properly\.?$/i,
      /^the\s+platform\s+shall\s+provide\s+appropriate\s+functionality.*$/i,
      /^the\s+application\s+should\s+be\s+good\.?$/i,
      /^tbd\.?$/i,
      /^to\s+be\s+determined\.?$/i,
    ];

    for (const pattern of vaguePatterns) {
      if (pattern.test(lower)) return true;
    }

    return false;
  }

  /**
   * Extracts explicit compliance standards (GDPR, HIPAA, PCI DSS, SOC 2, WCAG, etc.).
   */
  private static extractComplianceStandards(text: string): string[] {
    const standards: string[] = [];
    const patterns: { regex: RegExp; name: string }[] = [
      { regex: /\bGDPR\b/i, name: 'GDPR' },
      { regex: /\bHIPAA\b/i, name: 'HIPAA' },
      { regex: /\bPCI[- ]?DSS\b/i, name: 'PCI DSS' },
      { regex: /\bSOC[- ]?2\b/i, name: 'SOC 2' },
      { regex: /\bWCAG\s*(?:2\.[0-2])?(?:\s*(?:AA|AAA|A))?\b/i, name: 'WCAG' },
      { regex: /\bISO\s*27001\b/i, name: 'ISO 27001' },
      { regex: /\bFedRAMP\b/i, name: 'FedRAMP' },
      { regex: /\bCCPA\b/i, name: 'CCPA' },
      { regex: /\bSOX\b/i, name: 'SOX' },
    ];

    for (const p of patterns) {
      const match = text.match(p.regex);
      if (match) {
        // Capture matched text or canonical name
        standards.push(match[0].trim().toUpperCase());
      }
    }

    return Array.from(new Set(standards));
  }

  /**
   * Detects security-related keywords and patterns.
   */
  private static detectSecuritySignals(text: string): {
    isSecurity: boolean;
    reasons: ClassificationReasonCode[];
    tags: string[];
  } {
    const reasons: ClassificationReasonCode[] = [];
    const tags: string[] = [];
    const lower = text.toLowerCase();

    const authPattern =
      /\b(?:authenticate|authentication|mfa|multi-factor|two-factor|otp|login|logout|credentials?|passwords?|lockout|locked\s+out|failed\s+(?:login|attempts?))\b/i;
    const encryptPattern =
      /\b(?:encrypt|encryption|decrypt|decryption|aes(?:-\d+)?|rsa|tls(?:\s*1\.[23])?|https|ssl|cipher|hash|hashing|bcrypt|sha-256)\b/i;
    const authzPattern =
      /\b(?:authorize|authorization|role-based|rbac|permissions?|access\s+control|privileges?|unauthorized)\b/i;
    const secGeneralPattern =
      /\b(?:security|secret|jwt|firewall|xss|csrf|sql\s+injection|sanitize|tamper|vulnerability)\b/i;

    let hasMatch = false;

    if (authPattern.test(lower)) {
      hasMatch = true;
      reasons.push('AUTHENTICATION_PATTERN');
      tags.push('authentication');
      if (/password/i.test(lower)) tags.push('password');
      if (/mfa|multi-factor|otp/i.test(lower)) tags.push('mfa');
      if (/lockout|locked\s+out/i.test(lower)) tags.push('account-lockout');
    }

    if (encryptPattern.test(lower)) {
      hasMatch = true;
      reasons.push('ENCRYPTION_PATTERN');
      tags.push('encryption');
      if (/tls|https|ssl/i.test(lower)) tags.push('tls');
    }

    if (authzPattern.test(lower)) {
      hasMatch = true;
      reasons.push('AUTHORIZATION_PATTERN');
      tags.push('authorization');
      if (/rbac|role-based/i.test(lower)) tags.push('rbac');
    }

    if (secGeneralPattern.test(lower)) {
      hasMatch = true;
      reasons.push('EXPLICIT_SECURITY_TERM');
      tags.push('security');
    }

    return { isSecurity: hasMatch, reasons, tags };
  }

  /**
   * Detects performance-related signals.
   */
  private static detectPerformanceSignals(
    text: string,
    rep?: RequirementRepresentationDto | null,
  ): {
    isPerformance: boolean;
    reasons: ClassificationReasonCode[];
    tags: string[];
  } {
    const reasons: ClassificationReasonCode[] = [];
    const tags: string[] = [];
    const lower = text.toLowerCase();

    // Check time constraints in text or quantitative values
    const hasTimeConstraint =
      /\b(?:within|under|less\s+than)\s+\d+(?:\.\d+)?\s*(?:ms|milliseconds?|seconds?|secs?)\b/i.test(
        lower,
      ) ||
      /\b(?:latency|response\s+time|load\s+time|execution\s+time)\b/i.test(lower) ||
      (rep?.quantitativeValues?.some(
        qv =>
          qv.operator === 'WITHIN' &&
          ['seconds', 'second', 'ms', 'milliseconds', 'minutes'].includes(qv.unit || ''),
      ) ??
        false);

    const hasThroughput =
      /\b\d+(?:\.\d+)?\s*(?:requests|transactions|queries|messages|ops)\s*(?:per|\/)\s*(?:second|sec|minute|min)\b/i.test(
        lower,
      ) || /\b(?:throughput|concurrency|concurrent\s+users)\b/i.test(lower);

    if (hasTimeConstraint) {
      reasons.push('TIME_CONSTRAINT');
      tags.push('performance');
      tags.push('latency');
    }

    if (hasThroughput) {
      reasons.push('THROUGHPUT_PATTERN');
      tags.push('performance');
      tags.push('throughput');
    }

    return {
      isPerformance: hasTimeConstraint || hasThroughput,
      reasons,
      tags,
    };
  }

  /**
   * Detects availability percentage and uptime patterns.
   */
  private static detectAvailabilitySignals(text: string): { isAvailability: boolean } {
    const lower = text.toLowerCase();
    const isAvailability =
      /\b\d+(?:\.\d+)?%\s*(?:monthly\s+|annual\s+)?(?:availability|uptime)\b/i.test(lower) ||
      /\b(?:high\s+availability|uptime\s+guarantee|system\s+availability)\b/i.test(lower);

    return { isAvailability };
  }

  /**
   * Detects accessibility standards and patterns.
   */
  private static detectAccessibilitySignals(text: string): { isAccessibility: boolean } {
    const lower = text.toLowerCase();
    const isAccessibility =
      /\b(?:wcag|screen\s+reader|aria|keyboard\s+navigation|color\s+contrast|assistive\s+technology)\b/i.test(
        lower,
      );
    return { isAccessibility };
  }

  /**
   * Detects usability signals.
   */
  private static detectUsabilitySignals(text: string): { isUsability: boolean } {
    const lower = text.toLowerCase();
    const isUsability =
      /\b(?:user\s+friendly|intuitive|look\s+and\s+feel|user\s+experience|ease\s+of\s+use)\b/i.test(
        lower,
      );
    return { isUsability };
  }

  /**
   * Detects business rule conditions and constraints.
   */
  private static detectBusinessRuleSignals(text: string): { isBusinessRule: boolean } {
    const lower = text.toLowerCase();
    const isBusinessRule =
      /\b(?:an?\s+invoice\s+must\s+not\s+be\s+approved|orders?\s+above|discount\s+(?:applied|calculated)|approval\s+threshold|eligibility\s+criteria|business\s+rule)\b/i.test(
        lower,
      ) ||
      /\b(?:when\s+total\s+is\s+zero|if\s+balance\s+is\s+negative|tax\s+calculation)\b/i.test(
        lower,
      );
    return { isBusinessRule };
  }

  /**
   * Detects interface and external API integration patterns.
   */
  private static detectInterfaceSignals(text: string): {
    isInterface: boolean;
    tags: string[];
  } {
    const lower = text.toLowerCase();
    const tags: string[] = [];

    const interfaceKeywords = [
      { regex: /\b(?:rest\s+api|graphql|grpc|webhook|soap)\b/i, tag: 'api' },
      {
        regex: /\b(?:sap|salesforce|stripe|banking\s+gateway|payment\s+gateway)\b/i,
        tag: 'integration',
      },
      { regex: /\b(?:kafka|rabbitmq|sqs|event\s+bus|message\s+queue)\b/i, tag: 'messaging' },
      {
        regex: /\b(?:integrate\s+with|transmit\s+.*\s+to\s+.*\s+via|export\s+to\s+.*\s+via)\b/i,
        tag: 'integration',
      },
    ];

    let hasMatch = false;
    for (const item of interfaceKeywords) {
      if (item.regex.test(lower)) {
        hasMatch = true;
        tags.push(item.tag);
      }
    }

    return { isInterface: hasMatch, tags };
  }

  /**
   * Detects data retention and archival policies.
   */
  private static detectDataRetentionSignals(text: string): { isDataRetention: boolean } {
    const lower = text.toLowerCase();
    const isDataRetention =
      /\b(?:retain\s+(?:audit\s+)?records?\s+for|data\s+retention|archive\s+after\s+\d+|purge\s+data\s+after)\b/i.test(
        lower,
      );
    return { isDataRetention };
  }

  /**
   * Detects technical platform/environment constraints.
   */
  private static detectTechnicalConstraintSignals(text: string): { isConstraint: boolean } {
    const lower = text.toLowerCase();
    const isConstraint =
      /\b(?:must\s+(?:run|be\s+hosted|be\s+deployed)\s+on\s+(?:postgresql|mysql|aws|azure|kubernetes|docker|linux)|developed\s+in\s+typescript|compatible\s+with\s+node\.js)\b/i.test(
        lower,
      );
    return { isConstraint };
  }

  /**
   * Derives primary category and subcategory based on dominant detected signals.
   */
  private static deriveCategory(params: {
    securityRelevant: boolean;
    performanceRelevant: boolean;
    isAvailability: boolean;
    isAccessibility: boolean;
    isUsability: boolean;
    isBusinessRule: boolean;
    isInterface: boolean;
    isDataRetention: boolean;
    isConstraint: boolean;
    complianceRelevant: boolean;
    text: string;
    rep?: RequirementRepresentationDto | null;
  }): { category: RequirementCategory; subCategory: RequirementSubCategory | null } {
    const {
      securityRelevant,
      performanceRelevant,
      isAvailability,
      isAccessibility,
      isUsability,
      isBusinessRule,
      isInterface,
      isDataRetention,
      isConstraint,
      complianceRelevant,
      text,
    } = params;

    const lower = text.toLowerCase();

    // 1. Technical Constraints
    if (isConstraint) {
      return { category: 'CONSTRAINT', subCategory: 'TECHNICAL_CONSTRAINT' };
    }

    // 2. Data & Retention
    if (isDataRetention) {
      return { category: 'DATA', subCategory: 'RETENTION' };
    }

    // 3. Explicit Compliance Primary (e.g. "The application shall comply with GDPR")
    if (complianceRelevant && !securityRelevant && !isAccessibility) {
      return { category: 'COMPLIANCE', subCategory: null };
    }

    // 4. Business Rule
    if (isBusinessRule) {
      return { category: 'BUSINESS_RULE', subCategory: 'BUSINESS_LOGIC' };
    }

    // 5. Interface
    if (isInterface && !securityRelevant && !performanceRelevant) {
      return { category: 'INTERFACE', subCategory: 'INTEGRATION' };
    }

    // 6. Non-Functional Subcategories
    if (securityRelevant) {
      // If purely security constraint (e.g. "The system shall encrypt passwords", "Administrators must use MFA")
      const isPureSecurity =
        /\b(?:encrypt|encryption|mfa|multi-factor|lockout|store\s+plaintext)\b/i.test(lower);
      if (isPureSecurity) {
        return { category: 'NON_FUNCTIONAL', subCategory: 'SECURITY' };
      }
      // If it's a functional behavior with security relevance (e.g. "allow users to reset password")
      if (/\b(?:allow\s+users?\s+to\s+reset|create\s+user|log\s+in)\b/i.test(lower)) {
        return { category: 'FUNCTIONAL', subCategory: null };
      }
      return { category: 'NON_FUNCTIONAL', subCategory: 'SECURITY' };
    }

    if (performanceRelevant) {
      return { category: 'NON_FUNCTIONAL', subCategory: 'PERFORMANCE' };
    }

    if (isAvailability) {
      return { category: 'NON_FUNCTIONAL', subCategory: 'AVAILABILITY' };
    }

    if (isAccessibility) {
      return { category: 'NON_FUNCTIONAL', subCategory: 'ACCESSIBILITY' };
    }

    if (isUsability) {
      return { category: 'NON_FUNCTIONAL', subCategory: 'USABILITY' };
    }

    // 7. Default to Functional
    return { category: 'FUNCTIONAL', subCategory: null };
  }

  /**
   * Derives actors from text and structured representation.
   */
  private static deriveActors(text: string, rep?: RequirementRepresentationDto | null): string[] {
    const actorsSet = new Set<string>();

    if (rep?.actor) {
      actorsSet.add(rep.actor.toLowerCase());
    }

    const lower = text.toLowerCase();
    const commonActors = [
      'administrator',
      'admin',
      'registered user',
      'user',
      'manager',
      'customer',
      'guest',
      'auditor',
      'operator',
      'system',
      'service',
    ];

    for (const act of commonActors) {
      const regex = new RegExp(`\\b${act}s?\\b`, 'i');
      if (regex.test(lower)) {
        actorsSet.add(act);
      }
    }

    return Array.from(actorsSet).slice(0, CLASSIFICATION_LIMITS.MAX_ACTORS);
  }

  /**
   * Infers Domain and Module from explicit keywords.
   */
  private static deriveDomainAndModule(
    text: string,
    category: RequirementCategory,
    subCategory: RequirementSubCategory | null,
  ): { domain: string | null; module: string | null } {
    const lower = text.toLowerCase();

    if (/password|login|logout|mfa|auth|otp|credential|lockout/i.test(lower)) {
      return { domain: 'Authentication', module: 'Identity & Access' };
    }

    if (/invoice|payment|stripe|billing|refund|checkout|pricing/i.test(lower)) {
      return { domain: 'Billing & Payments', module: 'Accounts Payable' };
    }

    if (/order|shipment|fulfillment|cart|inventory|catalog/i.test(lower)) {
      return { domain: 'Order Management', module: 'Fulfillment' };
    }

    if (/report|metrics|analytics|dashboard/i.test(lower)) {
      return { domain: 'Reporting & Analytics', module: 'Metrics' };
    }

    if (/audit\s+log|audit\s+records?|retention/i.test(lower)) {
      return { domain: 'Audit & Governance', module: 'Compliance' };
    }

    if (/user\s+account|user\s+profile|employee/i.test(lower)) {
      return { domain: 'User Management', module: 'User Accounts' };
    }

    if (subCategory === 'SECURITY' || category === 'COMPLIANCE') {
      return { domain: 'Security & Compliance', module: null };
    }

    return { domain: null, module: null };
  }

  /**
   * Extracts Business Capability summary.
   */
  private static deriveBusinessCapability(
    text: string,
    rep?: RequirementRepresentationDto | null,
  ): string | null {
    if (rep?.action && rep?.object) {
      return `${rep.action} ${rep.object}`.slice(
        0,
        CLASSIFICATION_LIMITS.MAX_BUSINESS_CAPABILITY_LENGTH,
      );
    }

    const match = text.match(/shall\s+([a-z]+(?:\s+[a-z]+){1,4})/i);
    if (match && match[1]) {
      return match[1].trim().slice(0, CLASSIFICATION_LIMITS.MAX_BUSINESS_CAPABILITY_LENGTH);
    }

    return null;
  }

  /**
   * Derives conservative Priority.
   */
  private static derivePriority(
    text: string,
    category: RequirementCategory,
    subCategory: RequirementSubCategory | null,
  ): RequirementPriority {
    const lower = text.toLowerCase();

    if (/\b(?:critical|launch\s+blocker|mandatory|regulatory\s+requirement)\b/i.test(lower)) {
      return 'CRITICAL';
    }

    if (subCategory === 'SECURITY' || subCategory === 'PERFORMANCE' || category === 'COMPLIANCE') {
      return 'HIGH';
    }

    return 'UNSPECIFIED';
  }

  /**
   * Derives Risk Level and Criticality with explicit factors.
   */
  private static deriveRiskAndCriticality(params: {
    text: string;
    category: RequirementCategory;
    subCategory: RequirementSubCategory | null;
    securityRelevant: boolean;
    complianceRelevant: boolean;
  }): { riskLevel: RequirementRiskLevel; criticality: RequirementCriticality } {
    const { text, subCategory, securityRelevant, complianceRelevant } = params;
    const lower = text.toLowerCase();

    // Critical Risk signals: Remote admin MFA, payment transaction integrity, GDPR erasure
    if (
      (securityRelevant && /mfa.*admin|remote\s+admin/i.test(lower)) ||
      /payment\s+status|financial\s+transaction|gdpr.*erasure/i.test(lower)
    ) {
      return { riskLevel: 'CRITICAL', criticality: 'CRITICAL' };
    }

    // High Risk signals: Encryption, password protection, account lockout, compliance, 99.9% availability
    if (
      securityRelevant ||
      complianceRelevant ||
      subCategory === 'SECURITY' ||
      subCategory === 'AVAILABILITY'
    ) {
      return { riskLevel: 'HIGH', criticality: 'HIGH' };
    }

    // Medium Risk signals: Performance latency, business logic, integrations
    if (
      subCategory === 'PERFORMANCE' ||
      subCategory === 'BUSINESS_LOGIC' ||
      subCategory === 'INTEGRATION'
    ) {
      return { riskLevel: 'MEDIUM', criticality: 'MEDIUM' };
    }

    return { riskLevel: 'UNSPECIFIED', criticality: 'UNSPECIFIED' };
  }
}
