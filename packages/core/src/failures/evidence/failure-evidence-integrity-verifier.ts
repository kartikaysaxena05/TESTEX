/**
 * @file packages/core/src/failures/evidence/failure-evidence-integrity-verifier.ts
 * Cryptographic and relational integrity validation for failure evidence artifacts (V6 Phase 75).
 */

import * as fs from 'node:fs/promises';
import * as crypto from 'node:crypto';
import {
  FAILURE_EVIDENCE_BOUNDS,
  type EvidenceIntegrityStatus,
  type FailureEvidenceItemReportDto,
} from './failure-evidence-types.js';
import { EvidenceStorageService } from '../../execution/evidence/evidence-storage-service.js';
import type { ILogger } from '../../logging/index.js';

export interface VerifiableEvidenceReference {
  readonly id: string;
  readonly projectId: string;
  readonly testRunId: string;
  readonly executionId: string;
  readonly storageIdentity?: string | null;
  readonly logicalName: string;
  readonly artifactType: any;
  readonly byteSize?: number | null;
  readonly sha256?: string | null;
}

export class FailureEvidenceIntegrityVerifier {
  private readonly storageService: EvidenceStorageService;
  private readonly logger?: ILogger;

  constructor(storageService?: EvidenceStorageService, logger?: ILogger) {
    this.storageService = storageService ?? new EvidenceStorageService(undefined, logger);
    this.logger = logger;
  }

  /**
   * Validates cryptographic SHA-256 and physical presence for an individual evidence reference.
   */
  public async verifyReference(
    reference: VerifiableEvidenceReference,
  ): Promise<FailureEvidenceItemReportDto> {
    // 1. If non-file backed reference (e.g. database-only metadata without storageIdentity)
    if (!reference.storageIdentity) {
      return {
        referenceId: reference.id,
        artifactType: reference.artifactType,
        logicalName: reference.logicalName,
        status: 'VERIFIED',
        details: 'Metadata-only evidence verified by relational constraints',
      };
    }

    try {
      // 2. Resolve safe managed storage path (throws on path traversal)
      const filePath = this.storageService.resolveManagedPath(
        reference.projectId,
        reference.testRunId,
        reference.executionId,
        reference.storageIdentity,
      );

      // 3. Check file existence & stat
      let stat;
      try {
        stat = await fs.stat(filePath);
      } catch (err: any) {
        if (err?.code === 'ENOENT') {
          return {
            referenceId: reference.id,
            artifactType: reference.artifactType,
            logicalName: reference.logicalName,
            status: 'MISSING',
            details: `Artifact file '${reference.storageIdentity}' is missing from managed storage`,
          };
        }
        return {
          referenceId: reference.id,
          artifactType: reference.artifactType,
          logicalName: reference.logicalName,
          status: 'UNAVAILABLE',
          details: `Failed to access file: ${err?.message || 'Access error'}`,
        };
      }

      // 4. Validate file size bounds
      if (stat.size > FAILURE_EVIDENCE_BOUNDS.MAX_ARTIFACT_BYTE_SIZE) {
        return {
          referenceId: reference.id,
          artifactType: reference.artifactType,
          logicalName: reference.logicalName,
          status: 'CORRUPT',
          details: `Artifact byte size (${stat.size}) exceeds safety bound (${FAILURE_EVIDENCE_BOUNDS.MAX_ARTIFACT_BYTE_SIZE})`,
        };
      }

      // 5. Compute SHA-256 hash of actual file bytes
      const fileBuffer = await fs.readFile(filePath);
      const computedSha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

      // 6. Compare with stored SHA-256 if available
      if (reference.sha256 && reference.sha256 !== computedSha256) {
        return {
          referenceId: reference.id,
          artifactType: reference.artifactType,
          logicalName: reference.logicalName,
          status: 'MISMATCH',
          details: `SHA-256 digest mismatch. Stored: ${reference.sha256}, Actual: ${computedSha256}`,
        };
      }

      return {
        referenceId: reference.id,
        artifactType: reference.artifactType,
        logicalName: reference.logicalName,
        status: 'VERIFIED',
        details: null,
      };
    } catch (err: any) {
      this.logger?.warn('evidence_integrity.verification_failed', {
        referenceId: reference.id,
        storageIdentity: reference.storageIdentity,
        error: err?.message,
      });

      return {
        referenceId: reference.id,
        artifactType: reference.artifactType,
        logicalName: reference.logicalName,
        status: 'CORRUPT',
        details: `Integrity check failed: ${err?.message || 'Unknown error'}`,
      };
    }
  }

  /**
   * Verifies multiple evidence references and produces an aggregate integrity report.
   */
  public async verifyBatch(
    projectId: string,
    failureCaseId: string,
    references: readonly VerifiableEvidenceReference[],
  ): Promise<{
    overallIntegrity: EvidenceIntegrityStatus;
    itemsVerified: number;
    itemsMissing: number;
    itemsCorrupt: number;
    itemsUnavailable: number;
    itemReports: FailureEvidenceItemReportDto[];
  }> {
    let itemsVerified = 0;
    let itemsMissing = 0;
    let itemsCorrupt = 0;
    let itemsUnavailable = 0;
    const itemReports: FailureEvidenceItemReportDto[] = [];

    for (const ref of references) {
      const report = await this.verifyReference(ref);
      itemReports.push(report);

      if (report.status === 'VERIFIED') itemsVerified++;
      else if (report.status === 'MISSING') itemsMissing++;
      else if (report.status === 'CORRUPT' || report.status === 'MISMATCH') itemsCorrupt++;
      else itemsUnavailable++;
    }

    let overallIntegrity: EvidenceIntegrityStatus = 'VERIFIED';
    if (itemsCorrupt > 0) overallIntegrity = 'CORRUPT';
    else if (itemsMissing > 0) overallIntegrity = 'MISSING';
    else if (itemsUnavailable > 0) overallIntegrity = 'UNAVAILABLE';
    else if (references.length === 0) overallIntegrity = 'UNVERIFIED';

    return {
      overallIntegrity,
      itemsVerified,
      itemsMissing,
      itemsCorrupt,
      itemsUnavailable,
      itemReports,
    };
  }
}
