/**
 * @file apps/desktop/src/main/ipc/jira-handlers.ts
 * Main-process IPC handlers for Jira Integration Foundation (V7 Phase 89).
 */

import type { IpcMainInvokeEvent } from 'electron';
import {
  type DesktopResult,
  type DesktopError,
  type DesktopErrorCode,
  type JiraConnectionDto,
  type JiraValidationResultDto,
  type JiraConnectionAuditDto,
  type JiraDiscoveredSiteDto,
  type JiraDiscoveredProjectDto,
  type JiraDiscoveredIssueTypeDto,
  type JiraDiscoveredPriorityDto,
  type JiraDiscoveredFieldDto,
  type JiraDiscoveredComponentDto,
  type JiraDiscoveredAssigneeDto,
  type JiraHealthCheckResultDto,
  type JiraProjectConfigDto,
  type JiraExternalIssueDto,
  type JiraAttachableEvidenceItemDto,
  type JiraAttachmentBatchResultDto,
  type JiraEvidenceAttachmentDto,
  type JiraDuplicateEvaluationDto,
  type JiraIssueLinkDto,
  type ProjectEngineerDto,
  type DefectOwnershipDto,
  createJiraConnectionInputSchema,
  updateJiraConnectionInputSchema,
  getJiraConnectionInputSchema,
  deleteJiraConnectionInputSchema,
  validateJiraConnectionInputSchema,
  listJiraAuditLogInputSchema,
  discoverJiraSitesInputSchema,
  discoverJiraProjectsInputSchema,
  discoverJiraIssueTypesInputSchema,
  discoverJiraPrioritiesInputSchema,
  discoverJiraFieldsInputSchema,
  discoverJiraComponentsInputSchema,
  discoverJiraAssigneesInputSchema,
  getJiraProjectConfigInputSchema,
  saveJiraProjectConfigInputSchema,
  refreshJiraProjectConfigInputSchema,
  testJiraConnectionHealthInputSchema,
  createJiraIssueInputSchema,
  getJiraIssueInputSchema,
  listAttachableEvidenceInputSchema,
  attachEvidenceInputSchema,
  getAttachmentStatusInputSchema,
  evaluateDuplicateInputSchema,
  linkExistingIssueInputSchema,
  getIssueLinkInputSchema,
  registerProjectEngineerInputSchema,
  listEligibleEngineersInputSchema,
  getDefectOwnershipInputSchema,
  assignEngineerInputSchema,
  unassignEngineerInputSchema,
  syncOwnershipFromJiraInputSchema,
  retryJiraSyncInputSchema,
} from '@ai-quality/contracts';
import {
  JiraConnectionService,
  JiraIssueCreationService,
  JiraEvidenceAttachmentService,
  JiraDuplicatePreventionService,
  JiraDefectOwnershipService,
  getPrismaClient,
} from '@ai-quality/core';
import { isTrustedIpcSender } from './sender-validation.js';

import type {
  IJiraEvidenceAttachmentService,
  IJiraDuplicatePreventionService,
  IJiraDefectOwnershipService,
} from '@ai-quality/core';

let sharedJiraService: JiraConnectionService | null = null;
let sharedJiraIssueService: JiraIssueCreationService | null = null;
let sharedJiraEvidenceAttachmentService: IJiraEvidenceAttachmentService | null = null;
let sharedJiraDuplicatePreventionService: IJiraDuplicatePreventionService | null = null;
let sharedJiraDefectOwnershipService: IJiraDefectOwnershipService | null = null;

export function resolveJiraDefectOwnershipService(): IJiraDefectOwnershipService {
  if (sharedJiraDefectOwnershipService) {
    return sharedJiraDefectOwnershipService;
  }
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Prisma client not initialized in desktop process.');
  }
  sharedJiraDefectOwnershipService = new JiraDefectOwnershipService({ prisma });
  return sharedJiraDefectOwnershipService;
}

export function setSharedJiraDefectOwnershipService(
  service: IJiraDefectOwnershipService | null,
): void {
  sharedJiraDefectOwnershipService = service;
}

export function resolveJiraConnectionService(): JiraConnectionService {
  if (sharedJiraService) {
    return sharedJiraService;
  }
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Prisma client not initialized in desktop process.');
  }
  sharedJiraService = new JiraConnectionService({ prisma });
  return sharedJiraService;
}

export function setSharedJiraConnectionService(service: JiraConnectionService | null): void {
  sharedJiraService = service;
}

export function resolveJiraIssueCreationService(): JiraIssueCreationService {
  if (sharedJiraIssueService) {
    return sharedJiraIssueService;
  }
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Prisma client not initialized in desktop process.');
  }
  sharedJiraIssueService = new JiraIssueCreationService({ prisma });
  return sharedJiraIssueService;
}

export function setSharedJiraIssueCreationService(service: JiraIssueCreationService | null): void {
  sharedJiraIssueService = service;
}

export function resolveJiraEvidenceAttachmentService(): IJiraEvidenceAttachmentService {
  if (sharedJiraEvidenceAttachmentService) {
    return sharedJiraEvidenceAttachmentService;
  }
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Prisma client not initialized in desktop process.');
  }
  sharedJiraEvidenceAttachmentService = new JiraEvidenceAttachmentService({ prisma });
  return sharedJiraEvidenceAttachmentService;
}

export function setSharedJiraEvidenceAttachmentService(
  service: IJiraEvidenceAttachmentService | null,
): void {
  sharedJiraEvidenceAttachmentService = service;
}

export function resolveJiraDuplicatePreventionService(): IJiraDuplicatePreventionService {
  if (sharedJiraDuplicatePreventionService) {
    return sharedJiraDuplicatePreventionService;
  }
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Prisma client not initialized in desktop process.');
  }
  sharedJiraDuplicatePreventionService = new JiraDuplicatePreventionService({ prisma });
  return sharedJiraDuplicatePreventionService;
}

export function setSharedJiraDuplicatePreventionService(
  service: IJiraDuplicatePreventionService | null,
): void {
  sharedJiraDuplicatePreventionService = service;
}

function sanitizeError(err: unknown): DesktopError {
  if (err && typeof err === 'object' && 'name' in err && (err as any).name === 'ZodError') {
    return {
      code: 'VALIDATION_ERROR',
      message: (err as any).issues
        ? (err as any).issues.map((i: any) => i.message).join(', ')
        : 'Validation error',
    };
  }

  if (err && typeof err === 'object' && 'code' in err && typeof (err as any).code === 'string') {
    return {
      code: (err as any).code as DesktopErrorCode,
      message: (err as any).message || String(err),
    };
  }

  if (err instanceof Error) {
    return {
      code: 'INTERNAL_ERROR',
      message: err.message,
    };
  }

  return {
    code: 'INTERNAL_ERROR',
    message: String(err),
  };
}

export async function handleCreateJiraConnection(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<JiraConnectionDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const validated = createJiraConnectionInputSchema.parse(input);
    const service = resolveJiraConnectionService();
    const data = await service.createConnection(validated);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleUpdateJiraConnection(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<JiraConnectionDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const validated = updateJiraConnectionInputSchema.parse(input);
    const service = resolveJiraConnectionService();
    const data = await service.updateConnection(validated);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetJiraConnection(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<JiraConnectionDto | null>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const validated = getJiraConnectionInputSchema.parse(input);
    const service = resolveJiraConnectionService();
    const data = await service.getConnection(validated);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleDeleteJiraConnection(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<{ readonly deleted: boolean }>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const validated = deleteJiraConnectionInputSchema.parse(input);
    const service = resolveJiraConnectionService();
    const data = await service.deleteConnection(validated);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleValidateJiraConnection(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<JiraValidationResultDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const validated = validateJiraConnectionInputSchema.parse(input);
    const service = resolveJiraConnectionService();
    const data = await service.validateConnection(validated);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleListJiraAuditLog(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly JiraConnectionAuditDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const validated = listJiraAuditLogInputSchema.parse(input);
    const service = resolveJiraConnectionService();
    const data = await service.listAuditLog(validated);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleDiscoverJiraSites(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly JiraDiscoveredSiteDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const validated = discoverJiraSitesInputSchema.parse(input);
    const service = resolveJiraConnectionService();
    const data = await service.discoverSites(validated);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleDiscoverJiraProjects(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly JiraDiscoveredProjectDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const validated = discoverJiraProjectsInputSchema.parse(input);
    const service = resolveJiraConnectionService();
    const data = await service.discoverProjects(validated);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleDiscoverJiraIssueTypes(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly JiraDiscoveredIssueTypeDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const validated = discoverJiraIssueTypesInputSchema.parse(input);
    const service = resolveJiraConnectionService();
    const data = await service.discoverIssueTypes(validated);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleDiscoverJiraPriorities(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly JiraDiscoveredPriorityDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const validated = discoverJiraPrioritiesInputSchema.parse(input);
    const service = resolveJiraConnectionService();
    const data = await service.discoverPriorities(validated);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleDiscoverJiraFields(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly JiraDiscoveredFieldDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const validated = discoverJiraFieldsInputSchema.parse(input);
    const service = resolveJiraConnectionService();
    const data = await service.discoverFields(validated);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleDiscoverJiraComponents(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly JiraDiscoveredComponentDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const validated = discoverJiraComponentsInputSchema.parse(input);
    const service = resolveJiraConnectionService();
    const data = await service.discoverComponents(validated);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleDiscoverJiraAssignees(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly JiraDiscoveredAssigneeDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const validated = discoverJiraAssigneesInputSchema.parse(input);
    const service = resolveJiraConnectionService();
    const data = await service.discoverAssignees(validated);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetJiraProjectConfig(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<JiraProjectConfigDto | null>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const validated = getJiraProjectConfigInputSchema.parse(input);
    const service = resolveJiraConnectionService();
    const data = await service.getProjectConfig(validated);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleSaveJiraProjectConfig(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<JiraProjectConfigDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const validated = saveJiraProjectConfigInputSchema.parse(input);
    const service = resolveJiraConnectionService();
    const data = await service.saveProjectConfig(validated);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleRefreshJiraProjectConfig(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<JiraProjectConfigDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const validated = refreshJiraProjectConfigInputSchema.parse(input);
    const service = resolveJiraConnectionService();
    const data = await service.refreshProjectConfig(validated);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleTestJiraConnectionHealth(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<JiraHealthCheckResultDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const validated = testJiraConnectionHealthInputSchema.parse(input);
    const service = resolveJiraConnectionService();
    const data = await service.testConnectionHealth(validated);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleCreateJiraIssue(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<JiraExternalIssueDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const validated = createJiraIssueInputSchema.parse(input);
    const service = resolveJiraIssueCreationService();
    const data = await service.createIssue(validated);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetJiraIssue(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<JiraExternalIssueDto | null>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const validated = getJiraIssueInputSchema.parse(input);
    const service = resolveJiraIssueCreationService();
    const data = await service.getIssue(validated);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleListAttachableEvidence(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly JiraAttachableEvidenceItemDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const validated = listAttachableEvidenceInputSchema.parse(input);
    const service = resolveJiraEvidenceAttachmentService();
    const data = await service.listAttachableEvidence(validated);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleAttachEvidence(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<JiraAttachmentBatchResultDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const validated = attachEvidenceInputSchema.parse(input);
    const service = resolveJiraEvidenceAttachmentService();
    const data = await service.attachEvidence(validated);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetAttachmentStatus(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly JiraEvidenceAttachmentDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const validated = getAttachmentStatusInputSchema.parse(input);
    const service = resolveJiraEvidenceAttachmentService();
    const data = await service.getAttachmentStatus(validated);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleEvaluateDuplicate(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<JiraDuplicateEvaluationDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const validated = evaluateDuplicateInputSchema.parse(input);
    const service = resolveJiraDuplicatePreventionService();
    const data = await service.evaluateBeforeCreate(validated);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleLinkExistingIssue(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<JiraIssueLinkDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const validated = linkExistingIssueInputSchema.parse(input);
    const service = resolveJiraDuplicatePreventionService();
    const data = await service.linkExistingIssue(validated);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetIssueLink(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<JiraIssueLinkDto | null>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const validated = getIssueLinkInputSchema.parse(input);
    const service = resolveJiraDuplicatePreventionService();
    const data = await service.getIssueLink(validated);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

// ------------------------------------------------------------------------------
// Phase 94: Engineer Assignment & Defect Ownership Workflow Handlers
// ------------------------------------------------------------------------------

export async function handleRegisterProjectEngineer(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<ProjectEngineerDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const validated = registerProjectEngineerInputSchema.parse(input);
    const service = resolveJiraDefectOwnershipService();
    const data = await service.registerProjectEngineer(validated);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleListEligibleEngineers(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<readonly ProjectEngineerDto[]>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const validated = listEligibleEngineersInputSchema.parse(input);
    const service = resolveJiraDefectOwnershipService();
    const data = await service.listEligibleEngineers(validated);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleGetDefectOwnership(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<DefectOwnershipDto | null>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const validated = getDefectOwnershipInputSchema.parse(input);
    const service = resolveJiraDefectOwnershipService();
    const data = await service.getDefectOwnership(validated);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleAssignEngineer(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<DefectOwnershipDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const validated = assignEngineerInputSchema.parse(input);
    const service = resolveJiraDefectOwnershipService();
    const data = await service.assignEngineer(validated);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleUnassignEngineer(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<DefectOwnershipDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const validated = unassignEngineerInputSchema.parse(input);
    const service = resolveJiraDefectOwnershipService();
    const data = await service.unassignEngineer(validated);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleSyncOwnershipFromJira(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<DefectOwnershipDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const validated = syncOwnershipFromJiraInputSchema.parse(input);
    const service = resolveJiraDefectOwnershipService();
    const data = await service.syncOwnershipFromJira(validated);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}

export async function handleRetryJiraSync(
  event: IpcMainInvokeEvent,
  input: unknown,
): Promise<DesktopResult<DefectOwnershipDto>> {
  if (!isTrustedIpcSender(event)) {
    return {
      ok: false,
      error: {
        code: 'UNAUTHORIZED_SENDER',
        message: 'Untrusted IPC sender origin.',
      },
    };
  }

  try {
    const validated = retryJiraSyncInputSchema.parse(input);
    const service = resolveJiraDefectOwnershipService();
    const data = await service.retryJiraSync(validated);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: sanitizeError(err) };
  }
}
