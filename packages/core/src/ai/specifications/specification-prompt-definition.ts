/**
 * @file packages/core/src/ai/specifications/specification-prompt-definition.ts
 * Versioned prompt definition and structured schema for Phase 51 Test Specification Enrichment.
 */

import { z } from 'zod';
import type { PromptDefinition } from '../prompt-types.js';
import {
  TEST_SPECIFICATIONS_PROMPT_ID,
  TEST_SPECIFICATIONS_PROMPT_VERSION,
} from './specification-types.js';

export interface SpecificationPromptInput {
  readonly requirementKey: string;
  readonly title: string;
  readonly statement: string;
  readonly versionNumber: number;
  readonly classification?: string;
  readonly testabilityStatus?: string;
  readonly qualityFindings?: readonly {
    readonly code: string;
    readonly message: string;
  }[];
  readonly scenarios: readonly {
    readonly scenarioKey: string;
    readonly title: string;
    readonly objective: string;
    readonly rationale: string;
    readonly requirementAspect?: string;
    readonly category?: string;
  }[];
  readonly categorizedTestDesigns?: readonly {
    readonly category: string;
    readonly title: string;
    readonly objective: string;
    readonly rationale: string;
    readonly boundaryIntent?: {
      readonly kind?: string | null;
      readonly parameter?: string | null;
      readonly boundaryValue?: string | null;
      readonly isInclusive?: boolean | null;
    } | null;
    readonly validationIntent?: {
      readonly rule?: string | null;
      readonly fieldName?: string | null;
      readonly condition?: string | null;
    } | null;
  }[];
  readonly retrievedContextItems?: readonly {
    readonly id: string;
    readonly sourceType: string;
    readonly title: string;
    readonly text: string;
    readonly authorityTier: number;
  }[];
}

export const specificationPromptInputSchema = z.object({
  requirementKey: z.string().min(1),
  title: z.string().min(1),
  statement: z.string().min(1),
  versionNumber: z.number().int().min(1),
  classification: z.string().optional(),
  testabilityStatus: z.string().optional(),
  qualityFindings: z
    .array(
      z.object({
        code: z.string(),
        message: z.string(),
      }),
    )
    .optional(),
  scenarios: z.array(
    z.object({
      scenarioKey: z.string(),
      title: z.string(),
      objective: z.string(),
      rationale: z.string(),
      requirementAspect: z.string().optional(),
      category: z.string().optional(),
    }),
  ),
  categorizedTestDesigns: z
    .array(
      z.object({
        category: z.string(),
        title: z.string(),
        objective: z.string(),
        rationale: z.string(),
        boundaryIntent: z
          .object({
            kind: z.string().nullable().optional(),
            parameter: z.string().nullable().optional(),
            boundaryValue: z.string().nullable().optional(),
            isInclusive: z.boolean().nullable().optional(),
          })
          .nullable()
          .optional(),
        validationIntent: z
          .object({
            rule: z.string().nullable().optional(),
            fieldName: z.string().nullable().optional(),
            condition: z.string().nullable().optional(),
          })
          .nullable()
          .optional(),
      }),
    )
    .optional(),
  retrievedContextItems: z
    .array(
      z.object({
        id: z.string(),
        sourceType: z.string(),
        title: z.string(),
        text: z.string(),
        authorityTier: z.number(),
      }),
    )
    .optional(),
});

export const structuredSpecificationOutputSchema = z.object({
  specifications: z.array(
    z.object({
      scenarioKey: z.string().max(64).nullable().optional(),
      title: z.string().min(1).max(255),
      category: z.enum(['POSITIVE', 'NEGATIVE', 'BOUNDARY', 'VALIDATION']),
      preconditions: z
        .array(
          z.object({
            key: z.string().max(64).optional(),
            category: z.enum([
              'AUTHENTICATION',
              'AUTHORIZATION',
              'APPLICATION_STATE',
              'DATA_STATE',
              'ACCOUNT_STATE',
              'RESOURCE_STATE',
              'CONFIGURATION',
              'FEATURE_FLAG',
              'ENVIRONMENT',
              'DEPENDENCY',
              'SESSION_STATE',
              'WORKFLOW_STATE',
              'NONE',
              'OTHER',
            ]),
            description: z.string().min(1).max(2000),
            confidence: z.enum(['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']).default('HIGH'),
            sourceEvidenceRefs: z.array(z.string().max(128)).default([]),
            reviewRequired: z.boolean().default(false),
            assumptions: z.array(z.string().max(1000)).default([]),
          }),
        )
        .default([]),
      testData: z
        .array(
          z.object({
            key: z.string().max(64).optional(),
            name: z.string().min(1).max(256),
            dataType: z.enum([
              'STRING',
              'NUMBER',
              'BOOLEAN',
              'DATE',
              'DATETIME',
              'ENUM',
              'ENTITY',
              'CREDENTIAL',
              'FILE',
              'OTHER',
            ]),
            origin: z.enum(['EXPLICIT', 'DERIVED', 'EXAMPLE', 'GENERATED', 'UNKNOWN']),
            value: z.union([z.string(), z.number(), z.boolean()]).nullable().optional(),
            generator: z.string().max(512).nullable().optional(),
            constraint: z.string().max(1000).nullable().optional(),
            isSensitive: z.boolean().default(false),
            unknownReason: z.string().max(1000).nullable().optional(),
            confidence: z.enum(['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']).default('HIGH'),
            sourceEvidenceRefs: z.array(z.string().max(128)).default([]),
            reviewRequired: z.boolean().default(false),
          }),
        )
        .default([]),
      expectedResults: z
        .array(
          z.object({
            key: z.string().max(64).optional(),
            category: z.enum([
              'SUCCESS',
              'VALIDATION_ERROR',
              'AUTHORIZATION_DENIED',
              'AUTHENTICATION_REQUIRED',
              'STATE_CHANGE',
              'NO_STATE_CHANGE',
              'VALUE_RETURNED',
              'ENTITY_CREATED',
              'ENTITY_UPDATED',
              'ENTITY_DELETED',
              'NAVIGATION',
              'MESSAGE_DISPLAYED',
              'REQUEST_REJECTED',
              'BOUNDARY_ACCEPTED',
              'BOUNDARY_REJECTED',
              'OTHER',
              'UNKNOWN',
            ]),
            description: z.string().min(1).max(2000),
            observable: z.boolean().default(true),
            stateChange: z
              .object({
                from: z.string().max(256).nullable().optional(),
                to: z.string().max(256).nullable().optional(),
                entity: z.string().max(256).nullable().optional(),
              })
              .nullable()
              .optional(),
            nonChange: z
              .object({
                entity: z.string().max(256).nullable().optional(),
                preservedState: z.string().max(256).nullable().optional(),
              })
              .nullable()
              .optional(),
            exactMessageExpected: z.string().max(1000).nullable().optional(),
            httpStatusExpected: z.number().int().min(100).max(599).nullable().optional(),
            confidence: z.enum(['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']).default('HIGH'),
            sourceEvidenceRefs: z.array(z.string().max(128)).default([]),
            reviewRequired: z.boolean().default(false),
          }),
        )
        .default([]),
      assumptions: z.array(z.string().max(1000)).default([]),
      unknowns: z
        .array(
          z.object({
            name: z.string().max(256),
            reason: z.string().max(1000),
            reviewRequired: z.boolean().default(true),
          }),
        )
        .default([]),
      confidence: z.enum(['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']).default('HIGH'),
      reviewRequired: z.boolean().default(false),
      reviewReasons: z.array(z.string().max(1000)).default([]),
      sourceEvidenceRefs: z.array(z.string().max(128)).default([]),
    }),
  ),
  warnings: z.array(z.object({ code: z.string(), message: z.string() })).default([]),
});

export type StructuredSpecificationOutput = z.infer<typeof structuredSpecificationOutputSchema>;

export function createTestSpecificationPromptDefinition(): PromptDefinition<
  SpecificationPromptInput,
  StructuredSpecificationOutput
> {
  return {
    id: TEST_SPECIFICATIONS_PROMPT_ID,
    version: TEST_SPECIFICATIONS_PROMPT_VERSION,
    description:
      'Enriches generated test scenarios with concrete Preconditions, Test Data Requirements, Expected Results, and Unknowns without hallucination.',
    inputSchema: specificationPromptInputSchema as unknown as z.ZodType<SpecificationPromptInput>,
    outputSchema:
      structuredSpecificationOutputSchema as unknown as z.ZodType<StructuredSpecificationOutput>,
    defaultConfig: {
      temperature: 0.1,
      maxOutputTokens: 4096,
      timeoutMs: 45000,
    },
    buildMessages(input: SpecificationPromptInput) {
      const systemMessage = [
        'You are an expert Software Quality Engineer in an autonomous AI-driven Quality Engineering Platform.',
        'Your mission is to ENRICH candidate test scenarios and categorized test designs into concrete, grounded, detailed TEST SPECIFICATIONS.',
        '',
        'CRITICAL ARCHITECTURAL RULES AND ANTI-HALLUCINATION INVARIANTS:',
        '1. UNKNOWN > INVENTED: If a business limit, timeout, exact error message, HTTP status code, or UI element is NOT explicitly stated in the requirement or verified RAG context, DO NOT INVENT IT.',
        '   - Mark unstated test data values as `origin: "UNKNOWN"`, `value: null`, with `unknownReason` explaining the missing requirement detail, and set `reviewRequired: true`.',
        '   - Do NOT invent exact error message strings (e.g. "Invalid email or password") unless explicitly evidenced.',
        '   - Do NOT invent HTTP status codes (e.g. 403, 404, 500) unless confirmed in context.',
        '   - Do NOT invent CSS selectors, button labels, toast messages, or URL routes.',
        '2. PRECONDITIONS (STATE VS ACTION):',
        '   - Preconditions describe what MUST already be true before the test execution begins (e.g., "User is authenticated with ADMIN role", "Order status is PENDING").',
        '   - NEVER write actions or test steps as preconditions (e.g. DO NOT write "Click login button" as a precondition).',
        '   - Categorize each precondition accurately: AUTHENTICATION, AUTHORIZATION, APPLICATION_STATE, DATA_STATE, etc.',
        '3. TEST DATA ORIGIN & GENERATORS:',
        '   - EXPLICIT: Value is directly quoted from the authoritative requirement text.',
        '   - DERIVED: Value is mathematically or logically derived from explicit rules (e.g. boundary 9 from "between 10 and 50").',
        '   - EXAMPLE / GENERATED: Synthetic sample values (e.g. "alice@example.test" for a valid email format test). Clearly label as EXAMPLE or GENERATED, never EXPLICIT.',
        '   - UNKNOWN: The parameter exists but its threshold/limit is unspecified in context.',
        '   - Use generator specifications where appropriate: RANDOM_VALID_EMAIL, STRING_LENGTH(20), FUTURE_DATE, SYNTHETIC_VALID_CARD.',
        '   - NEVER generate real credit card numbers, production passwords, or real API keys. Set `isSensitive: true` for credential/security placeholders.',
        '4. OBSERVABLE EXPECTED RESULTS:',
        '   - Must describe testable, observable system behavior (e.g., "Order status changes from PENDING to CANCELLED", "Registration request is rejected due to missing mandatory field").',
        '   - For negative tests, specify rejection and non-change state (e.g. "Target user record remains unmodified in database").',
        '   - Avoid vague statements like "System works properly".',
        '5. ASSUMPTIONS & REVIEW REQUIRED:',
        '   - Document external test environment assumptions explicitly (e.g. "Test environment has active database connection").',
        '   - If the requirement is marked NOT_TESTABLE or contains vague terms (e.g. "blazing fast"), do not invent numbers; mark `reviewRequired: true` with rationale.',
        '6. PRESERVE SCENARIO IDENTITY: Every specification must correspond to one of the provided candidate scenario keys.',
      ].join('\n');

      const userLines: string[] = [
        '<authoritative_requirement>',
        `KEY: ${input.requirementKey}`,
        `TITLE: ${input.title}`,
        `VERSION: ${input.versionNumber}`,
        `CLASSIFICATION: ${input.classification ?? 'FUNCTIONAL'}`,
        `TESTABILITY_STATUS: ${input.testabilityStatus ?? 'TESTABLE'}`,
        `STATEMENT: ${input.statement}`,
        '</authoritative_requirement>',
      ];

      if (input.qualityFindings && input.qualityFindings.length > 0) {
        userLines.push('', '<quality_findings>');
        for (const finding of input.qualityFindings) {
          userLines.push(`- [${finding.code}] ${finding.message}`);
        }
        userLines.push('</quality_findings>');
      }

      if (input.scenarios && input.scenarios.length > 0) {
        userLines.push('', '<candidate_scenarios>');
        for (const s of input.scenarios) {
          userLines.push(
            `- SCENARIO_KEY: ${s.scenarioKey} | TITLE: ${s.title} | OBJECTIVE: ${s.objective} | RATIONALE: ${s.rationale}`,
          );
        }
        userLines.push('</candidate_scenarios>');
      }

      if (input.categorizedTestDesigns && input.categorizedTestDesigns.length > 0) {
        userLines.push('', '<categorized_test_designs>');
        for (const td of input.categorizedTestDesigns) {
          userLines.push(
            `- CATEGORY: ${td.category} | TITLE: ${td.title} | OBJECTIVE: ${td.objective}`,
          );
          if (td.boundaryIntent) {
            userLines.push(`  BOUNDARY_INTENT: ${JSON.stringify(td.boundaryIntent)}`);
          }
          if (td.validationIntent) {
            userLines.push(`  VALIDATION_INTENT: ${JSON.stringify(td.validationIntent)}`);
          }
        }
        userLines.push('</categorized_test_designs>');
      }

      if (input.retrievedContextItems && input.retrievedContextItems.length > 0) {
        userLines.push('', '<retrieved_context>');
        for (const ctx of input.retrievedContextItems) {
          userLines.push(
            `[ID: ${ctx.id}] [TYPE: ${ctx.sourceType}] [TIER: ${ctx.authorityTier}] ${ctx.title}: ${ctx.text}`,
          );
        }
        userLines.push('</retrieved_context>');
      }

      userLines.push(
        '',
        'Produce a JSON response conforming strictly to the structured specification output schema. Enrich all provided scenarios with preconditions, test data, and expected results following the UNKNOWN > INVENTED principle.',
      );

      return [
        { role: 'SYSTEM', content: systemMessage },
        { role: 'USER', content: userLines.join('\n') },
      ];
    },
  };
}
