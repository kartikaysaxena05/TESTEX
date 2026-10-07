/**
 * @file packages/core/src/execution/actions/action-handlers/upload-action-handler.ts
 * Handler for UPLOAD action with path traversal guards, forbidden directory blocking, and file size checks.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ExecutableActionType, ExecutablePlanStepDto } from '@ai-quality/contracts';
import { BaseActionHandler } from './base-action-handler.js';
import { ACTION_BOUNDS, type ActionExecutionContext } from '../action-types.js';
import { InvalidActionValueError } from '../action-errors.js';
import { FORBIDDEN_FILE_PATH_PATTERNS } from '../../compiler/compiler-types.js';

export class UploadActionHandler extends BaseActionHandler {
  public readonly actionType: ExecutableActionType = 'UPLOAD';
  public readonly riskLevel = 'MUTATING' as const;

  protected async executeAction(
    action: ExecutablePlanStepDto,
    context: ActionExecutionContext,
    timeoutMs: number,
  ): Promise<{
    targetSummary?: string;
    valueSummary?: string;
    metadataJson?: Record<string, unknown>;
  }> {
    const locator = await this.locatorResolver.resolve(context.page, action.target, {
      strict: true,
    });

    const rawFilePath = this.resolveValue(action, context).trim();

    if (!rawFilePath) {
      throw new InvalidActionValueError('UPLOAD action requires a file path to upload.');
    }

    // 1. Guard against path traversal and forbidden filesystem locations
    for (const pattern of FORBIDDEN_FILE_PATH_PATTERNS) {
      if (pattern.test(rawFilePath)) {
        throw new InvalidActionValueError(
          `File path '${rawFilePath}' is rejected: matched forbidden security pattern '${pattern.source}'.`,
        );
      }
    }

    // 2. Resolve absolute path
    const resolvedPath = path.isAbsolute(rawFilePath)
      ? path.normalize(rawFilePath)
      : path.resolve(process.cwd(), rawFilePath);

    // 3. Verify file existence and size bounds
    if (!fs.existsSync(resolvedPath)) {
      throw new InvalidActionValueError(
        `Upload file '${resolvedPath}' does not exist on filesystem.`,
      );
    }

    const stat = fs.statSync(resolvedPath);
    if (!stat.isFile()) {
      throw new InvalidActionValueError(`Upload target '${resolvedPath}' is not a regular file.`);
    }

    if (stat.size > ACTION_BOUNDS.MAX_UPLOAD_SIZE_BYTES) {
      throw new InvalidActionValueError(
        `Upload file '${resolvedPath}' exceeds maximum allowed size of ${ACTION_BOUNDS.MAX_UPLOAD_SIZE_BYTES / (1024 * 1024)}MB.`,
      );
    }

    // 4. Set input files via Playwright
    await locator.setInputFiles(resolvedPath, { timeout: timeoutMs });

    const targetSummary = this.locatorResolver.summarizeTarget(action.target);
    const basename = path.basename(resolvedPath);

    return {
      targetSummary,
      valueSummary: `file="${basename}" (${stat.size} bytes)`,
      metadataJson: {
        fileName: basename,
        fileSize: stat.size,
      },
    };
  }
}

export class UploadFileAliasActionHandler extends UploadActionHandler {
  public override readonly actionType = 'UPLOAD_FILE' as const;
}
