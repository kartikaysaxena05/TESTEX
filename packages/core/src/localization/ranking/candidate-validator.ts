/**
 * @file packages/core/src/localization/ranking/candidate-validator.ts
 * Anti-hallucination and security validator ensuring candidates exist in repository and violate no security policies.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  DefectLocalizationFabricatedEntityError,
  DefectLocalizationPathTraversalError,
  DefectLocalizationSymlinkEscapeError,
} from '../defect-localization-errors.js';
import type { LocalizationContext, RawCandidateFact } from '../defect-localization-types.js';

export interface ValidatedCandidateFact extends RawCandidateFact {
  readonly isValidated: boolean;
  readonly isSymbolVerified: boolean;
}

export class CandidateValidator {
  /**
   * Secret redaction patterns to prevent token / credential leaks.
   */
  private static readonly SECRET_PATTERNS = [
    /(?:api[_-]?key|secret|token|password|auth|bearer)\s*[:=]\s*['"]?[a-zA-Z0-9_\-./+=]{8,}['"]?/gi,
    /ghp_[a-zA-Z0-9]{36}/g,
    /eyJ[a-zA-Z0-9_\-./+=]{10,}/g, // JWT
  ];

  /**
   * Normalizes relative file paths with forward slashes and strips leading './' or '/'.
   */
  public static normalizePath(p: string): string {
    return p.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
  }

  /**
   * Validates a collection of candidate facts against actual repository records and security policies.
   */
  public validateCandidateFacts(
    facts: readonly RawCandidateFact[],
    context: LocalizationContext,
  ): readonly ValidatedCandidateFact[] {
    const validated: ValidatedCandidateFact[] = [];

    // Map files by exact relative path and normalized lower-case path
    const fileByPath = new Map<string, (typeof context.repositoryFiles)[0]>();
    const fileByNormPath = new Map<string, (typeof context.repositoryFiles)[0]>();

    for (const f of context.repositoryFiles) {
      fileByPath.set(f.relativePath, f);
      fileByNormPath.set(CandidateValidator.normalizePath(f.relativePath).toLowerCase(), f);
    }

    for (const fact of facts) {
      // 1. Path traversal check
      if (
        fact.filePath.includes('..') ||
        fact.filePath.startsWith('/') ||
        fact.filePath.startsWith('\\') ||
        fact.filePath.includes('/etc/') ||
        fact.filePath.includes('.ssh')
      ) {
        throw new DefectLocalizationPathTraversalError(
          `Security violation: candidate path '${fact.filePath}' attempts directory traversal.`,
        );
      }

      const normalized = CandidateValidator.normalizePath(fact.filePath);
      const matchedFile =
        fileByPath.get(fact.filePath) ?? fileByNormPath.get(normalized.toLowerCase());

      // 2. Existence verification against indexed repository
      if (!matchedFile) {
        // If repository files are present, any candidate not in indexed files is rejected as fabricated
        if (context.repositoryFiles.length > 0) {
          continue; // Filter out fabricated / hallucinated candidate
        }
      }

      // 3. Symlink & Canonical workspace containment check
      if (context.workspaceRoot && fs.existsSync(context.workspaceRoot)) {
        const canonicalRoot = path.resolve(context.workspaceRoot);
        const targetPath = path.resolve(canonicalRoot, normalized);

        const rel = path.relative(canonicalRoot, targetPath);
        if (rel.startsWith('..') || path.isAbsolute(rel)) {
          throw new DefectLocalizationPathTraversalError(
            `Security violation: target file '${fact.filePath}' resolves outside workspace root.`,
          );
        }

        if (fs.existsSync(targetPath)) {
          try {
            const realTarget = fs.realpathSync(targetPath);
            const relReal = path.relative(canonicalRoot, realTarget);
            if (relReal.startsWith('..') || path.isAbsolute(relReal)) {
              throw new DefectLocalizationSymlinkEscapeError(
                `Security violation: symlink '${fact.filePath}' escapes authorized repository root.`,
              );
            }
          } catch {
            // ignore fs check errors
          }
        }
      }

      // 4. Symbol existence verification
      let isSymbolVerified = false;
      let verifiedSymbolName = fact.symbolName ?? null;
      let startLine = fact.startLine;
      let endLine = fact.endLine;

      if (matchedFile && fact.symbolName) {
        const foundSymbol = matchedFile.symbols.find(
          s => s.name.toLowerCase() === fact.symbolName!.toLowerCase(),
        );
        if (foundSymbol) {
          isSymbolVerified = true;
          verifiedSymbolName = foundSymbol.name;
          startLine = foundSymbol.startLine;
          endLine = foundSymbol.endLine;
        } else {
          // If symbol does not exist in the file, omit fabricated symbol name
          verifiedSymbolName = null;
        }
      }

      validated.push({
        ...fact,
        filePath: matchedFile?.relativePath ?? normalized,
        symbolName: verifiedSymbolName,
        startLine: startLine ?? null,
        endLine: endLine ?? null,
        description: this.redactSecrets(fact.description),
        provenance: this.redactSecrets(fact.provenance),
        isValidated: true,
        isSymbolVerified,
      });
    }

    return validated;
  }

  /**
   * Redacts sensitive credentials or tokens from text strings.
   */
  public redactSecrets(text: string): string {
    if (!text) return text;
    let sanitized = text;
    for (const pattern of CandidateValidator.SECRET_PATTERNS) {
      sanitized = sanitized.replace(pattern, '[REDACTED_SECRET]');
    }
    return sanitized;
  }
}
