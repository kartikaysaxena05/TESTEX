/**
 * @file packages/core/src/ai-provider/ai-privacy-service.ts
 * AI Privacy & Context Firewall Service for V9 Phase 137.
 *
 * Enforces:
 * 1. Strict Privacy Policy: LOCAL_ONLY vs REMOTE_ALLOWED (default: LOCAL_ONLY).
 * 2. Mandatory Local Provider: Only local providers (e.g. OLLAMA) are permitted in LOCAL_ONLY mode.
 * 3. Context Firewall: Inspects and classifies context (PUBLIC, PROJECT_DATA, SOURCE_CODE, REQUIREMENTS, TEST_DATA, EXECUTION_EVIDENCE, CREDENTIAL, SECRET).
 * 4. Deep Secret Redaction: Redacts passwords, API keys, Bearer tokens, cookies, database URLs, and .env secrets before prompt/context transmission.
 * 5. Deterministic Remote Block: Throws AiRemoteProviderBlockedError without leaking internal secrets.
 * 6. Audit Trail: Emits structured security events (AI_PRIVACY_MODE_CHANGED, AI_REMOTE_PROVIDER_BLOCKED, AI_SECRET_REDACTION_APPLIED, etc.)
 */

import type { PrismaClient, AuthAuditAction } from '@prisma/client';
import { getPrismaClient } from '../database/client.js';
import { getLogger, type ILogger } from '../logging/index.js';
import { sanitizeStringCredentials, redactValue } from '../logging/redaction.js';
import { SecretRedactor } from '../execution/sessions/secret-redactor.js';
import type {
  AiPrivacySettingsDto,
  AiPrivacyModeDto,
  GetAiPrivacySettingsInputDto,
  UpdateAiPrivacySettingsInputDto,
  CheckAiContextFirewallInputDto,
  AiContextFirewallResultDto,
  AiDataContextClassificationDto,
  AiProjectContextDto,
  AiProviderType,
} from '@ai-quality/contracts';
import {
  getAiPrivacySettingsInputSchema,
  updateAiPrivacySettingsInputSchema,
  checkAiContextFirewallInputSchema,
} from '@ai-quality/contracts';
import { AiProviderRegistry } from './ai-provider-registry.js';
import {
  AiRemoteProviderBlockedError,
  AiPrivacyViolationError,
  AiCrossProjectAccessError,
  AiInvalidRequestError,
} from './ai-provider-errors.js';

export interface AiPrivacyServiceDependencies {
  readonly prisma?: PrismaClient;
  readonly registry?: AiProviderRegistry;
  readonly logger?: ILogger;
}

export class AiPrivacyService {
  private readonly prisma: PrismaClient;
  private readonly registry: AiProviderRegistry;
  private readonly logger: ILogger;

  // Regex patterns to detect high-risk secrets and credentials in arbitrary text
  private static readonly SECRET_PATTERNS: readonly { readonly pattern: RegExp; readonly name: string }[] = [
    { pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/i, name: 'PRIVATE_KEY' },
    { pattern: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}/, name: 'GITHUB_TOKEN' },
    { pattern: /sk-[A-Za-z0-9_-]{8,}/, name: 'API_KEY' },
    { pattern: /(?:Bearer\s+)[A-Za-z0-9._~+/-]+=*/i, name: 'BEARER_TOKEN' },
    { pattern: /(?:postgres|postgresql|mysql|mongodb|redis):\/\/[^@/\s:]+:[^@/\s]+@/i, name: 'DATABASE_URL' },
    { pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]+['"]/i, name: 'PLAINTEXT_PASSWORD' },
    { pattern: /(?:api[_-]?key|secret[_-]?token)\s*[:=]\s*['"][^'"]+['"]/i, name: 'ASSIGNED_SECRET' },
  ];

  constructor(deps?: AiPrivacyServiceDependencies) {
    this.prisma = deps?.prisma ?? getPrismaClient()!;
    this.registry = deps?.registry ?? AiProviderRegistry.createDefault();
    this.logger = deps?.logger ?? getLogger();
  }

  /**
   * Retrieves effective privacy settings for a project or global default.
   * New projects default strictly to LOCAL_ONLY.
   */
  public async getSettings(
    input?: GetAiPrivacySettingsInputDto,
    userId?: string,
  ): Promise<AiPrivacySettingsDto> {
    const validated = getAiPrivacySettingsInputSchema.parse(input ?? {});

    if (validated.projectId && userId) {
      await this.assertProjectAccess(validated.projectId, userId);
    }

    if (validated.projectId) {
      const record = await this.prisma.aiPrivacySettings.findUnique({
        where: { projectId: validated.projectId },
      });

      if (record) {
        return {
          id: record.id,
          projectId: record.projectId,
          userId: record.userId,
          privacyMode: record.privacyMode as AiPrivacyModeDto,
          allowCloudFallback: record.allowCloudFallback,
          redactSecrets: record.redactSecrets,
          stripCredentials: record.stripCredentials,
          permittedLocalProvider: record.permittedLocalProvider,
          createdAt: record.createdAt.toISOString(),
          updatedAt: record.updatedAt.toISOString(),
        };
      }
    }

    // Default safe local-only fallback
    return {
      id: '00000000-0000-0000-0000-000000000000',
      projectId: validated.projectId ?? null,
      userId: userId ?? null,
      privacyMode: 'LOCAL_ONLY',
      allowCloudFallback: false,
      redactSecrets: true,
      stripCredentials: true,
      permittedLocalProvider: 'OLLAMA',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Updates AI privacy settings with multi-tenant isolation and security audit logging.
   */
  public async updateSettings(
    input: UpdateAiPrivacySettingsInputDto,
    userId: string,
  ): Promise<AiPrivacySettingsDto> {
    const validated = updateAiPrivacySettingsInputSchema.parse(input);

    if (validated.projectId) {
      await this.assertProjectAccess(validated.projectId, userId);
    }

    const current = await this.getSettings({ projectId: validated.projectId }, userId);

    const newPrivacyMode = (validated.privacyMode ?? current.privacyMode) as 'LOCAL_ONLY' | 'REMOTE_ALLOWED';
    const newAllowCloudFallback =
      validated.allowCloudFallback !== undefined ? validated.allowCloudFallback : current.allowCloudFallback;
    const newRedactSecrets =
      validated.redactSecrets !== undefined ? validated.redactSecrets : current.redactSecrets;
    const newStripCredentials =
      validated.stripCredentials !== undefined ? validated.stripCredentials : current.stripCredentials;
    const newPermittedLocalProvider =
      validated.permittedLocalProvider ?? current.permittedLocalProvider;

    let saved;
    if (validated.projectId) {
      saved = await this.prisma.aiPrivacySettings.upsert({
        where: { projectId: validated.projectId },
        create: {
          projectId: validated.projectId,
          userId,
          privacyMode: newPrivacyMode,
          allowCloudFallback: newAllowCloudFallback,
          redactSecrets: newRedactSecrets,
          stripCredentials: newStripCredentials,
          permittedLocalProvider: newPermittedLocalProvider,
        },
        update: {
          privacyMode: newPrivacyMode,
          allowCloudFallback: newAllowCloudFallback,
          redactSecrets: newRedactSecrets,
          stripCredentials: newStripCredentials,
          permittedLocalProvider: newPermittedLocalProvider,
        },
      });
    } else {
      // Global user privacy setting
      saved = await this.prisma.aiPrivacySettings.create({
        data: {
          projectId: null,
          userId,
          privacyMode: newPrivacyMode,
          allowCloudFallback: newAllowCloudFallback,
          redactSecrets: newRedactSecrets,
          stripCredentials: newStripCredentials,
          permittedLocalProvider: newPermittedLocalProvider,
        },
      });
    }

    // Security audit log
    await this.recordAuditLog(userId, 'AI_PRIVACY_MODE_CHANGED' as AuthAuditAction, {
      projectId: validated.projectId ?? null,
      previousPrivacyMode: current.privacyMode,
      newPrivacyMode,
      allowCloudFallback: newAllowCloudFallback,
      redactSecrets: newRedactSecrets,
    });

    this.logger.info('ai_privacy.mode_updated', {
      userId,
      projectId: validated.projectId,
      privacyMode: newPrivacyMode,
      allowCloudFallback: newAllowCloudFallback,
    });

    return {
      id: saved.id,
      projectId: saved.projectId,
      userId: saved.userId,
      privacyMode: saved.privacyMode as AiPrivacyModeDto,
      allowCloudFallback: saved.allowCloudFallback,
      redactSecrets: saved.redactSecrets,
      stripCredentials: saved.stripCredentials,
      permittedLocalProvider: saved.permittedLocalProvider,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString(),
    };
  }

  /**
   * Evaluates provider compliance against privacy policy for a given request.
   * In LOCAL_ONLY mode, only LOCAL providers (e.g. OLLAMA) are permitted.
   */
  public async evaluateProviderAccess(
    providerId: string,
    projectId?: string | null,
    userId?: string,
  ): Promise<{
    allowed: boolean;
    privacyMode: AiPrivacyModeDto;
    providerType: AiProviderType;
  }> {
    const settings = await this.getSettings({ projectId }, userId);

    // Resolve provider type
    let providerType: AiProviderType = 'LOCAL';
    if (this.registry.has(providerId)) {
      providerType = this.registry.get(providerId).type;
    } else if (providerId.toUpperCase() === 'OLLAMA') {
      providerType = 'LOCAL';
    } else if (providerId.toUpperCase() === 'OPENAI' || providerId.toUpperCase() === 'ANTHROPIC') {
      providerType = 'CLOUD';
    } else {
      providerType = 'CLOUD';
    }

    if (settings.privacyMode === 'LOCAL_ONLY') {
      if (providerType !== 'LOCAL' && providerType !== 'EMULATED') {
        // Audit block event
        if (userId) {
          await this.recordAuditLog(userId, 'AI_REMOTE_PROVIDER_BLOCKED' as AuthAuditAction, {
            projectId: projectId ?? null,
            providerId,
            providerType,
            privacyMode: 'LOCAL_ONLY',
          });
        }
        return { allowed: false, privacyMode: settings.privacyMode, providerType };
      }
    }

    return { allowed: true, privacyMode: settings.privacyMode, providerType };
  }

  /**
   * Asserts that provider is permitted under current privacy policy.
   * Throws AiRemoteProviderBlockedError if blocked.
   */
  public async assertProviderAllowed(
    providerId: string,
    projectId?: string | null,
    userId?: string,
  ): Promise<void> {
    const evaluation = await this.evaluateProviderAccess(providerId, projectId, userId);
    if (!evaluation.allowed) {
      this.logger.warn('ai_privacy.remote_provider_blocked', {
        providerId,
        projectId,
        userId,
        privacyMode: evaluation.privacyMode,
      });
      throw new AiRemoteProviderBlockedError(providerId, evaluation.privacyMode);
    }
  }

  /**
   * Centralized AI Context Firewall.
   * Classifies data, applies recursive secret redaction, and validates privacy boundaries.
   */
  public async checkFirewall(
    input: CheckAiContextFirewallInputDto,
    userId?: string,
  ): Promise<AiContextFirewallResultDto> {
    const validated = checkAiContextFirewallInputSchema.parse(input);

    if (validated.projectId && userId) {
      await this.assertProjectAccess(validated.projectId, userId);
    }

    const settings = await this.getSettings({ projectId: validated.projectId }, userId);
    const evaluation = await this.evaluateProviderAccess(
      validated.providerId,
      validated.projectId,
      userId,
    );

    if (!evaluation.allowed) {
      return {
        allowed: false,
        privacyMode: evaluation.privacyMode,
        providerId: validated.providerId,
        providerType: evaluation.providerType,
        blockReason: `Remote provider '${validated.providerId}' is prohibited in LOCAL_ONLY mode.`,
        sanitizedPrompt: '',
        sanitizedSystemPrompt: null,
        sanitizedContext: null,
        redactedSecretsCount: 0,
        dataClassifications: ['PROJECT_DATA'],
      };
    }

    // Classify and redact contents
    const classifications = new Set<AiDataContextClassificationDto>();
    let redactedCount = 0;

    // 1. Prompt redaction
    const promptRedaction = this.sanitizeText(validated.prompt, settings.redactSecrets);
    redactedCount += promptRedaction.matchCount;
    if (promptRedaction.containsSecret) classifications.add('SECRET');
    classifications.add('PROJECT_DATA');

    // 2. System Prompt redaction
    let sanitizedSystemPrompt: string | null = null;
    if (validated.systemPrompt) {
      const sysRedaction = this.sanitizeText(validated.systemPrompt, settings.redactSecrets);
      redactedCount += sysRedaction.matchCount;
      if (sysRedaction.containsSecret) classifications.add('SECRET');
      sanitizedSystemPrompt = sysRedaction.text;
    }

    // 3. Context redaction
    let sanitizedContext: AiProjectContextDto | null = null;
    if (validated.context) {
      let repositoryInfo = validated.context.repositoryInfo;
      let requirements = validated.context.requirements;
      let testInfo = validated.context.testInfo;
      let targetInfo = validated.context.targetInfo;
      let relevantMetadata = validated.context.relevantMetadata;

      if (validated.context.repositoryInfo) {
        classifications.add('SOURCE_CODE');
        const repoRedaction = this.sanitizeText(validated.context.repositoryInfo, settings.redactSecrets);
        redactedCount += repoRedaction.matchCount;
        if (repoRedaction.containsSecret) classifications.add('SECRET');
        repositoryInfo = repoRedaction.text;
      }

      if (validated.context.requirements) {
        classifications.add('REQUIREMENTS');
        const reqRedaction = this.sanitizeText(validated.context.requirements, settings.redactSecrets);
        redactedCount += reqRedaction.matchCount;
        if (reqRedaction.containsSecret) classifications.add('SECRET');
        requirements = reqRedaction.text;
      }

      if (validated.context.testInfo) {
        classifications.add('TEST_DATA');
        const testRedaction = this.sanitizeText(validated.context.testInfo, settings.redactSecrets);
        redactedCount += testRedaction.matchCount;
        if (testRedaction.containsSecret) classifications.add('SECRET');
        testInfo = testRedaction.text;
      }

      if (validated.context.targetInfo) {
        classifications.add('EXECUTION_EVIDENCE');
        const targetRedaction = this.sanitizeText(validated.context.targetInfo, settings.redactSecrets);
        redactedCount += targetRedaction.matchCount;
        if (targetRedaction.containsSecret) classifications.add('SECRET');
        targetInfo = targetRedaction.text;
      }

      if (validated.context.relevantMetadata) {
        classifications.add('PROJECT_DATA');
        relevantMetadata = redactValue(validated.context.relevantMetadata) as Record<string, unknown>;
      }

      sanitizedContext = {
        repositoryInfo,
        requirements,
        testInfo,
        targetInfo,
        relevantMetadata,
      };
    }

    if (redactedCount > 0 && userId) {
      await this.recordAuditLog(userId, 'AI_SECRET_REDACTION_APPLIED' as AuthAuditAction, {
        projectId: validated.projectId ?? null,
        providerId: validated.providerId,
        redactedSecretsCount: redactedCount,
      });
    }

    return {
      allowed: true,
      privacyMode: evaluation.privacyMode,
      providerId: validated.providerId,
      providerType: evaluation.providerType,
      sanitizedPrompt: promptRedaction.text,
      sanitizedSystemPrompt,
      sanitizedContext,
      redactedSecretsCount: redactedCount,
      dataClassifications: Array.from(classifications),
    };
  }

  /**
   * Sanitizes a string by detecting and masking credential tokens, database URLs, and bearer tokens.
   */
  public sanitizeText(
    text?: string | null,
    enableRedaction = true,
  ): { text: string; matchCount: number; containsSecret: boolean } {
    if (!text || text.length === 0) {
      return { text: '', matchCount: 0, containsSecret: false };
    }

    let result = text;
    let matchCount = 0;
    let containsSecret = false;

    // First pass: sanitize credentials in URL strings & Bearer tokens
    const credSanitized = sanitizeStringCredentials(result);
    if (credSanitized !== result) {
      matchCount++;
      containsSecret = true;
      result = credSanitized;
    }

    // Second pass: known secret patterns
    for (const item of AiPrivacyService.SECRET_PATTERNS) {
      if (item.pattern.test(result)) {
        containsSecret = true;
        if (enableRedaction) {
          result = result.replace(item.pattern, '[REDACTED]');
          matchCount++;
        }
      }
    }

    // Third pass: registered secrets via SecretRedactor
    const redactorResult = SecretRedactor.redactText(result);
    if (redactorResult !== result) {
      containsSecret = true;
      matchCount++;
      result = redactorResult;
    }

    return { text: result, matchCount, containsSecret };
  }

  /**
   * Enforces tenant isolation: project must exist and belong to the calling user.
   */
  private async assertProjectAccess(projectId: string, userId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, userId: true },
    });

    if (!project) {
      throw new AiInvalidRequestError(`Project with ID '${projectId}' was not found.`);
    }

    if (project.userId && project.userId !== userId) {
      this.logger.warn('ai_privacy.cross_project_violation', {
        projectId,
        projectOwnerId: project.userId,
        requestUserId: userId,
      });
      throw new AiCrossProjectAccessError(
        `User '${userId}' does not have permission to access AI privacy configuration for project '${projectId}'.`,
      );
    }
  }

  /**
   * Writes safe security audit logs without storing credentials or raw prompts.
   */
  private async recordAuditLog(
    userId: string,
    action: AuthAuditAction,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.authAuditEvent.create({
        data: {
          userId,
          action,
          metadata: metadata as import('@prisma/client').Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      this.logger.warn('ai_privacy.audit_failed', {
        action,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
