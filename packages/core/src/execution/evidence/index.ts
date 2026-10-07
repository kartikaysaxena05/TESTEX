/**
 * @file packages/core/src/execution/evidence/index.ts
 * Public exports and singleton factories for Failure Evidence Capture Foundation (V5 Phase 69).
 */

export * from './evidence-types.js';
export * from './evidence-errors.js';
export * from './evidence-redactor.js';
export * from './evidence-storage-service.js';
export * from './execution-evidence-service.js';
export * from './collectors/index.js';
export * from './evidence-capture-coordinator.js';

import { getPrismaClient } from '../../database/client.js';
import { EvidenceStorageService } from './evidence-storage-service.js';
import { ExecutionEvidenceService } from './execution-evidence-service.js';
import type { IExecutionEvidenceService, IEvidenceStorageService } from './evidence-types.js';

let sharedStorageService: IEvidenceStorageService | null = null;
let sharedEvidenceService: IExecutionEvidenceService | null = null;

export function getEvidenceStorageService(): IEvidenceStorageService {
  if (!sharedStorageService) {
    sharedStorageService = new EvidenceStorageService();
  }
  return sharedStorageService;
}

export function setEvidenceStorageService(service: IEvidenceStorageService | null): void {
  sharedStorageService = service;
}

export function getExecutionEvidenceService(): IExecutionEvidenceService {
  if (!sharedEvidenceService) {
    const prisma = getPrismaClient();
    if (!prisma) {
      throw new Error('Prisma client unavailable for ExecutionEvidenceService.');
    }
    const storageService = getEvidenceStorageService();
    sharedEvidenceService = new ExecutionEvidenceService({ prisma, storageService });
  }
  return sharedEvidenceService;
}

export function setExecutionEvidenceService(service: IExecutionEvidenceService | null): void {
  sharedEvidenceService = service;
}
