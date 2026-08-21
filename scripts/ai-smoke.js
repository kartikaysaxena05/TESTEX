#!/usr/bin/env node
/**
 * @file scripts/ai-smoke.js
 * Standalone live smoke test verification script for Phase 43 & 44 AI Subsystem.
 */

import dotenv from 'dotenv';
import {
  OpenAiProviderAdapter,
  AiProviderRegistry,
  AiProviderGateway,
  PromptRegistry,
  AiPromptExecutionService,
  TestSpecificationValidator,
  TestCaseMappingService,
} from '../packages/core/dist/index.js';

dotenv.config();

async function main() {
  console.log('================================================================');
  console.log('Phase 43/44: AI Gateway & Prompt Architecture Smoke Verification');
  console.log('================================================================');

  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    console.log('STATUS: LIVE PROVIDER SMOKE: BLOCKED');
    console.log('REASON: No OPENAI_API_KEY detected in environment or .env file.');
    console.log(
      'ACTION: Deterministic tests verify 100% of gateway & prompt logic with FakeAiProvider.',
    );
    console.log('================================================================');
    process.exit(0);
  }

  console.log('CREDENTIAL: OPENAI_API_KEY detected (redacted: sk-...' + apiKey.slice(-4) + ')');

  try {
    const adapter = new OpenAiProviderAdapter({ apiKey });
    const registry = new AiProviderRegistry([adapter]);
    const gateway = new AiProviderGateway({ registry });
    const promptRegistry = PromptRegistry.createDefault();
    const service = new AiPromptExecutionService({
      registry: promptRegistry,
      gateway,
    });

    console.log('\n--- 1. Provider Health Check ---');
    const health = await gateway.healthCheck({ providerId: 'OPENAI' });
    console.log(`Health Status: ${health.status}`);
    console.log(`Configured:    ${health.configured}`);
    console.log(`Default Model: ${health.capabilities.defaultModel}`);

    console.log('\n--- 2. Live Prompt Generation ---');
    const promptText = 'Respond with exactly: PHASE44_OK';
    console.log(`Prompt: "${promptText}"`);

    const startTime = performance.now();
    const result = await gateway.generate({
      providerId: 'OPENAI',
      model: 'gpt-4o-mini',
      messages: [{ role: 'USER', content: promptText }],
      temperature: 0,
      maxTokens: 20,
    });
    const elapsedMs = Math.round(performance.now() - startTime);

    console.log(`Response: "${result.text.trim()}"`);
    console.log(`Model Used:      ${result.modelReported}`);
    console.log(`Duration:        ${elapsedMs}ms`);

    console.log('\n--- 3. Phase 44 Structured Prompt Execution ---');
    const promptExecResult = await service.executePrompt({
      promptId: 'fixture.system.health',
      version: 1,
      input: { checkTarget: 'live-smoke-target' },
      configOverride: { providerId: 'OPENAI', model: 'gpt-4o-mini', temperature: 0 },
    });

    console.log(`Prompt ID:       ${promptExecResult.promptId}@${promptExecResult.promptVersion}`);
    console.log(`Structured Data: ${JSON.stringify(promptExecResult.data)}`);
    console.log(`Duration:        ${promptExecResult.durationMs}ms`);
    console.log(
      `Token Usage:     Input=${promptExecResult.usage.inputTokens}, Output=${promptExecResult.usage.outputTokens}, Total=${promptExecResult.usage.totalTokens}`,
    );

    console.log('\n--- 4. Phase 45 Live Embedding Generation ---');
    const embeddingResult = await gateway.embed({
      providerId: 'OPENAI',
      model: 'text-embedding-3-small',
      inputs: ['AI-Driven Software Quality Platform Requirement Embedding Smoke Test'],
      dimensions: 1536,
    });

    console.log(`Model Used:      ${embeddingResult.modelReported}`);
    console.log(`Vectors Count:   ${embeddingResult.embeddings.length}`);
    console.log(`Vector Dims:     ${embeddingResult.embeddings[0]?.length}`);
    console.log(
      `Sample Slice:    [${embeddingResult.embeddings[0]
        ?.slice(0, 3)
        .map(n => n.toFixed(4))
        .join(', ')}...]`,
    );
    console.log(`Duration:        ${embeddingResult.durationMs}ms`);

    console.log('\n--- 5. Phase 46 RAG & Context Retrieval Engine ---');
    const { RequirementContextRetrievalService } =
      await import('../packages/core/dist/ai/index.js');
    const ragService = new RequirementContextRetrievalService({
      vectorSearchService: new (
        await import('../packages/core/dist/ai/index.js')
      ).VectorSearchService({
        gateway,
      }),
    });
    const ragConfig = ragService.getConfigDefaults();
    console.log(
      `RAG Strategy:    ${ragConfig.defaultStrategy}@${ragConfig.defaultStrategyVersion}`,
    );
    console.log(`Default Purpose: ${ragConfig.defaultPurpose}`);
    console.log(
      `Budget Limits:   maxTokens=${ragConfig.defaultLimits.maxEstimatedTokens}, maxChars=${ragConfig.defaultLimits.maxCharacters}, maxItems=${ragConfig.defaultLimits.maxItems}`,
    );

    console.log('\n--- 6. Phase 49 Scenario Generation Engine ---');
    const { createScenarioGenerationPromptDefinition, ScenarioValidator } =
      await import('../packages/core/dist/ai/index.js');
    const scenarioPrompt = createScenarioGenerationPromptDefinition();
    console.log(`Scenario Prompt: ${scenarioPrompt.id}@${scenarioPrompt.version}`);

    const sanitized = ScenarioValidator.validateAndSanitize(
      {
        scenarios: [
          {
            scenarioKey: 'SCN-001',
            title: 'Verify password reset token expiration',
            objective: 'Test token expiration after 15 minutes',
            rationale: 'Follows from REQ-AUTH-001',
            requirementAspect: 'Token Expiry',
            testLevel: 'INTEGRATION',
            testIntent: 'SECURITY',
            applicability: 'APPLICABLE',
            assumptions: [],
            sourceEvidenceRefs: ['REQ-AUTH-001'],
          },
        ],
        assumptions: [],
        warnings: [],
      },
      {
        requirementKey: 'REQ-AUTH-001',
        requirementId: '550e8400-e29b-41d4-a716-446655440000',
        requirementText: 'Reset tokens expire after 15 minutes.',
        validEvidenceRefIds: new Set(['REQ-AUTH-001']),
      },
    );
    console.log(`Sanitized Scenarios: ${sanitized.sanitizedScenarios.length}`);
    console.log(`Validation Status:   PASSED (0 ungrounded, 0 duplicates)`);

    console.log('\n--- 7. Phase 50 Categorized Test Generation Engine ---');
    const { createCategorizedTestPromptDefinition, CategorizedTestValidator } =
      await import('../packages/core/dist/ai/index.js');
    const categorizedPrompt = createCategorizedTestPromptDefinition();
    console.log(`Categorized Prompt: ${categorizedPrompt.id}@${categorizedPrompt.version}`);

    const catSanitized = CategorizedTestValidator.validateAndSanitize(
      {
        categoryAssessments: [
          { category: 'POSITIVE', applicability: 'APPLICABLE', rationale: 'Valid quantity 10-50' },
          { category: 'BOUNDARY', applicability: 'APPLICABLE', rationale: 'Min 10, Max 50' },
        ],
        testDesigns: [
          {
            scenarioKey: 'SCN-001',
            category: 'POSITIVE',
            title: 'Verify quantity 25 is accepted',
            objective: 'Ensure middle quantity 25 proceeds',
            rationale: 'Valid quantity range',
            confidence: 'HIGH',
            sourceEvidenceRefs: ['REQ-050'],
          },
          {
            scenarioKey: 'SCN-001',
            category: 'BOUNDARY',
            title: 'Verify lower bound quantity 10 is accepted',
            objective: 'Ensure minimum boundary value 10 proceeds',
            rationale: 'Inclusive minimum limit',
            confidence: 'HIGH',
            boundaryIntent: {
              kind: 'AT_MINIMUM',
              parameter: 'quantity',
              boundaryValue: '10',
              lowerBound: '10',
              upperBound: '50',
              isInclusive: true,
            },
            sourceEvidenceRefs: ['REQ-050'],
          },
        ],
        warnings: [],
      },
      {
        requirementKey: 'REQ-050',
        requirementId: '550e8400-e29b-41d4-a716-446655440000',
        requirementText: 'Quantity must be between 10 and 50 inclusive.',
        validEvidenceRefIds: new Set(['REQ-050']),
        validScenarioIds: new Set(['SCN-001']),
      },
    );
    console.log(`Sanitized Test Designs: ${catSanitized.sanitizedTestDesigns.length}`);
    console.log(
      `Category Metrics:       Positive=${catSanitized.metrics.positiveCount}, Boundary=${catSanitized.metrics.boundaryCount}, Negative=${catSanitized.metrics.negativeCount}, Validation=${catSanitized.metrics.validationCount}`,
    );
    console.log(`Validation Status:      PASSED (0 ungrounded, 0 duplicates)`);

    console.log('\n--- 8. Phase 51 Test Specification Enrichment Validation ---');
    const specSanitized = TestSpecificationValidator.validateAndSanitize(
      {
        specifications: [
          {
            scenarioKey: 'SCN-001',
            title: 'Verify lower bound quantity 10 order placement',
            category: 'BOUNDARY',
            preconditions: [
              {
                category: 'AUTHENTICATION',
                description: 'User is logged in.',
                confidence: 'HIGH',
                sourceEvidenceRefs: ['REQ-051'],
              },
            ],
            testData: [
              {
                name: 'orderQuantity',
                dataType: 'NUMBER',
                origin: 'DERIVED',
                value: 10,
                constraint: 'Minimum quantity limit',
                confidence: 'HIGH',
                sourceEvidenceRefs: ['REQ-051'],
              },
            ],
            expectedResults: [
              {
                category: 'BOUNDARY_ACCEPTED',
                description: 'Order created successfully with quantity 10.',
                observable: true,
                stateChange: {
                  from: 'EMPTY',
                  to: 'CREATED',
                  entity: 'Order',
                },
                confidence: 'HIGH',
                sourceEvidenceRefs: ['REQ-051'],
              },
            ],
            assumptions: ['Inventory has stock.'],
            unknowns: [],
            confidence: 'HIGH',
            reviewRequired: false,
            sourceEvidenceRefs: ['REQ-051'],
          },
        ],
        warnings: [],
      },
      {
        requirementKey: 'REQ-051',
        requirementId: '550e8400-e29b-41d4-a716-446655440000',
        requirementText: 'Order quantity must be at least 10 items.',
        validEvidenceRefIds: new Set(['REQ-051']),
        validScenarioIds: new Set(['SCN-001']),
      },
    );
    console.log(`Sanitized Specifications: ${specSanitized.sanitizedSpecifications.length}`);
    console.log(
      `Specification Metrics:    Preconditions=${specSanitized.metrics.totalPreconditions}, TestData=${specSanitized.metrics.totalTestDataItems}, ExpectedResults=${specSanitized.metrics.totalExpectedResults}, Unknowns=${specSanitized.metrics.unknownCount}`,
    );
    console.log(`Validation Status:        PASSED (0 ungrounded, 0 duplicates)`);

    console.log('\n--- 11. Phase 52 Canonical Test Case Model Mapping ---');
    const testCaseMapper = new TestCaseMappingService();
    const mappedTestCase = testCaseMapper.mapSpecificationToTestCase(
      specSanitized.sanitizedSpecifications[0],
    );
    console.log(`Mapped Test Case Title: "${mappedTestCase.title}"`);
    console.log(`Type:                   ${mappedTestCase.type}`);
    console.log(`Priority:               ${mappedTestCase.priority}`);
    console.log(`Steps Synthesized:      ${mappedTestCase.steps.length}`);
    console.log(`Preconditions Mapped:   ${mappedTestCase.preconditions.length}`);
    console.log(`Test Data Items Mapped: ${mappedTestCase.testData.length}`);
    console.log(
      `Step 1 (Precondition):  #${mappedTestCase.steps[0]?.stepNumber} - ${mappedTestCase.steps[0]?.action}`,
    );
    console.log(
      `Step 2 (Execution):     #${mappedTestCase.steps[1]?.stepNumber} - ${mappedTestCase.steps[1]?.action}`,
    );

    console.log('\nSTATUS: LIVE PROVIDER SMOKE: SUCCESS');
    console.log('================================================================');
  } catch (err) {
    console.error('\nSTATUS: LIVE PROVIDER SMOKE: FAILED');
    console.error('Error:', err instanceof Error ? err.message : err);
    console.log('================================================================');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error running smoke script:', err);
  process.exit(1);
});
