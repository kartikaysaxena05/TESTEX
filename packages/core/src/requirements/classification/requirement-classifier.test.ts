/**
 * @file packages/core/src/requirements/classification/requirement-classifier.test.ts
 * Pure unit tests for the deterministic RequirementClassifier.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RequirementClassifier } from './requirement-classifier.js';

describe('RequirementClassifier Unit Tests', () => {
  it('should classify functional requirement correctly', () => {
    const result = RequirementClassifier.classify({
      originalText: 'The system shall allow users to reset their password via email link.',
    });

    assert.equal(result.category, 'FUNCTIONAL');
    assert.equal(result.securityRelevant, true);
    assert.equal(result.domain, 'Authentication');
    assert.equal(result.module, 'Identity & Access');
    assert.ok(result.actors.includes('user'));
    assert.ok(result.tags.includes('authentication'));
    assert.ok(result.tags.includes('password'));
  });

  it('should classify pure security requirement correctly', () => {
    const result = RequirementClassifier.classify({
      originalText: 'The system shall encrypt all stored passwords using AES-256.',
    });

    assert.equal(result.category, 'NON_FUNCTIONAL');
    assert.equal(result.subCategory, 'SECURITY');
    assert.equal(result.securityRelevant, true);
    assert.equal(result.riskLevel, 'HIGH');
    assert.ok(result.reasons.includes('ENCRYPTION_PATTERN'));
    assert.ok(result.tags.includes('encryption'));
  });

  it('should classify performance requirement with quantitative duration correctly', () => {
    const result = RequirementClassifier.classify({
      originalText: 'The dashboard API shall respond within 500 ms under normal load.',
    });

    assert.equal(result.category, 'NON_FUNCTIONAL');
    assert.equal(result.subCategory, 'PERFORMANCE');
    assert.equal(result.performanceRelevant, true);
    assert.ok(result.reasons.includes('TIME_CONSTRAINT'));
    assert.ok(result.tags.includes('performance'));
    assert.ok(result.tags.includes('latency'));
  });

  it('should classify availability requirement correctly', () => {
    const result = RequirementClassifier.classify({
      originalText: 'The service shall maintain 99.9% monthly availability.',
    });

    assert.equal(result.category, 'NON_FUNCTIONAL');
    assert.equal(result.subCategory, 'AVAILABILITY');
    assert.equal(result.riskLevel, 'HIGH');
    assert.ok(result.reasons.includes('AVAILABILITY_PERCENTAGE'));
    assert.ok(result.tags.includes('availability'));
  });

  it('should classify accessibility and compliance standard requirement correctly', () => {
    const result = RequirementClassifier.classify({
      originalText: 'The user interface shall conform to WCAG 2.2 AA standards.',
    });

    assert.equal(result.category, 'NON_FUNCTIONAL');
    assert.equal(result.subCategory, 'ACCESSIBILITY');
    assert.equal(result.complianceRelevant, true);
    assert.ok(
      result.complianceStandards.includes('WCAG 2.2 AA') ||
        result.complianceStandards.includes('WCAG'),
    );
    assert.ok(result.reasons.includes('ACCESSIBILITY_STANDARD'));
  });

  it('should classify business rule requirement correctly', () => {
    const result = RequirementClassifier.classify({
      originalText: 'Orders above ₹100,000 must be approved by a manager.',
    });

    assert.equal(result.category, 'BUSINESS_RULE');
    assert.equal(result.subCategory, 'BUSINESS_LOGIC');
    assert.ok(result.reasons.includes('BUSINESS_RULE_PATTERN'));
    assert.ok(result.actors.includes('manager'));
  });

  it('should classify interface and integration requirement correctly', () => {
    const result = RequirementClassifier.classify({
      originalText: 'The system shall transmit order status to SAP via REST API.',
    });

    assert.equal(result.category, 'INTERFACE');
    assert.equal(result.subCategory, 'INTEGRATION');
    assert.ok(result.reasons.includes('EXTERNAL_SYSTEM_INTEGRATION'));
    assert.ok(result.tags.includes('api'));
    assert.ok(result.tags.includes('integration'));
  });

  it('should classify data retention requirement correctly', () => {
    const result = RequirementClassifier.classify({
      originalText: 'The system shall retain audit records for seven years.',
    });

    assert.equal(result.category, 'DATA');
    assert.equal(result.subCategory, 'RETENTION');
    assert.ok(result.reasons.includes('DATA_RETENTION_PATTERN'));
    assert.equal(result.domain, 'Audit & Governance');
  });

  it('should classify technical platform constraint correctly', () => {
    const result = RequirementClassifier.classify({
      originalText: 'The application must run on PostgreSQL 16 database.',
    });

    assert.equal(result.category, 'CONSTRAINT');
    assert.equal(result.subCategory, 'TECHNICAL_CONSTRAINT');
    assert.ok(result.reasons.includes('TECHNICAL_CONSTRAINT_PATTERN'));
  });

  it('should classify explicit compliance requirement without inventing regulations', () => {
    const result = RequirementClassifier.classify({
      originalText: 'The application shall comply with GDPR and HIPAA data protection mandates.',
    });

    assert.equal(result.complianceRelevant, true);
    assert.ok(result.complianceStandards.includes('GDPR'));
    assert.ok(result.complianceStandards.includes('HIPAA'));
    assert.ok(!result.complianceStandards.includes('PCI DSS'));
  });

  it('should return UNKNOWN for vague and vacuous requirements without inventing classifications', () => {
    const result = RequirementClassifier.classify({
      originalText: 'The platform shall provide appropriate functionality to users.',
    });

    assert.equal(result.category, 'UNKNOWN');
    assert.equal(result.subCategory, null);
    assert.equal(result.domain, null);
    assert.equal(result.riskLevel, 'UNSPECIFIED');
    assert.ok(result.reasons.includes('UNCLASSIFIABLE_VAGUE_TEXT'));
  });

  it('should preserve user-assigned priority when present', () => {
    const result = RequirementClassifier.classify({
      originalText: 'The dashboard API shall respond within 500 ms.',
      existingPriority: 'CRITICAL',
    });

    assert.equal(result.priority, 'CRITICAL');
  });

  it('should classify mixed requirements with multi-dimensional flags', () => {
    const result = RequirementClassifier.classify({
      originalText:
        'The payment API shall process transactions within 2 seconds and use TLS 1.3 encryption.',
    });

    assert.equal(result.securityRelevant, true);
    assert.equal(result.performanceRelevant, true);
    assert.ok(result.reasons.includes('ENCRYPTION_PATTERN'));
    assert.ok(result.reasons.includes('TIME_CONSTRAINT'));
  });

  it('should be 100% deterministic across 100 repeated runs', () => {
    const sample = 'Administrators must use multi-factor authentication to access remote server.';
    const first = RequirementClassifier.classify({ originalText: sample });

    for (let i = 0; i < 100; i++) {
      const current = RequirementClassifier.classify({ originalText: sample });
      assert.deepEqual(current, first);
    }
  });
});
