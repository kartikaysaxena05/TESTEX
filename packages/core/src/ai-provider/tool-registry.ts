/**
 * @file packages/core/src/ai-provider/tool-registry.ts
 * Provider-independent, validated registry for AI tools (V9 Phase 133).
 *
 * Enforces:
 * - Deterministic, serializable tool definitions
 * - Schema validation for input/output schemas (Zod and JSON Schema compatibility)
 * - Safe tool naming (dot-delimited, e.g. 'repository.search', 'tests.list')
 * - Elimination of duplicate tool registrations
 * - Project/tenant scoping boundaries
 * - Prevention of unrestricted dangerous capabilities (e.g. 'execute-any-command')
 * - Capability registration only; does NOT authorize or execute any tool (execution is V10).
 */

import { z, type ZodTypeAny, ZodError } from 'zod';
import type {
  AiToolDefinitionDto,
  ToolCategory,
  ToolRiskLevel,
  ToolCallValidationErrorDto,
} from '@ai-quality/contracts';
import {
  aiToolDefinitionSchema,
} from '@ai-quality/contracts';
import {
  AiToolDuplicateError,
  AiToolNotFoundError,
  AiToolSchemaInvalidError,
} from './ai-provider-errors.js';

export interface RegisteredToolEntry {
  readonly definition: AiToolDefinitionDto;
  readonly validator?: z.ZodTypeAny;
  readonly projectId?: string | null;
}

/**
 * Registry for managing validated tool definitions.
 */
export class AiToolRegistry {
  private static defaultInstance: AiToolRegistry | null = null;

  // Tools stored by registry key: `${projectId ?? 'GLOBAL'}:${name}`
  private readonly tools = new Map<string, RegisteredToolEntry>();

  constructor(registerDefaults = true) {
    if (registerDefaults) {
      this.registerDefaultTools();
    }
  }

  public static getDefault(): AiToolRegistry {
    if (!this.defaultInstance) {
      this.defaultInstance = new AiToolRegistry(true);
    }
    return this.defaultInstance;
  }

  private getRegistryKey(name: string, projectId?: string | null): string {
    return `${projectId ?? 'GLOBAL'}:${name}`;
  }

  /**
   * Registers a tool definition.
   * Rejects malformed schemas, duplicates, and prohibited unrestricted tools.
   */
  public registerTool(
    definitionInput: AiToolDefinitionDto,
    validator?: z.ZodTypeAny,
    projectId?: string | null,
  ): void {
    // 1. Validate structure with contract Zod schema
    let definition: AiToolDefinitionDto;
    try {
      definition = aiToolDefinitionSchema.parse(definitionInput);
    } catch (err) {
      const msg = err instanceof ZodError ? err.errors.map((e) => e.message).join('; ') : String(err);
      throw new AiToolSchemaInvalidError(definitionInput.name || 'unnamed', msg);
    }

    // 2. Reject unrestricted dangerous tools
    const forbiddenPatterns = [
      /^execute[-_.]any[-_.]command$/i,
      /^read[-_.]any[-_.]file$/i,
      /^delete[-_.]anything$/i,
      /^shell[-_.]exec$/i,
      /^sudo$/i,
      /^raw[-_.]eval$/i,
    ];
    if (forbiddenPatterns.some((pattern) => pattern.test(definition.name))) {
      throw new AiToolSchemaInvalidError(
        definition.name,
        'Unrestricted system execution tools are strictly prohibited in the V9 Tool Registry.',
      );
    }

    // 3. Check for duplicates in the given scope
    const key = this.getRegistryKey(definition.name, projectId);
    if (this.tools.has(key)) {
      throw new AiToolDuplicateError(definition.name);
    }

    // 4. Validate that inputSchema is a valid non-empty object
    if (!definition.inputSchema || typeof definition.inputSchema !== 'object') {
      throw new AiToolSchemaInvalidError(
        definition.name,
        'inputSchema must be a valid JSON Schema object.',
      );
    }

    this.tools.set(key, {
      definition,
      validator,
      projectId: projectId ?? null,
    });
  }

  /**
   * Unregisters a tool from the registry.
   */
  public unregisterTool(name: string, projectId?: string | null): boolean {
    const key = this.getRegistryKey(name, projectId);
    return this.tools.delete(key);
  }

  /**
   * Looks up a tool definition by name. Checks project-scoped first, then global.
   */
  public getTool(name: string, projectId?: string | null): AiToolDefinitionDto | null {
    if (projectId) {
      const projectKey = this.getRegistryKey(name, projectId);
      const projectEntry = this.tools.get(projectKey);
      if (projectEntry) return projectEntry.definition;
    }

    const globalKey = this.getRegistryKey(name, null);
    const globalEntry = this.tools.get(globalKey);
    return globalEntry ? globalEntry.definition : null;
  }

  /**
   * Retrieves the full entry including custom Zod validator.
   */
  public getToolEntry(name: string, projectId?: string | null): RegisteredToolEntry | null {
    if (projectId) {
      const projectKey = this.getRegistryKey(name, projectId);
      const projectEntry = this.tools.get(projectKey);
      if (projectEntry) return projectEntry;
    }

    const globalKey = this.getRegistryKey(name, null);
    return this.tools.get(globalKey) ?? null;
  }

  /**
   * Checks whether a tool exists in the registry.
   */
  public hasTool(name: string, projectId?: string | null): boolean {
    return this.getTool(name, projectId) !== null;
  }

  /**
   * Lists available tools in the registry for a given scope.
   */
  public listTools(projectId?: string | null, category?: ToolCategory): readonly AiToolDefinitionDto[] {
    const results = new Map<string, AiToolDefinitionDto>();

    // Add global tools first
    for (const [key, entry] of this.tools.entries()) {
      if (entry.projectId === null) {
        if (!category || entry.definition.category === category) {
          results.set(entry.definition.name, entry.definition);
        }
      }
    }

    // Overlay project-scoped tools
    if (projectId) {
      for (const [key, entry] of this.tools.entries()) {
        if (entry.projectId === projectId) {
          if (!category || entry.definition.category === category) {
            results.set(entry.definition.name, entry.definition);
          }
        }
      }
    }

    return Array.from(results.values());
  }

  /**
   * Validates tool call arguments against the tool's registered schema.
   */
  public validateArguments(
    toolName: string,
    args: Record<string, unknown>,
    projectId?: string | null,
  ): { valid: boolean; errors: readonly ToolCallValidationErrorDto[] } {
    const entry = this.getToolEntry(toolName, projectId);
    if (!entry) {
      return {
        valid: false,
        errors: [{ path: '', message: `Tool '${toolName}' is not registered.` }],
      };
    }

    // 1. If explicit Zod validator exists, use it
    if (entry.validator) {
      const parsed = entry.validator.safeParse(args);
      if (!parsed.success) {
        return {
          valid: false,
          errors: parsed.error.errors.map((e) => ({
            path: e.path.join('.'),
            message: e.message,
            code: e.code,
          })),
        };
      }
      return { valid: true, errors: [] };
    }

    // 2. Fallback: lightweight JSON Schema property check based on entry.definition.inputSchema
    const inputSchema = entry.definition.inputSchema as {
      type?: string;
      required?: readonly string[];
      properties?: Record<string, { type?: string }>;
    };

    const errors: ToolCallValidationErrorDto[] = [];

    if (inputSchema.required && Array.isArray(inputSchema.required)) {
      for (const reqField of inputSchema.required) {
        if (args[reqField] === undefined || args[reqField] === null) {
          errors.push({
            path: reqField,
            message: `Required property '${reqField}' is missing.`,
          });
        }
      }
    }

    if (inputSchema.properties && typeof inputSchema.properties === 'object') {
      for (const [propName, propDef] of Object.entries(inputSchema.properties)) {
        const val = args[propName];
        if (val !== undefined && val !== null && propDef.type) {
          const actualType = Array.isArray(val) ? 'array' : typeof val;
          if (propDef.type === 'integer') {
            if (typeof val !== 'number' || !Number.isInteger(val)) {
              errors.push({
                path: propName,
                message: `Expected integer for '${propName}', received ${actualType}.`,
              });
            }
          } else if (actualType !== propDef.type) {
            errors.push({
              path: propName,
              message: `Expected ${propDef.type} for '${propName}', received ${actualType}.`,
            });
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Clears the registry (useful for testing).
   */
  public clear(): void {
    this.tools.clear();
  }

  /**
   * Registers default safe tools across categories (repository, requirements, tests, defects).
   */
  private registerDefaultTools(): void {
    // 1. repository.search
    this.registerTool(
      {
        name: 'repository.search',
        description: 'Searches repository code and symbols matching a query pattern.',
        version: 1,
        category: 'REPOSITORY',
        riskLevel: 'READ_ONLY',
        inputSchema: {
          type: 'object',
          required: ['query'],
          properties: {
            query: { type: 'string', description: 'Query string or regex pattern' },
            pathPattern: { type: 'string', description: 'Optional glob path filter' },
            limit: { type: 'integer', description: 'Maximum number of matches to return' },
          },
        },
      },
      z.object({
        query: z.string().min(1).max(500),
        pathPattern: z.string().max(500).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
    );

    // 2. requirements.list
    this.registerTool(
      {
        name: 'requirements.list',
        description: 'Lists project requirements filtered by status or module tags.',
        version: 1,
        category: 'REQUIREMENTS',
        riskLevel: 'READ_ONLY',
        inputSchema: {
          type: 'object',
          properties: {
            status: { type: 'string', description: 'Filter by requirement status' },
            tag: { type: 'string', description: 'Filter by requirement tag' },
            limit: { type: 'integer', description: 'Maximum items to return' },
          },
        },
      },
      z.object({
        status: z.string().max(64).optional(),
        tag: z.string().max(64).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
    );

    // 3. tests.list
    this.registerTool(
      {
        name: 'tests.list',
        description: 'Lists automated test cases or test plans in the project.',
        version: 1,
        category: 'TESTS',
        riskLevel: 'READ_ONLY',
        inputSchema: {
          type: 'object',
          properties: {
            suite: { type: 'string', description: 'Optional test suite name' },
            priority: { type: 'string', description: 'Test priority filter' },
            limit: { type: 'integer', description: 'Max items to return' },
          },
        },
      },
      z.object({
        suite: z.string().max(128).optional(),
        priority: z.string().max(32).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
    );

    // 4. defects.list
    this.registerTool(
      {
        name: 'defects.list',
        description: 'Lists identified defects or failure reports in the current project.',
        version: 1,
        category: 'DEFECTS',
        riskLevel: 'READ_ONLY',
        inputSchema: {
          type: 'object',
          properties: {
            severity: { type: 'string', description: 'Defect severity level' },
            status: { type: 'string', description: 'Defect status filter' },
          },
        },
      },
      z.object({
        severity: z.string().max(32).optional(),
        status: z.string().max(32).optional(),
      }),
    );
  }
}
