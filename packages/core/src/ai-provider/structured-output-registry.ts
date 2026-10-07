/**
 * @file packages/core/src/ai-provider/structured-output-registry.ts
 * Versionable and explicit schema registry for V9 Phase 132 Structured Output.
 * Provides canonical test schemas (e.g., TestPlan, BugReportSummary, ModelTaskResult)
 * with Zod validation, JSON schema export, prompt guidance generation, and security boundaries.
 */

import { z, type ZodTypeAny, ZodError } from 'zod';
import type {
  StructuredValidationErrorDto,
  StructuredValidationStatus,
} from '@ai-quality/contracts';
import { AiStructuredSchemaInvalidError } from './ai-provider-errors.js';

export interface RegisteredSchemaEntry<T = unknown> {
  readonly name: string;
  readonly version: number;
  readonly description: string;
  readonly schema: z.ZodType<T>;
  readonly samplePromptGuidance: string;
}

// -----------------------------------------------------------------------------
// Canonical Built-in Schemas (Phase 132)
// -----------------------------------------------------------------------------

/**
 * TestPlan canonical schema (v1) as specified in Phase 132 requirements:
 * TestPlan
 * ├── name
 * ├── objective
 * ├── steps[]
 * │   ├── action
 * │   ├── target
 * │   └── expected
 * └── metadata
 */
export const testPlanStepSchema = z.object({
  action: z.string().min(1, 'Action description is required').max(1000),
  target: z.string().min(1, 'Target element or component is required').max(1000),
  expected: z.string().min(1, 'Expected outcome is required').max(2000),
});

export const testPlanSchemaV1 = z.object({
  name: z.string().min(1, 'Test plan name is required').max(256),
  objective: z.string().min(1, 'Objective is required').max(2000),
  steps: z.array(testPlanStepSchema).min(1, 'At least one step is required').max(100),
  metadata: z.record(z.unknown()).optional(),
});
export type TestPlanSchemaDto = z.infer<typeof testPlanSchemaV1>;

/**
 * BugReportSummary canonical schema (v1)
 */
export const bugReportSummarySchemaV1 = z.object({
  title: z.string().min(1).max(256),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  component: z.string().min(1).max(128),
  summary: z.string().min(1).max(4000),
  reproductionSteps: z.array(z.string()).min(1).max(50),
  expectedBehavior: z.string().min(1).max(2000),
  actualBehavior: z.string().min(1).max(2000),
});
export type BugReportSummarySchemaDto = z.infer<typeof bugReportSummarySchemaV1>;

/**
 * KeyValueClassification canonical schema (v1)
 */
export const classificationResultSchemaV1 = z.object({
  category: z.string().min(1).max(64),
  confidence: z.number().min(0).max(1),
  tags: z.array(z.string().min(1).max(64)).max(20),
  reasoning: z.string().min(1).max(2000),
});
export type ClassificationResultSchemaDto = z.infer<typeof classificationResultSchemaV1>;

/**
 * Registry managing versioned Zod schemas for structured AI generation.
 */
export class StructuredOutputRegistry {
  private static defaultInstance: StructuredOutputRegistry | null = null;

  private readonly schemas = new Map<string, RegisteredSchemaEntry>();

  constructor() {
    this.registerBuiltInSchemas();
  }

  public static getDefault(): StructuredOutputRegistry {
    if (!this.defaultInstance) {
      this.defaultInstance = new StructuredOutputRegistry();
    }
    return this.defaultInstance;
  }

  private registerBuiltInSchemas(): void {
    this.register({
      name: 'TestPlan',
      version: 1,
      description: 'Structured test plan with objective, sequential action steps, and metadata',
      schema: testPlanSchemaV1,
      samplePromptGuidance: JSON.stringify(
        {
          name: 'Example Login Test',
          objective: 'Verify user authentication with valid credentials',
          steps: [
            {
              action: 'Enter email in username input field',
              target: 'input[name="email"]',
              expected: 'Value is populated',
            },
            {
              action: 'Click submit button',
              target: 'button[type="submit"]',
              expected: 'Dashboard is displayed',
            },
          ],
          metadata: { category: 'smoke' },
        },
        null,
        2,
      ),
    });

    this.register({
      name: 'BugReportSummary',
      version: 1,
      description: 'Validated bug report summary with severity and reproduction steps',
      schema: bugReportSummarySchemaV1,
      samplePromptGuidance: JSON.stringify(
        {
          title: 'Button unresponsive on mobile breakpoint',
          severity: 'HIGH',
          component: 'NavigationDrawer',
          summary: 'The menu drawer does not open on screens narrower than 480px.',
          reproductionSteps: ['Resize browser to 375px', 'Click burger icon'],
          expectedBehavior: 'Drawer slides into viewport',
          actualBehavior: 'No response, console shows TypeError',
        },
        null,
        2,
      ),
    });

    this.register({
      name: 'ClassificationResult',
      version: 1,
      description: 'Categorization decision with confidence score and tags',
      schema: classificationResultSchemaV1,
      samplePromptGuidance: JSON.stringify(
        {
          category: 'REGRESSION',
          confidence: 0.95,
          tags: ['ui', 'mobile', 'navigation'],
          reasoning: 'Feature was previously working in v8 release branch.',
        },
        null,
        2,
      ),
    });
  }

  private makeKey(name: string, version: number): string {
    return `${name.toLowerCase()}@v${version}`;
  }

  /**
   * Registers a versioned schema.
   */
  public register<T>(entry: RegisteredSchemaEntry<T>): void {
    const key = this.makeKey(entry.name, entry.version);
    this.schemas.set(key, entry as unknown as RegisteredSchemaEntry);
  }

  /**
   * Resolves a registered schema by name and version (defaults to highest or v1).
   */
  public resolve(name: string, version?: number): RegisteredSchemaEntry {
    const targetVersion = version ?? 1;
    const key = this.makeKey(name, targetVersion);
    const entry = this.schemas.get(key);
    if (!entry) {
      throw new AiStructuredSchemaInvalidError(name, undefined, targetVersion);
    }
    return entry;
  }

  /**
   * Checks if a schema name and version exists.
   */
  public has(name: string, version?: number): boolean {
    const targetVersion = version ?? 1;
    return this.schemas.has(this.makeKey(name, targetVersion));
  }

  /**
   * Lists all registered schema descriptors.
   */
  public list(): readonly RegisteredSchemaEntry[] {
    return Array.from(this.schemas.values());
  }

  /**
   * Converts Zod errors to normalized StructuredValidationErrorDto array.
   */
  public static mapZodError(error: ZodError): StructuredValidationErrorDto[] {
    return error.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
      code: e.code,
    }));
  }
}
