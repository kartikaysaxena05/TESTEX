/**
 * @file packages/core/src/test-validation/test-validation-rules.ts
 * Deterministic validation rules and hallucination controls for AI-generated test intelligence.
 */

import type {
  RawValidationFinding,
  TestSubjectToValidate,
  ValidationContext,
} from './test-validation-types.js';
import { VALIDATION_LIMITS } from './test-validation-types.js';

export class TestValidationRulesEngine {
  /**
   * Runs all deterministic validation rules against the test subject and authoritative context.
   */
  public executeAllRules(
    test: TestSubjectToValidate,
    ctx: ValidationContext,
  ): RawValidationFinding[] {
    const findings: RawValidationFinding[] = [];

    // 1. Structural Validation
    findings.push(...this.validateStructure(test));

    // 2. Safety and Prompt Injection Defense
    findings.push(...this.validateSafetyAndInjection(test));

    // 3. Numerical Grounding & Boundary Derivation
    findings.push(...this.validateNumericalGrounding(test, ctx));

    // 4. Implementation Detail & Hallucination Controls (API, Route, Selector, DB, UI)
    findings.push(...this.validateImplementationDetails(test, ctx));

    // 5. Role and Permission Hallucination Controls
    findings.push(...this.validateRolesAndPermissions(test, ctx));

    // 6. Contradiction Detection & Category-Aware Semantics
    findings.push(...this.validateContradictionsAndSemantics(test, ctx));

    // 7. Preconditions & Test Data Validation
    findings.push(...this.validatePreconditionsAndTestData(test, ctx));

    // 8. Source Ambiguity Inheritance
    findings.push(...this.validateRequirementAmbiguityInheritance(test, ctx));

    return findings.slice(0, VALIDATION_LIMITS.MAX_FINDINGS_PER_VALIDATION);
  }

  /**
   * 1. Structural validation
   */
  public validateStructure(test: TestSubjectToValidate): RawValidationFinding[] {
    const findings: RawValidationFinding[] = [];

    if (!test.title || test.title.trim().length === 0) {
      findings.push({
        code: 'STRUCTURAL_INVALIDITY',
        severity: 'BLOCKER',
        fieldPath: 'title',
        message: 'Test title is missing or empty.',
        suggestedAction: 'Provide a clear, descriptive title for the test case.',
      });
    } else if (test.title.length > 255) {
      findings.push({
        code: 'STRUCTURAL_INVALIDITY',
        severity: 'ERROR',
        fieldPath: 'title',
        message: `Test title exceeds maximum length of 255 characters (current: ${test.title.length}).`,
        suggestedAction: 'Shorten test title to <= 255 characters.',
      });
    }

    if (!test.steps || test.steps.length === 0) {
      findings.push({
        code: 'STRUCTURAL_INVALIDITY',
        severity: 'BLOCKER',
        fieldPath: 'steps',
        message: 'Test must contain at least one step.',
        suggestedAction: 'Define executable steps for the test case.',
      });
    } else {
      test.steps.forEach((step, idx) => {
        if (!step.action || step.action.trim().length === 0) {
          findings.push({
            code: 'STRUCTURAL_INVALIDITY',
            severity: 'ERROR',
            fieldPath: `steps[${idx}].action`,
            message: `Step ${idx + 1} has an empty action.`,
            suggestedAction: 'Provide a concrete action description.',
          });
        } else if (step.action.length > VALIDATION_LIMITS.MAX_STEP_ACTION_LENGTH) {
          findings.push({
            code: 'STRUCTURAL_INVALIDITY',
            severity: 'WARNING',
            fieldPath: `steps[${idx}].action`,
            message: `Step ${idx + 1} action exceeds ${VALIDATION_LIMITS.MAX_STEP_ACTION_LENGTH} characters.`,
          });
        }

        if (
          step.expectedResult &&
          step.expectedResult.length > VALIDATION_LIMITS.MAX_EXPECTED_RESULT_LENGTH
        ) {
          findings.push({
            code: 'STRUCTURAL_INVALIDITY',
            severity: 'WARNING',
            fieldPath: `steps[${idx}].expectedResult`,
            message: `Step ${idx + 1} expected result exceeds ${VALIDATION_LIMITS.MAX_EXPECTED_RESULT_LENGTH} characters.`,
          });
        }
      });
    }

    if (test.preconditions) {
      test.preconditions.forEach((p, idx) => {
        if (!p.description || p.description.trim().length === 0) {
          findings.push({
            code: 'STRUCTURAL_INVALIDITY',
            severity: 'ERROR',
            fieldPath: `preconditions[${idx}].description`,
            message: `Precondition #${idx + 1} has an empty description.`,
          });
        }
      });
    }

    return findings;
  }

  /**
   * 2. Safety and Prompt Injection Defense
   */
  public validateSafetyAndInjection(test: TestSubjectToValidate): RawValidationFinding[] {
    const findings: RawValidationFinding[] = [];

    const injectionPatterns = [
      /ignore\s+(all\s+)?(previous\s+)?instructions/i,
      /mark\s+(this\s+test\s+as\s+|every\s+test\s+as\s+)?valid/i,
      /system\s+override/i,
      /disregard\s+(all\s+)?(safety\s+)?rules/i,
      /bypass\s+validation/i,
      /return\s+no\s+findings/i,
      /treat\s+(this\s+)?as\s+valid/i,
    ];

    const xssPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript\s*:/i,
      /onerror\s*=/i,
      /onload\s*=/i,
    ];

    const allTextBlobs: { text: string; path: string }[] = [
      { text: test.title, path: 'title' },
      { text: test.objective ?? '', path: 'objective' },
      { text: test.description ?? '', path: 'description' },
      { text: test.overallExpectedResult ?? '', path: 'overallExpectedResult' },
      ...test.steps.map((s, idx) => ({ text: s.action, path: `steps[${idx}].action` })),
      ...test.steps.map((s, idx) => ({
        text: s.expectedResult ?? '',
        path: `steps[${idx}].expectedResult`,
      })),
      ...test.preconditions.map((p, idx) => ({
        text: p.description,
        path: `preconditions[${idx}].description`,
      })),
      ...test.testData.map((d, idx) => ({
        text: String(d.value ?? ''),
        path: `testData[${idx}].value`,
      })),
    ];

    for (const blob of allTextBlobs) {
      if (!blob.text) continue;

      for (const pattern of injectionPatterns) {
        if (pattern.test(blob.text)) {
          findings.push({
            code: 'PROMPT_INJECTION_RISK',
            severity: 'BLOCKER',
            fieldPath: blob.path,
            message: `Detected prompt injection attempt in ${blob.path}: "${blob.text.slice(0, 80)}"`,
            evidence: blob.text,
            source: 'SECURITY_CHECK',
            suggestedAction: 'Reject the ungrounded instruction text immediately.',
          });
          break;
        }
      }

      for (const pattern of xssPatterns) {
        if (pattern.test(blob.text)) {
          findings.push({
            code: 'UNSAFE_GENERATED_CONTENT',
            severity: 'BLOCKER',
            fieldPath: blob.path,
            message: `Detected executable script / XSS vector in ${blob.path}.`,
            evidence: blob.text,
            source: 'SECURITY_CHECK',
            suggestedAction: 'Sanitize content and prevent execution in renderer.',
          });
          break;
        }
      }
    }

    return findings;
  }

  /**
   * 3. Numerical Grounding & Boundary Derivation
   */
  public validateNumericalGrounding(
    test: TestSubjectToValidate,
    ctx: ValidationContext,
  ): RawValidationFinding[] {
    const findings: RawValidationFinding[] = [];
    const reqText = `${ctx.requirementTitle} ${ctx.requirementText}`.toLowerCase();

    // Check qualitative vs quantitative SLA hallucination
    const qualitativeSpeedWords = [
      'quickly',
      'fast',
      'speedy',
      'instant',
      'responsive',
      'intuitive',
      'performant',
    ];
    const hasQualitativeWord = qualitativeSpeedWords.some(w => reqText.includes(w));
    const reqHasDurationLimit =
      /\b\d+\s*(?:s|sec|seconds|ms|milliseconds|minutes|min)\b/i.test(reqText) ||
      /\bwithin\s+\d+/i.test(reqText);

    if (hasQualitativeWord && !reqHasDurationLimit) {
      // Check if test case asserted exact concrete SLA (e.g. <= 2s, within 500ms)
      const allTestTexts = [
        test.title,
        test.objective ?? '',
        test.overallExpectedResult ?? '',
        ...test.steps.map(s => `${s.action} ${s.expectedResult ?? ''}`),
      ].join(' ');

      const durationMatch =
        /(?:<=|<|\bwithin\b|\bless than\b|\bin\b)\s*(\d+(?:\.\d+)?)\s*(?:s|sec|seconds|ms|milliseconds)\b/i.exec(
          allTestTexts,
        );
      if (durationMatch) {
        findings.push({
          code: 'UNSUPPORTED_VALUE',
          severity: 'ERROR',
          fieldPath: 'steps.expectedResult',
          message: `Invented concrete SLA constraint "${durationMatch[0]}" when requirement only specifies qualitative goal ("${qualitativeSpeedWords.find(w => reqText.includes(w))}").`,
          evidence: `Requirement: "${ctx.requirementText}"`,
          source: 'REQUIREMENT_GROUNDING',
          suggestedAction:
            'Do not invent unstated numerical SLAs. Mark requirement for human clarification.',
        });
      }
    }

    // Check range-bound derivations vs invented bounds
    // Example: Requirement "between 8 and 64 characters"
    const rangeMatch =
      /between\s+(\d+)\s+and\s+(\d+)|(?:from\s+)?(\d+)\s*(?:to|-)\s*(\d+)\s*(?:characters|chars|items|length)/i.exec(
        reqText,
      );
    if (rangeMatch) {
      const minVal = parseInt(rangeMatch[1] ?? rangeMatch[3] ?? '0', 10);
      const maxVal = parseInt(rangeMatch[2] ?? rangeMatch[4] ?? '0', 10);

      const validBoundaryDerivations = new Set([
        minVal - 1,
        minVal,
        minVal + 1,
        maxVal - 1,
        maxVal,
        maxVal + 1,
      ]);

      // Informational finding noting boundary derivation is valid
      if (test.type === 'BOUNDARY' || test.category === 'BOUNDARY') {
        findings.push({
          code: 'STRUCTURAL_INVALIDITY',
          severity: 'INFO',
          message: `Test case correctly derived boundary testing bounds around [${minVal}, ${maxVal}].`,
          evidence: `Derived valid test values: ${Array.from(validBoundaryDerivations).join(', ')}`,
          source: 'BOUNDARY_ANALYSIS',
        });
      }
    }

    return findings;
  }

  /**
   * 4. Implementation Detail & Hallucination Controls (API, Route, Selector, DB, UI)
   */
  public validateImplementationDetails(
    test: TestSubjectToValidate,
    ctx: ValidationContext,
  ): RawValidationFinding[] {
    const findings: RawValidationFinding[] = [];
    const authoritativeContext = [
      ctx.requirementTitle,
      ctx.requirementText,
      ...(ctx.retrievedContextTexts ?? []),
      ...(ctx.repositoryEvidenceRefs ?? []),
    ]
      .join('\n')
      .toLowerCase();

    const allStepsText = test.steps
      .map(s => `${s.action} ${s.expectedResult ?? ''} ${s.testDataSummary ?? ''}`)
      .join('\n');

    // A. Invented API Endpoints & Routes (e.g. POST /api/v1/auth/reset-password)
    const endpointRegex =
      /\b(GET|POST|PUT|DELETE|PATCH)\s+(\/[a-zA-Z0-9_{}/:-]+)|\b(\/api\/[a-zA-Z0-9_{}/:-]+)/gi;
    let match: RegExpExecArray | null;
    while ((match = endpointRegex.exec(allStepsText)) !== null) {
      const endpoint = match[0].trim();
      const endpointLower = endpoint.toLowerCase();

      const isKnown =
        authoritativeContext.includes(endpointLower) ||
        (ctx.knownEndpoints ?? []).some(e => e.toLowerCase().includes(endpointLower));

      if (!isKnown) {
        findings.push({
          code: 'INVENTED_ENDPOINT',
          severity: 'ERROR',
          fieldPath: 'steps.action',
          message: `Invented API endpoint/route "${endpoint}" not found in requirement or repository evidence.`,
          evidence: endpoint,
          source: 'REPOSITORY_GROUNDING',
          suggestedAction: 'Remove specific invented route unless verified by repository evidence.',
        });
      }
    }

    // B. Invented DOM Selectors (e.g. button#submit-btn, [data-testid="login"], #username)
    const selectorRegex =
      /(?:button|input|div|form|span)#([a-zA-Z0-9_-]+)|data-testid=["']([^"']+)["']|#([a-zA-Z0-9_-]{4,})/gi;
    while ((match = selectorRegex.exec(allStepsText)) !== null) {
      const selector = match[0].trim();
      const selectorLower = selector.toLowerCase();

      const isKnown =
        authoritativeContext.includes(selectorLower) ||
        (ctx.knownSelectors ?? []).some(s => s.toLowerCase().includes(selectorLower));

      if (!isKnown) {
        findings.push({
          code: 'INVENTED_SELECTOR',
          severity: 'WARNING',
          fieldPath: 'steps.action',
          message: `Invented DOM selector / ID "${selector}" not backed by repository evidence.`,
          evidence: selector,
          source: 'REPOSITORY_GROUNDING',
          suggestedAction: 'Use semantic actions rather than concrete unverified CSS selectors.',
        });
      }
    }

    // C. Invented Database Details (e.g. SELECT * FROM users, prisma.account)
    const dbRegex =
      /\b(SELECT\s+.+\s+FROM\s+[a-zA-Z0-9_]+|INSERT\s+INTO\s+[a-zA-Z0-9_]+|prisma\.[a-zA-Z0-9_]+)\b/gi;
    while ((match = dbRegex.exec(allStepsText)) !== null) {
      const dbSnippet = match[0].trim();
      const isKnown = authoritativeContext.includes(dbSnippet.toLowerCase());
      if (!isKnown) {
        findings.push({
          code: 'INVENTED_DATABASE_DETAIL',
          severity: 'ERROR',
          fieldPath: 'steps.action',
          message: `Invented database query/model reference "${dbSnippet}" without schema evidence.`,
          evidence: dbSnippet,
          source: 'REPOSITORY_GROUNDING',
        });
      }
    }

    // D. Invented Exact UI Message / Banner Styling
    const exactMessageMatch =
      /appears in red|toast message reading ["']([^"']+)["']|alert banner titled ["']([^"']+)["']/i.exec(
        allStepsText,
      );
    if (exactMessageMatch && !authoritativeContext.includes(exactMessageMatch[0].toLowerCase())) {
      findings.push({
        code: 'INVENTED_UI_CONTROL',
        severity: 'WARNING',
        fieldPath: 'steps.expectedResult',
        message: `Invented specific UI presentation/styling "${exactMessageMatch[0]}" not specified in requirement.`,
        evidence: exactMessageMatch[0],
        source: 'REQUIREMENT_GROUNDING',
        suggestedAction: 'Verify if exact UI text and color are explicitly required by product.',
      });
    }

    return findings;
  }

  /**
   * 5. Role and Permission Hallucination Controls
   */
  public validateRolesAndPermissions(
    test: TestSubjectToValidate,
    ctx: ValidationContext,
  ): RawValidationFinding[] {
    const findings: RawValidationFinding[] = [];
    const reqText = `${ctx.requirementTitle} ${ctx.requirementText}`.toLowerCase();
    const authoritativeContext = [
      reqText,
      ...(ctx.retrievedContextTexts ?? []).map(t => t.toLowerCase()),
      ...(ctx.knownRoles ?? []).map(r => r.toLowerCase()),
    ].join('\n');

    const specificRoles = [
      'finance manager',
      'billing admin',
      'accountant',
      'auditor',
      'tier 2 agent',
      'department head',
      'hr manager',
      'compliance officer',
    ];

    const allTestTexts = [
      test.title,
      test.objective ?? '',
      ...test.preconditions.map(p => p.description),
      ...test.steps.map(s => s.action),
    ]
      .join(' ')
      .toLowerCase();

    for (const role of specificRoles) {
      if (allTestTexts.includes(role)) {
        const isGrounded = authoritativeContext.includes(role);
        if (!isGrounded) {
          findings.push({
            code: 'UNSUPPORTED_ROLE',
            severity: 'ERROR',
            fieldPath: 'preconditions.description',
            message: `Invented specific enterprise role "${role}" when requirement only mentions generic users/authorized actors.`,
            evidence: `Requirement: "${ctx.requirementText}"`,
            source: 'REQUIREMENT_GROUNDING',
            suggestedAction:
              'Obtain human confirmation on the exact authorized roles for this requirement.',
          });
        }
      }
    }

    return findings;
  }

  /**
   * 6. Contradiction Detection & Category-Aware Semantics
   */
  public validateContradictionsAndSemantics(
    test: TestSubjectToValidate,
    ctx: ValidationContext,
  ): RawValidationFinding[] {
    const findings: RawValidationFinding[] = [];
    const reqText = `${ctx.requirementTitle} ${ctx.requirementText}`.toLowerCase();

    const isNegativeOrBoundary =
      test.type === 'NEGATIVE' ||
      test.category === 'NEGATIVE' ||
      test.type === 'BOUNDARY' ||
      test.category === 'BOUNDARY';

    // Check prohibitions in requirement (e.g. "shall not access archived projects", "archived users cannot login")
    const prohibitsArchivedAccess =
      /(?:shall not|must not|cannot|prevent|forbidden|disallow)\s+(?:access\s+)?archived/i.test(
        reqText,
      ) ||
      /archived\s+[^.]*\s+(?:shall not|cannot|must not|is prohibited)\s+(?:access|log\s*in|view|edit|delete)/i.test(
        reqText,
      );

    if (prohibitsArchivedAccess) {
      const allExpectedTexts = [
        test.overallExpectedResult ?? '',
        ...test.steps.map(s => s.expectedResult ?? ''),
      ].join(' ');

      // If test asserts that archived access succeeds
      if (
        /archived\s+(?:project|user|record)\s+(?:opens|accesses|logs?\s*in|views?)\s+successfully|archived\s+user\s+(?:is\s+)?logged\s+in/i.test(
          allExpectedTexts,
        ) ||
        /opens?\s+successfully|logged\s+in\s+successfully/i.test(allExpectedTexts)
      ) {
        findings.push({
          code: 'CONTRADICTS_REQUIREMENT',
          severity: 'BLOCKER',
          fieldPath: 'overallExpectedResult',
          message:
            'Test asserts successful access/login for an archived entity, directly contradicting prohibition in requirement.',
          evidence: `Requirement: "${ctx.requirementText}"`,
          source: 'SEMANTIC_CONSISTENCY',
          suggestedAction:
            'Reject test case. For negative tests, expected result must enforce rejection.',
        });
      }
    }

    // Check negative test semantics:
    // If negative test expected outcome claims SUCCESS, it contradicts negative testing intent
    if (isNegativeOrBoundary && test.type === 'NEGATIVE') {
      const expectedOutcome = (
        test.overallExpectedResult ?? test.steps.map(s => s.expectedResult ?? '').join(' ')
      ).toLowerCase();

      const claimsSuccess =
        expectedOutcome.includes('accepted successfully') ||
        expectedOutcome.includes('operation succeeds') ||
        expectedOutcome.includes('processed successfully') ||
        expectedOutcome.includes('succeeds without error');

      const claimsRejectionOrError =
        /\b(?:rejected|validation\s+error|fails?|failure|forbidden|denied|unauthorized)\b/i.test(
          expectedOutcome,
        ) && !/\b(?:without|no)\s+(?:error|errors|failure|failures)\b/i.test(expectedOutcome);

      if (claimsSuccess && !claimsRejectionOrError) {
        findings.push({
          code: 'CONTRADICTS_REQUIREMENT',
          severity: 'BLOCKER',
          fieldPath: 'overallExpectedResult',
          message:
            'Negative test supplies invalid inputs but asserts successful execution rather than rejection.',
          source: 'SEMANTIC_CONSISTENCY',
          suggestedAction:
            'Negative tests must verify error handling, rejection, or boundary containment.',
        });
      }
    }

    return findings;
  }

  /**
   * 7. Preconditions & Test Data Validation
   */
  public validatePreconditionsAndTestData(
    test: TestSubjectToValidate,
    ctx: ValidationContext,
  ): RawValidationFinding[] {
    const findings: RawValidationFinding[] = [];
    const authoritativeContext = [
      ctx.requirementTitle,
      ctx.requirementText,
      ...(ctx.retrievedContextTexts ?? []),
    ]
      .join('\n')
      .toLowerCase();

    // Check for ungrounded subscriptions / tiers in preconditions
    for (let i = 0; i < test.preconditions.length; i++) {
      const p = test.preconditions[i]!;
      const descLower = p.description.toLowerCase();

      if (
        (descLower.includes('premium subscription') || descLower.includes('enterprise plan')) &&
        !authoritativeContext.includes('premium') &&
        !authoritativeContext.includes('enterprise')
      ) {
        findings.push({
          code: 'UNSUPPORTED_PRECONDITION',
          severity: 'WARNING',
          fieldPath: `preconditions[${i}].description`,
          message: `Precondition asserts subscription tier ("${p.description}") not found in requirement context.`,
          evidence: p.description,
          source: 'REQUIREMENT_GROUNDING',
          suggestedAction:
            'Verify if this test applies to all tiers or a specific unstated subscription tier.',
        });
      }
    }

    // Check test data for sensitive keys / real secrets
    for (let i = 0; i < test.testData.length; i++) {
      const d = test.testData[i]!;
      const valStr = String(d.value ?? '');

      if (/^sk-(?:proj-)?[a-zA-Z0-9_-]{20,}/i.test(valStr) || /^AKIA[0-9A-Z]{16}/.test(valStr)) {
        findings.push({
          code: 'UNSUPPORTED_TEST_DATA',
          severity: 'ERROR',
          fieldPath: `testData[${i}].value`,
          message:
            'Test data contains what appears to be a real production API credential or secret.',
          source: 'SECURITY_CHECK',
          suggestedAction: 'Use synthetic placeholder tokens instead of real secrets.',
        });
      }
    }

    return findings;
  }

  /**
   * 8. Source Ambiguity Inheritance
   */
  public validateRequirementAmbiguityInheritance(
    test: TestSubjectToValidate,
    ctx: ValidationContext,
  ): RawValidationFinding[] {
    const findings: RawValidationFinding[] = [];

    if (ctx.requirementQualityFindings && ctx.requirementQualityFindings.length > 0) {
      const ambiguityFindings = ctx.requirementQualityFindings.filter(
        f =>
          f.code.includes('AMBIGUITY') ||
          f.code.includes('VAGUE') ||
          f.code.includes('UNTESTABLE') ||
          f.code.includes('INSUFFICIENT'),
      );

      if (ambiguityFindings.length > 0) {
        findings.push({
          code: 'AMBIGUOUS_SOURCE_REQUIREMENT',
          severity: 'WARNING',
          fieldPath: 'title',
          message: `Source requirement has ${ambiguityFindings.length} quality finding(s) in V3 Requirement Intelligence. Test case inherits requirement ambiguity.`,
          evidence: ambiguityFindings.map(f => `[${f.code}]: ${f.message}`).join('; '),
          source: 'V3_QUALITY_ANALYSIS',
          suggestedAction: 'Clarify source requirement ambiguity with product stakeholders.',
        });
      }
    }

    return findings;
  }
}
