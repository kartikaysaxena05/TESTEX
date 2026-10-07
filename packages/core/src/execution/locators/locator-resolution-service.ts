/**
 * @file packages/core/src/execution/locators/locator-resolution-service.ts
 * Authoritative service orchestrating UI Element Resolution and Locator Intelligence (V5 Phase 64).
 */

import { performance } from 'node:perf_hooks';
import type { PrismaClient } from '@prisma/client';
import type {
  ExecutableTargetDescriptorDto,
  LocatorResolutionResultDto,
  ResolveLocatorInputDto,
  ElementDiagnosticsDto,
  CandidateDiagnosticItemDto,
} from '@ai-quality/contracts';
import { resolveLocatorInputSchema } from '@ai-quality/contracts';
import type { ILogger } from '../../logging/logger-types.js';
import type { BrowserSessionManager } from '../sessions/browser-session-manager.js';
import { LOCATOR_BOUNDS, ILocatorResolutionService } from './locator-types.js';
import { LocatorTargetValidator } from './locator-target-validator.js';
import { ScopeResolver } from './scope-resolver.js';
import { LocatorStrategyResolver } from './locator-strategy-resolver.js';
import { LocatorPageClosedError } from './locator-errors.js';
import { BrowserSessionNotFoundError } from '../sessions/session-errors.js';
import { CrossRunExecutionError } from '../actions/action-errors.js';

export interface LocatorResolutionServiceOptions {
  readonly prisma: PrismaClient;
  readonly sessionManager: BrowserSessionManager;
  readonly logger?: ILogger;
}

export class LocatorResolutionService implements ILocatorResolutionService {
  private readonly prisma: PrismaClient;
  private readonly sessionManager: BrowserSessionManager;
  private readonly logger?: ILogger;
  private readonly scopeResolver: ScopeResolver;
  private readonly strategyResolver: LocatorStrategyResolver;

  constructor(options: LocatorResolutionServiceOptions) {
    this.prisma = options.prisma;
    this.sessionManager = options.sessionManager;
    this.logger = options.logger;
    this.scopeResolver = new ScopeResolver();
    this.strategyResolver = new LocatorStrategyResolver();
  }

  /**
   * Resolves a structured target descriptor against a live browser execution session.
   */
  public async resolveLocator(
    input: ResolveLocatorInputDto,
    abortSignal?: AbortSignal,
  ): Promise<LocatorResolutionResultDto> {
    const tStart = performance.now();
    const validated = resolveLocatorInputSchema.parse(input);

    // 1. Cooperative Cancellation Check
    if (abortSignal?.aborted) {
      return this.buildCancelledResult(validated.target, tStart);
    }

    // 2. Validate Multi-Tenant Project Isolation against Database
    const testRun = await this.prisma.testRun.findUnique({
      where: { id: validated.testRunId },
      select: { id: true, projectId: true, status: true },
    });

    if (!testRun) {
      throw new CrossRunExecutionError(
        `TestRun '${validated.testRunId}' was not found in the database.`,
      );
    }

    if (testRun.projectId !== validated.projectId) {
      throw new CrossRunExecutionError(
        `Cross-project resolution blocked: TestRun '${validated.testRunId}' belongs to project '${testRun.projectId}', not '${validated.projectId}'.`,
      );
    }

    // 3. Retrieve Active Browser Execution Session
    const session =
      this.sessionManager.getSessionByRunId(validated.testRunId) ??
      this.sessionManager.getActiveSessions().find(s => s.sessionId === validated.testRunId) ??
      null;

    if (!session) {
      throw new BrowserSessionNotFoundError(validated.testRunId);
    }

    if (session.projectId !== validated.projectId) {
      throw new CrossRunExecutionError(
        `Session project mismatch: Session is scoped to project '${session.projectId}', not '${validated.projectId}'.`,
      );
    }

    // 4. Validate Target Descriptor Syntax and Invariants
    LocatorTargetValidator.validate(validated.target);

    // 5. Retrieve Page & Check Liveness
    const page = session.page;
    if (!page || page.isClosed()) {
      throw new LocatorPageClosedError('Active browser page is closed or unavailable.');
    }

    const timeoutMs = Math.min(
      Math.max(
        validated.timeoutMs ?? LOCATOR_BOUNDS.DEFAULT_RESOLUTION_TIMEOUT_MS,
        LOCATOR_BOUNDS.MIN_RESOLUTION_TIMEOUT_MS,
      ),
      LOCATOR_BOUNDS.MAX_RESOLUTION_TIMEOUT_MS,
    );

    try {
      // 6. Resolve Enclosing Scope / Frame
      const scopeContainer = await this.scopeResolver.resolveScope(page, validated.target);

      // 7. Resolve Candidate Locator Strategy
      const built = this.strategyResolver.buildLocator(
        scopeContainer.root,
        validated.target,
        scopeContainer.scopeRecipe,
      );

      // 8. Bounded waiting for dynamic DOM rendering
      try {
        await built.locator.first().waitFor({ state: 'attached', timeout: timeoutMs });
      } catch {
        // Fall through to evaluate count honestly
      }

      // Check cancellation during waiting
      if (abortSignal?.aborted) {
        return this.buildCancelledResult(validated.target, tStart);
      }

      // 9. Match Count & Disambiguation Evaluation
      const totalCount = await built.locator.count();

      // Case A: Explicit valid ordinal targeting
      if (validated.target.ordinal !== undefined) {
        const ordinal = validated.target.ordinal;
        if (ordinal < totalCount) {
          const singleLoc = built.locator.nth(ordinal);
          const diagnostics = await this.extractDiagnostics(singleLoc);
          const durationMs = Math.round(performance.now() - tStart);

          return {
            status: 'RESOLVED',
            strategy: built.strategy,
            matchCount: 1,
            resolvedTarget: validated.target,
            selectorRecipe: `${built.selectorRecipe}.nth(${ordinal})`,
            durationMs,
            elementDiagnostics: diagnostics,
          };
        } else {
          const durationMs = Math.round(performance.now() - tStart);
          return {
            status: 'NOT_FOUND',
            strategy: built.strategy,
            matchCount: totalCount,
            resolvedTarget: validated.target,
            selectorRecipe: `${built.selectorRecipe}.nth(${ordinal})`,
            durationMs,
            errorMessage: `Target ordinal ${ordinal} is out of bounds for ${totalCount} matching elements.`,
            errorCode: 'LOCATOR_NOT_FOUND',
          };
        }
      }

      // Case B: Exactly 1 unique match
      if (totalCount === 1) {
        const diagnostics = await this.extractDiagnostics(built.locator);
        const durationMs = Math.round(performance.now() - tStart);

        return {
          status: 'RESOLVED',
          strategy: built.strategy,
          matchCount: 1,
          resolvedTarget: validated.target,
          selectorRecipe: built.selectorRecipe,
          durationMs,
          elementDiagnostics: diagnostics,
        };
      }

      // Case C: 0 matching elements
      if (totalCount === 0) {
        const durationMs = Math.round(performance.now() - tStart);
        return {
          status: 'NOT_FOUND',
          strategy: built.strategy,
          matchCount: 0,
          resolvedTarget: validated.target,
          selectorRecipe: built.selectorRecipe,
          durationMs,
          errorMessage: `No elements matched target descriptor: ${built.selectorRecipe}`,
          errorCode: 'LOCATOR_NOT_FOUND',
        };
      }

      // Case D: Multiple matches without ordinal -> Strict Ambiguity
      const candidateDiagnostics = await this.extractCandidateDiagnostics(
        built.locator,
        totalCount,
      );
      const durationMs = Math.round(performance.now() - tStart);

      return {
        status: 'AMBIGUOUS',
        strategy: built.strategy,
        matchCount: totalCount,
        resolvedTarget: validated.target,
        selectorRecipe: built.selectorRecipe,
        durationMs,
        candidateDiagnostics,
        errorMessage: `Target descriptor is ambiguous: matched ${totalCount} elements. Disambiguation or scope required.`,
        errorCode: 'LOCATOR_AMBIGUOUS',
      };
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - tStart);
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorCode = err?.code || 'LOCATOR_INVALID_TARGET';

      return {
        status: 'INVALID_TARGET',
        matchCount: 0,
        resolvedTarget: validated.target,
        selectorRecipe: 'error',
        durationMs,
        errorMessage,
        errorCode,
      };
    }
  }

  private async extractDiagnostics(locator: any): Promise<ElementDiagnosticsDto> {
    try {
      const isVisible = await locator.isVisible().catch(() => false);
      const isEnabled = await locator.isEnabled().catch(() => false);
      const boundingBox = (await locator.boundingBox().catch(() => undefined)) || undefined;

      const evalData = await locator
        .evaluate((el: HTMLElement) => {
          const inputType = el instanceof HTMLInputElement ? el.type : undefined;
          const role = el.getAttribute('role') || el.tagName.toLowerCase();
          const accessibleName =
            el.getAttribute('aria-label') || el.innerText?.slice(0, 100) || undefined;
          return {
            tagName: el.tagName.toLowerCase(),
            role,
            accessibleName,
            inputType,
          };
        })
        .catch(() => ({}));

      return {
        tagName: evalData.tagName,
        role: evalData.role,
        accessibleName: evalData.accessibleName,
        isVisible,
        isEnabled,
        inputType: evalData.inputType,
        boundingBox,
      };
    } catch {
      return {};
    }
  }

  private async extractCandidateDiagnostics(
    locator: any,
    totalCount: number,
  ): Promise<CandidateDiagnosticItemDto[]> {
    const limit = Math.min(totalCount, LOCATOR_BOUNDS.MAX_CANDIDATE_DIAGNOSTICS);
    const candidates: CandidateDiagnosticItemDto[] = [];

    for (let i = 0; i < limit; i++) {
      try {
        const nthLoc = locator.nth(i);
        const isVisible = await nthLoc.isVisible().catch(() => false);
        const evalData = await nthLoc
          .evaluate((el: HTMLElement) => {
            const role = el.getAttribute('role') || el.tagName.toLowerCase();
            const accessibleName =
              el.getAttribute('aria-label') || el.innerText?.slice(0, 50) || undefined;
            return {
              tagName: el.tagName.toLowerCase(),
              role,
              accessibleName,
            };
          })
          .catch(() => ({ tagName: 'unknown' }));

        candidates.push({
          index: i,
          tagName: evalData.tagName,
          role: evalData.role,
          accessibleName: evalData.accessibleName,
          isVisible,
        });
      } catch {
        candidates.push({
          index: i,
          tagName: 'unknown',
        });
      }
    }

    return candidates;
  }

  private buildCancelledResult(
    target: ExecutableTargetDescriptorDto,
    tStart: number,
  ): LocatorResolutionResultDto {
    return {
      status: 'CANCELLED',
      matchCount: 0,
      resolvedTarget: target,
      selectorRecipe: 'cancelled',
      durationMs: Math.round(performance.now() - tStart),
      errorMessage: 'Locator resolution was cancelled.',
      errorCode: 'LOCATOR_CANCELLED',
    };
  }
}
