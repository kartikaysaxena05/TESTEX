/**
 * @file apps/desktop/src/renderer/features/failures/StructuredBugReportPanel.tsx
 * Structured Bug Report Generation & Failure Intelligence Workspace (V6 Phase 87).
 *
 * Provides:
 * - Comprehensive defect report overview (BUG-XXXXXX, Revision, Defect State, Application Defect indicator)
 * - Triage & classification metadata (Severity, Priority, Calibrated Confidence, Layer, Component, Duplicate Cluster)
 * - Traceability matrix linking historical requirement version, historical test case version, preconditions
 * - Step-by-step reproduction procedure derived from telemetry
 * - Expected vs. Actual behavior comparison with failed step marker
 * - Root-cause hypothesis callout with strict epistemic disclaimer
 * - Evidence artifacts table with SHA-256 and integrity verification status
 * - Explicit known limitations and unknowns boundary declaration
 * - Export actions: Copy as GitHub-flavored Markdown, Copy as JSON
 * - Report regeneration with reason tracking
 * - Historical revision drawer
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type {
  StructuredBugReportDto,
  ApplicationDefectStateDto,
  JiraExternalIssueDto,
  JiraProjectConfigDto,
  JiraAttachableEvidenceItemDto,
  JiraAttachmentBatchResultDto,
  JiraDuplicateEvaluationDto,
  JiraIssueLinkDto,
  ProjectEngineerDto,
  DefectOwnershipDto,
} from '@ai-quality/contracts';
import { WorkflowSyncCard } from '../jira/WorkflowSyncCard.js';
import { DefectReverificationCard } from './DefectReverificationCard.js';

interface StructuredBugReportPanelProps {
  readonly projectId: string;
  readonly failureCaseId: string;
  readonly initialReport?: StructuredBugReportDto;
  readonly initialJiraIssue?: JiraExternalIssueDto | null;
  readonly initialJiraConfig?: JiraProjectConfigDto | null;
  readonly initialAttachableEvidence?: readonly JiraAttachableEvidenceItemDto[];
  readonly initialJiraLink?: JiraIssueLinkDto | null;
  readonly initialDuplicateEvaluation?: JiraDuplicateEvaluationDto | null;
  readonly initialOwnership?: DefectOwnershipDto | null;
  readonly initialEligibleEngineers?: readonly ProjectEngineerDto[];
}

const DEFECT_STATE_STYLES: Record<
  ApplicationDefectStateDto,
  { bg: string; text: string; border: string; label: string; icon: string }
> = {
  CONFIRMED_APPLICATION_DEFECT: {
    bg: 'bg-rose-500/10',
    text: 'text-rose-400',
    border: 'border-rose-500/30',
    label: 'Confirmed Application Defect',
    icon: '🐞',
  },
  SUPPORTED_APPLICATION_DEFECT: {
    bg: 'bg-orange-500/10',
    text: 'text-orange-400',
    border: 'border-orange-500/30',
    label: 'Supported Application Defect',
    icon: '🔍',
  },
  AUTOMATION_FAILURE: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    border: 'border-blue-500/30',
    label: 'Automation / Script Failure',
    icon: '⚙️',
  },
  TEST_DATA_FAILURE: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
    label: 'Test Data Failure',
    icon: '📊',
  },
  ENVIRONMENT_FAILURE: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-400',
    border: 'border-purple-500/30',
    label: 'Environment / Infrastructure Failure',
    icon: '🌐',
  },
  FLAKY_UNSTABLE_FAILURE: {
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-400',
    border: 'border-yellow-500/30',
    label: 'Flaky / Intermittent Failure',
    icon: '🎲',
  },
  INCONCLUSIVE: {
    bg: 'bg-slate-500/10',
    text: 'text-slate-400',
    border: 'border-slate-500/30',
    label: 'Inconclusive Failure',
    icon: '❓',
  },
  UNKNOWN: {
    bg: 'bg-zinc-500/10',
    text: 'text-zinc-400',
    border: 'border-zinc-500/30',
    label: 'Unknown Domain Failure',
    icon: '❔',
  },
  BLOCKED: {
    bg: 'bg-red-500/10',
    text: 'text-red-400',
    border: 'border-red-500/30',
    label: 'Blocked Execution',
    icon: '⛔',
  },
};

export const StructuredBugReportPanel: React.FC<StructuredBugReportPanelProps> = ({
  projectId,
  failureCaseId,
  initialReport,
  initialJiraIssue,
  initialJiraConfig,
  initialAttachableEvidence,
  initialJiraLink,
  initialDuplicateEvaluation,
  initialOwnership,
  initialEligibleEngineers,
}) => {
  const [report, setReport] = useState<StructuredBugReportDto | null>(initialReport ?? null);
  const [history, setHistory] = useState<readonly StructuredBugReportDto[]>(
    initialReport ? [initialReport] : [],
  );
  const [isLoading, setIsLoading] = useState<boolean>(!initialReport);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isRegenerating, setIsRegenerating] = useState<boolean>(false);
  const [showRegenerateModal, setShowRegenerateModal] = useState<boolean>(false);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [regenerationReason, setRegenerationReason] = useState<string>('');
  const [titleOverride, setTitleOverride] = useState<string>('');
  const [copyFeedback, setCopyFeedback] = useState<'MARKDOWN' | 'JSON' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Phase 91: Jira Issue Integration State
  const [jiraIssue, setJiraIssue] = useState<JiraExternalIssueDto | null>(initialJiraIssue ?? null);
  const [jiraConfig, setJiraConfig] = useState<JiraProjectConfigDto | null>(
    initialJiraConfig ?? null,
  );
  const [isLoadingJira, setIsLoadingJira] = useState<boolean>(false);
  const [isCreatingJira, setIsCreatingJira] = useState<boolean>(false);
  const [showJiraConfirmModal, setShowJiraConfirmModal] = useState<boolean>(false);
  const [jiraError, setJiraError] = useState<string | null>(null);

  // Phase 92: Evidence Attachment to Jira State
  const [attachableEvidence, setAttachableEvidence] = useState<
    readonly JiraAttachableEvidenceItemDto[]
  >(initialAttachableEvidence ?? []);
  const [selectedEvidenceIds, setSelectedEvidenceIds] = useState<Set<string>>(
    new Set(
      (initialAttachableEvidence ?? [])
        .filter(item => item.isEligible && !item.isAlreadyAttached)
        .map(item => item.evidenceReferenceId),
    ),
  );
  const [isAttachingEvidence, setIsAttachingEvidence] = useState<boolean>(false);
  const [isLoadingEvidence, setIsLoadingEvidence] = useState<boolean>(false);
  const [showAttachConfirmModal, setShowAttachConfirmModal] = useState<boolean>(false);
  const [attachmentBatchResult, setAttachmentBatchResult] =
    useState<JiraAttachmentBatchResultDto | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  // Phase 93: Jira Duplicate Prevention & Existing-Issue Linking State
  const [jiraLink, setJiraLink] = useState<JiraIssueLinkDto | null>(initialJiraLink ?? null);
  const [duplicateEvaluation, setDuplicateEvaluation] = useState<JiraDuplicateEvaluationDto | null>(
    initialDuplicateEvaluation ?? null,
  );
  const [isLinkingJira, setIsLinkingJira] = useState<boolean>(false);
  const [showLinkConfirmModal, setShowLinkConfirmModal] = useState<boolean>(false);

  // Phase 94: Defect Ownership & Engineer Assignment State
  const [defectOwnership, setDefectOwnership] = useState<DefectOwnershipDto | null>(
    initialOwnership ?? null,
  );
  const [eligibleEngineers, setEligibleEngineers] = useState<readonly ProjectEngineerDto[]>(
    initialEligibleEngineers ?? [],
  );
  const [isLoadingOwnership, setIsLoadingOwnership] = useState<boolean>(false);
  const [isAssigningEngineer, setIsAssigningEngineer] = useState<boolean>(false);
  const [isSyncingFromJira, setIsSyncingFromJira] = useState<boolean>(false);
  const [isRetryingSync, setIsRetryingSync] = useState<boolean>(false);
  const [showAssignModal, setShowAssignModal] = useState<boolean>(false);
  const [showUnassignConfirmModal, setShowUnassignConfirmModal] = useState<boolean>(false);
  const [selectedEngineerId, setSelectedEngineerId] = useState<string>('');
  const [assignmentReason, setAssignmentReason] = useState<string>('');
  const [unassignReason, setUnassignReason] = useState<string>('');
  const [ownershipError, setOwnershipError] = useState<string | null>(null);
  const [showOwnershipHistoryDrawer, setShowOwnershipHistoryDrawer] = useState<boolean>(false);

  const activeCaseRef = useRef<string>(failureCaseId);
  const activeProjectRef = useRef<string>(projectId);

  useEffect(() => {
    activeCaseRef.current = failureCaseId;
    activeProjectRef.current = projectId;
  }, [failureCaseId, projectId]);

  const loadJiraData = useCallback(async () => {
    setIsLoadingJira(true);
    setJiraError(null);
    try {
      const jiraBridge = window.desktop?.jira;
      if (!jiraBridge) return;

      const [configRes, issueRes, linkRes] = await Promise.all([
        jiraBridge.getProjectConfig({ projectId }),
        jiraBridge.getIssue({ projectId, failureCaseId }),
        jiraBridge.getIssueLink({ projectId, failureCaseId }),
      ]);

      if (activeCaseRef.current !== failureCaseId || activeProjectRef.current !== projectId) {
        return;
      }

      if (configRes.ok) {
        setJiraConfig(configRes.data);
      }
      if (issueRes.ok) {
        setJiraIssue(issueRes.data);
      }
      if (linkRes.ok) {
        setJiraLink(linkRes.data);
      }

      const currentIssue = issueRes.ok ? issueRes.data : null;
      const currentLink = linkRes.ok ? linkRes.data : null;

      // If no issue and no active link, evaluate duplicate prevention
      if (!currentIssue && !currentLink) {
        const evalRes = await jiraBridge.evaluateDuplicate({
          projectId,
          failureCaseId,
        });
        if (evalRes.ok && activeCaseRef.current === failureCaseId) {
          setDuplicateEvaluation(evalRes.data);
        }
      } else {
        setDuplicateEvaluation(null);
      }

      const effectiveIssue = currentIssue;
      if (effectiveIssue) {
        setIsLoadingEvidence(true);
        const evidenceRes = await jiraBridge.listAttachableEvidence({
          projectId,
          failureCaseId,
        });
        if (evidenceRes.ok && activeCaseRef.current === failureCaseId) {
          setAttachableEvidence(evidenceRes.data);
          const initialSelected = new Set(
            evidenceRes.data
              .filter(item => item.isEligible && !item.isAlreadyAttached)
              .map(item => item.evidenceReferenceId),
          );
          setSelectedEvidenceIds(initialSelected);
        }
        setIsLoadingEvidence(false);
      }
    } catch {
      // Non-fatal
    } finally {
      if (activeCaseRef.current === failureCaseId && activeProjectRef.current === projectId) {
        setIsLoadingJira(false);
      }
    }
  }, [projectId, failureCaseId]);

  const loadReport = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const bridge = window.desktop?.failures;
      if (!bridge) {
        throw new Error('Desktop failures bridge is unavailable.');
      }

      const res = await bridge.getBugReport({ projectId, failureCaseId });
      if (activeCaseRef.current !== failureCaseId) return;

      if (!res.ok) {
        setError(res.error.message);
        setReport(null);
      } else {
        setReport(res.data);
      }
    } catch (err: unknown) {
      if (activeCaseRef.current !== failureCaseId) return;
      setError(err instanceof Error ? err.message : String(err));
      setReport(null);
    } finally {
      if (activeCaseRef.current === failureCaseId) {
        setIsLoading(false);
      }
    }
  }, [projectId, failureCaseId]);

  const loadHistory = useCallback(async () => {
    try {
      const bridge = window.desktop?.failures;
      if (!bridge) return;

      const res = await bridge.listBugReportHistory({ projectId, failureCaseId });
      if (activeCaseRef.current === failureCaseId && res.ok) {
        setHistory(res.data);
      }
    } catch {
      // Ignored
    }
  }, [projectId, failureCaseId]);

  const loadOwnershipData = useCallback(async () => {
    if (!report?.id) return;
    setIsLoadingOwnership(true);
    setOwnershipError(null);
    try {
      const jiraBridge = window.desktop?.jira;
      if (!jiraBridge) return;

      const [ownershipRes, engineersRes] = await Promise.all([
        jiraBridge.getDefectOwnership({ projectId, bugReportId: report.id }),
        jiraBridge.listEligibleEngineers({ projectId, activeOnly: true }),
      ]);

      if (activeCaseRef.current !== failureCaseId || activeProjectRef.current !== projectId) {
        return;
      }

      if (ownershipRes.ok) {
        setDefectOwnership(ownershipRes.data);
      }
      if (engineersRes.ok) {
        setEligibleEngineers(engineersRes.data);
        if (engineersRes.data.length > 0) {
          setSelectedEngineerId(prev => prev || engineersRes.data[0]?.id || '');
        }
      }
    } catch {
      // Non-fatal
    } finally {
      if (activeCaseRef.current === failureCaseId && activeProjectRef.current === projectId) {
        setIsLoadingOwnership(false);
      }
    }
  }, [projectId, failureCaseId, report?.id]);

  useEffect(() => {
    loadReport();
    loadHistory();
    loadJiraData();
  }, [loadReport, loadHistory, loadJiraData]);

  useEffect(() => {
    if (report?.id) {
      loadOwnershipData();
    }
  }, [report?.id, loadOwnershipData]);

  const handleAssignEngineer = async () => {
    if (!report?.id || !selectedEngineerId) return;
    setIsAssigningEngineer(true);
    setOwnershipError(null);
    try {
      const jiraBridge = window.desktop?.jira;
      if (!jiraBridge) return;
      const res = await jiraBridge.assignEngineer({
        projectId,
        bugReportId: report.id,
        engineerId: selectedEngineerId,
        assignmentReason: assignmentReason.trim() || undefined,
        expectedVersion: defectOwnership?.ownershipVersion,
      });
      if (res.ok) {
        setDefectOwnership(res.data);
        setShowAssignModal(false);
        setAssignmentReason('');
      } else {
        setOwnershipError(res.error.message);
      }
    } catch (err) {
      setOwnershipError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsAssigningEngineer(false);
    }
  };

  const handleUnassignEngineer = async () => {
    if (!report?.id) return;
    setIsAssigningEngineer(true);
    setOwnershipError(null);
    try {
      const jiraBridge = window.desktop?.jira;
      if (!jiraBridge) return;
      const res = await jiraBridge.unassignEngineer({
        projectId,
        bugReportId: report.id,
        reason: unassignReason.trim() || undefined,
        expectedVersion: defectOwnership?.ownershipVersion,
      });
      if (res.ok) {
        setDefectOwnership(res.data);
        setShowUnassignConfirmModal(false);
        setUnassignReason('');
      } else {
        setOwnershipError(res.error.message);
      }
    } catch (err) {
      setOwnershipError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsAssigningEngineer(false);
    }
  };

  const handleSyncOwnershipFromJira = async () => {
    if (!report?.id) return;
    setIsSyncingFromJira(true);
    setOwnershipError(null);
    try {
      const jiraBridge = window.desktop?.jira;
      if (!jiraBridge) return;
      const res = await jiraBridge.syncOwnershipFromJira({
        projectId,
        bugReportId: report.id,
      });
      if (res.ok) {
        setDefectOwnership(res.data);
      } else {
        setOwnershipError(res.error.message);
      }
    } catch (err) {
      setOwnershipError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSyncingFromJira(false);
    }
  };

  const handleRetryJiraSync = async () => {
    if (!report?.id) return;
    setIsRetryingSync(true);
    setOwnershipError(null);
    try {
      const jiraBridge = window.desktop?.jira;
      if (!jiraBridge) return;
      const res = await jiraBridge.retryJiraSync({
        projectId,
        bugReportId: report.id,
      });
      if (res.ok) {
        setDefectOwnership(res.data);
      } else {
        setOwnershipError(res.error.message);
      }
    } catch (err) {
      setOwnershipError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRetryingSync(false);
    }
  };

  const handleCreateJiraIssue = async () => {
    if (!report) return;
    setIsCreatingJira(true);
    setJiraError(null);
    try {
      const jiraBridge = window.desktop?.jira;
      if (!jiraBridge) throw new Error('Desktop Jira bridge is unavailable.');

      const res = await jiraBridge.createIssue({
        projectId,
        failureCaseId,
        bugReportId: report.id,
      });

      if (activeCaseRef.current !== failureCaseId || activeProjectRef.current !== projectId) {
        return;
      }

      if (!res.ok) {
        setJiraError(res.error.message);
      } else {
        setJiraIssue(res.data);
        setShowJiraConfirmModal(false);
        const evidenceRes = await jiraBridge.listAttachableEvidence({
          projectId,
          failureCaseId,
        });
        if (evidenceRes.ok && activeCaseRef.current === failureCaseId) {
          setAttachableEvidence(evidenceRes.data);
          setSelectedEvidenceIds(
            new Set(
              evidenceRes.data
                .filter(item => item.isEligible && !item.isAlreadyAttached)
                .map(item => item.evidenceReferenceId),
            ),
          );
        }
      }
    } catch (err: unknown) {
      if (activeCaseRef.current === failureCaseId && activeProjectRef.current === projectId) {
        setJiraError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (activeCaseRef.current === failureCaseId && activeProjectRef.current === projectId) {
        setIsCreatingJira(false);
      }
    }
  };

  const handleLinkExistingIssue = async () => {
    if (!duplicateEvaluation || !duplicateEvaluation.jiraIssueKey) return;
    setIsLinkingJira(true);
    setJiraError(null);
    try {
      const jiraBridge = window.desktop?.jira;
      if (!jiraBridge) throw new Error('Desktop Jira bridge is unavailable.');

      const linkSource =
        duplicateEvaluation.ruleId === 'JIRA_RULE_3_DEFECT_CLUSTER'
          ? 'SAME_DEFECT_CLUSTER'
          : duplicateEvaluation.ruleId === 'JIRA_RULE_2_EXACT_FAILURE'
            ? 'SAME_FAILURE'
            : duplicateEvaluation.ruleId === 'JIRA_RULE_4_EXTERNAL_METADATA_MATCH'
              ? 'EXTERNAL_EXACT_MATCH'
              : 'USER_CONFIRMED_LINK';

      const res = await jiraBridge.linkExistingIssue({
        projectId,
        failureCaseId,
        bugReportId: report?.id,
        jiraIssueKey: duplicateEvaluation.jiraIssueKey,
        linkReason: duplicateEvaluation.reason,
        linkSource,
      });

      if (activeCaseRef.current !== failureCaseId || activeProjectRef.current !== projectId) {
        return;
      }

      if (!res.ok) {
        setJiraError(res.error.message);
      } else {
        setJiraLink(res.data);
        setShowLinkConfirmModal(false);
        await loadJiraData();
      }
    } catch (err: unknown) {
      if (activeCaseRef.current === failureCaseId && activeProjectRef.current === projectId) {
        setJiraError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (activeCaseRef.current === failureCaseId && activeProjectRef.current === projectId) {
        setIsLinkingJira(false);
      }
    }
  };

  const handleAttachEvidence = async () => {
    if (!jiraIssue || selectedEvidenceIds.size === 0) return;
    setIsAttachingEvidence(true);
    setAttachmentError(null);
    setAttachmentBatchResult(null);
    try {
      const jiraBridge = window.desktop?.jira;
      if (!jiraBridge) throw new Error('Desktop Jira bridge is unavailable.');

      const res = await jiraBridge.attachEvidence({
        projectId,
        externalIssueId: jiraIssue.id,
        evidenceReferenceIds: Array.from(selectedEvidenceIds),
      });

      if (!res.ok) {
        setAttachmentError(res.error.message || 'Failed to attach evidence to Jira.');
        return;
      }

      setAttachmentBatchResult(res.data);
      setShowAttachConfirmModal(false);

      const evidenceRes = await jiraBridge.listAttachableEvidence({
        projectId,
        failureCaseId,
      });
      if (evidenceRes.ok && activeCaseRef.current === failureCaseId) {
        setAttachableEvidence(evidenceRes.data);
        setSelectedEvidenceIds(new Set());
      }
    } catch (err: unknown) {
      setAttachmentError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsAttachingEvidence(false);
    }
  };

  const toggleEvidenceSelection = (refId: string) => {
    setSelectedEvidenceIds(prev => {
      const next = new Set(prev);
      if (next.has(refId)) {
        next.delete(refId);
      } else {
        next.add(refId);
      }
      return next;
    });
  };

  const toggleAllEligibleEvidence = () => {
    const eligibleIds = attachableEvidence
      .filter(item => item.isEligible && !item.isAlreadyAttached)
      .map(item => item.evidenceReferenceId);

    const allSelected =
      eligibleIds.length > 0 && eligibleIds.every(id => selectedEvidenceIds.has(id));
    if (allSelected) {
      setSelectedEvidenceIds(new Set());
    } else {
      setSelectedEvidenceIds(new Set(eligibleIds));
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const bridge = window.desktop?.failures;
      if (!bridge) throw new Error('Desktop failures bridge is unavailable.');

      const res = await bridge.createBugReport({ projectId, failureCaseId });
      if (activeCaseRef.current !== failureCaseId) return;

      if (!res.ok) {
        setError(res.error.message);
      } else {
        setReport(res.data);
        loadHistory();
      }
    } catch (err: unknown) {
      if (activeCaseRef.current !== failureCaseId) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (activeCaseRef.current === failureCaseId) {
        setIsGenerating(false);
      }
    }
  };

  const handleRegenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regenerationReason.trim()) return;

    setIsRegenerating(true);
    setError(null);

    try {
      const bridge = window.desktop?.failures;
      if (!bridge) throw new Error('Desktop failures bridge is unavailable.');

      const res = await bridge.regenerateBugReport({
        projectId,
        failureCaseId,
        reason: regenerationReason.trim(),
        titleOverride: titleOverride.trim() || undefined,
      });

      if (activeCaseRef.current !== failureCaseId) return;

      if (!res.ok) {
        setError(res.error.message);
      } else {
        setReport(res.data);
        setShowRegenerateModal(false);
        setRegenerationReason('');
        setTitleOverride('');
        loadHistory();
      }
    } catch (err: unknown) {
      if (activeCaseRef.current !== failureCaseId) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (activeCaseRef.current === failureCaseId) {
        setIsRegenerating(false);
      }
    }
  };

  const handleCopyMarkdown = async () => {
    if (!report?.reportMarkdown) return;
    try {
      await navigator.clipboard.writeText(report.reportMarkdown);
      setCopyFeedback('MARKDOWN');
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch {
      // Fallback
    }
  };

  const handleCopyJson = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      setCopyFeedback('JSON');
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch {
      // Fallback
    }
  };

  if (isLoading) {
    return (
      <div
        data-testid="bug-report-loading"
        className="p-8 flex items-center justify-center space-x-3 text-slate-400 bg-slate-900/50 rounded-lg border border-slate-800"
      >
        <div className="w-5 h-5 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm font-medium">Loading structured bug report...</span>
      </div>
    );
  }

  if (error && !report) {
    return (
      <div
        data-testid="bug-report-error"
        className="p-6 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-300 space-y-3"
      >
        <div className="flex items-center space-x-2 font-semibold">
          <span>⚠️ Error Loading Bug Report:</span>
        </div>
        <p className="text-sm">{error}</p>
        <button
          onClick={loadReport}
          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs font-semibold"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!report) {
    return (
      <div
        data-testid="bug-report-empty"
        className="p-8 bg-slate-900/40 border border-slate-800 rounded-lg text-center space-y-4"
      >
        <div className="text-4xl">🐞</div>
        <h3 className="text-base font-bold text-slate-200">No Bug Report Generated Yet</h3>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          Synthesize multi-phase failure intelligence into an auditable internal defect report with
          step reproduction, expected vs actual behavior, and secret redaction.
        </p>
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          data-testid="btn-generate-bug-report"
          className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded text-xs font-semibold shadow-md transition inline-flex items-center space-x-2"
        >
          {isGenerating ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Generating Report...</span>
            </>
          ) : (
            <span>Generate Bug Report (Phase 87)</span>
          )}
        </button>
      </div>
    );
  }

  const defectStyle = DEFECT_STATE_STYLES[report.defectState] || DEFECT_STATE_STYLES.UNKNOWN;

  return (
    <div data-testid="structured-bug-report-panel" className="space-y-6">
      {/* Dynamic Staleness Banner */}
      {report.isStale && (
        <div
          data-testid="bug-report-stale-alert"
          className="p-4 bg-amber-500/15 border border-amber-500/40 rounded-lg flex items-center justify-between text-amber-300"
        >
          <div className="flex items-center space-x-3">
            <span className="text-xl">⚠️</span>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider">Report Stale</div>
              <p className="text-xs text-amber-200/90 mt-0.5">
                {report.stalenessReason ||
                  'Underlying evidence or analysis artifacts have been updated since this report was generated.'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowRegenerateModal(true)}
            data-testid="btn-stale-regenerate"
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded shadow transition"
          >
            Regenerate Now
          </button>
        </div>
      )}

      {/* Header Bar */}
      <div className="p-5 bg-slate-900/60 border border-slate-800 rounded-lg flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center space-x-2.5">
            <span
              data-testid="badge-report-number"
              className="px-2.5 py-1 bg-slate-800 text-rose-400 font-mono font-bold text-sm rounded border border-rose-500/30"
            >
              {report.reportNumber}
            </span>
            <span
              data-testid="badge-revision"
              className="px-2 py-0.5 bg-slate-800 text-slate-300 font-mono text-xs rounded border border-slate-700"
            >
              Rev {report.revision}
            </span>
            <span
              data-testid="badge-status"
              className={`px-2 py-0.5 rounded text-xs font-semibold border ${
                report.status === 'READY'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {report.status}
            </span>
            <span
              data-testid="badge-defect-state"
              className={`px-2.5 py-0.5 rounded text-xs font-semibold border flex items-center space-x-1 ${defectStyle.bg} ${defectStyle.text} ${defectStyle.border}`}
            >
              <span>{defectStyle.icon}</span>
              <span>{defectStyle.label}</span>
            </span>
            <span
              data-testid="badge-application-defect"
              className={`px-2 py-0.5 rounded text-xs font-semibold border ${
                report.isApplicationDefect
                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
              }`}
            >
              {report.isApplicationDefect ? 'APPLICATION DEFECT' : 'DIAGNOSTIC REPORT'}
            </span>
          </div>
          <h2 data-testid="report-title" className="text-base font-bold text-slate-100">
            {report.title}
          </h2>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2">
          <button
            onClick={handleCopyMarkdown}
            data-testid="btn-copy-markdown"
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-semibold border border-slate-700 transition flex items-center space-x-1.5"
          >
            <span>📋</span>
            <span>{copyFeedback === 'MARKDOWN' ? 'Copied MD!' : 'Copy Markdown'}</span>
          </button>
          <button
            onClick={handleCopyJson}
            data-testid="btn-copy-json"
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-semibold border border-slate-700 transition flex items-center space-x-1.5"
          >
            <span>{copyFeedback === 'JSON' ? 'Copied JSON!' : 'Copy JSON'}</span>
          </button>
          <button
            onClick={() => setShowRegenerateModal(true)}
            data-testid="btn-open-regenerate-modal"
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs font-semibold shadow transition"
          >
            Regenerate
          </button>
          <button
            onClick={() => setShowHistoryModal(true)}
            data-testid="btn-open-history"
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-medium border border-slate-700 transition"
          >
            History ({history.length || 1})
          </button>
        </div>
      </div>

      {/* Grid: Triage Overview & Traceability */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Triage Intelligence Card */}
        <div className="p-5 bg-slate-900/50 border border-slate-800 rounded-lg space-y-4">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-2">
            <span>🎯</span>
            <span>Triage & Impact Overview</span>
          </h3>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-slate-950/60 rounded border border-slate-800/80">
              <span className="text-slate-500 block">Severity</span>
              <span
                data-testid="meta-severity"
                className="font-bold text-slate-200 text-sm mt-0.5 block"
              >
                {report.severity || 'Unassessed'}
              </span>
            </div>
            <div className="p-3 bg-slate-950/60 rounded border border-slate-800/80">
              <span className="text-slate-500 block">Priority</span>
              <span
                data-testid="meta-priority"
                className="font-bold text-slate-200 text-sm mt-0.5 block"
              >
                {report.priority || 'Unassessed'}
              </span>
            </div>
            <div className="p-3 bg-slate-950/60 rounded border border-slate-800/80">
              <span className="text-slate-500 block">Calibrated Confidence</span>
              <span
                data-testid="meta-confidence"
                className="font-bold text-emerald-400 text-sm mt-0.5 block"
              >
                {report.calibratedScore !== null && report.calibratedScore !== undefined
                  ? `${(report.calibratedScore * 100).toFixed(1)}%`
                  : 'N/A'}
              </span>
            </div>
            <div className="p-3 bg-slate-950/60 rounded border border-slate-800/80">
              <span className="text-slate-500 block">Duplicate Cluster</span>
              <span
                data-testid="meta-cluster"
                className="font-mono text-slate-200 text-xs mt-0.5 block truncate"
              >
                {report.clusterKey
                  ? `${report.clusterKey} (${report.clusterMemberCount || 1})`
                  : 'Unique / Isolated'}
              </span>
            </div>
          </div>

          <div className="p-3 bg-slate-950/60 rounded border border-slate-800/80 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Probable Architecture Layer:</span>
              <span data-testid="meta-probable-layer" className="font-semibold text-slate-300">
                {report.probableLayer || 'Unknown'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Probable Component:</span>
              <span data-testid="meta-probable-component" className="font-semibold text-slate-300">
                {report.probableComponent || 'Unknown'}
              </span>
            </div>
          </div>

          {/* Executive Summary */}
          <div className="space-y-1">
            <span className="text-slate-400 text-xs font-semibold">Executive Summary:</span>
            <p
              data-testid="report-summary"
              className="text-xs text-slate-300 bg-slate-950/40 p-3 rounded border border-slate-800/60 leading-relaxed whitespace-pre-wrap"
            >
              {report.summary}
            </p>
          </div>
        </div>

        {/* Traceability Matrix Card */}
        <div className="p-5 bg-slate-900/50 border border-slate-800 rounded-lg space-y-4">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-2">
            <span>🔗</span>
            <span>Historical Requirement & Test Traceability</span>
          </h3>

          <div className="space-y-2 text-xs">
            <div className="p-3 bg-slate-950/60 rounded border border-slate-800/80 flex justify-between items-center">
              <div>
                <span className="text-slate-500 block">Historical Requirement Version</span>
                <span
                  data-testid="trace-requirement"
                  className="font-bold text-slate-200 mt-0.5 block"
                >
                  {report.requirementKey
                    ? `${report.requirementKey} (v${report.requirementVersion ?? 1})`
                    : 'Unlinked / Indirect'}
                </span>
              </div>
              <span className="text-xs text-slate-500 font-mono">
                {report.requirementId || 'N/A'}
              </span>
            </div>

            <div className="p-3 bg-slate-950/60 rounded border border-slate-800/80 flex justify-between items-center">
              <div>
                <span className="text-slate-500 block">Executed Test Case Version</span>
                <span
                  data-testid="trace-testcase"
                  className="font-bold text-slate-200 mt-0.5 block"
                >
                  {report.testCaseKey
                    ? `${report.testCaseKey} (v${report.testCaseVersion ?? 1})`
                    : 'Test Case'}
                </span>
              </div>
              <span className="text-xs text-slate-500 font-mono">{report.testCaseId || 'N/A'}</span>
            </div>
          </div>

          {/* Preconditions */}
          <div className="space-y-1.5">
            <span className="text-slate-400 text-xs font-semibold">Preconditions:</span>
            {report.preconditions.length > 0 ? (
              <ul data-testid="preconditions-list" className="space-y-1 text-xs text-slate-300">
                {report.preconditions.map((p, idx) => (
                  <li key={idx} className="flex items-start space-x-2">
                    <span className="text-rose-400 font-mono">•</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-xs text-slate-500 italic block">
                No explicit preconditions specified.
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Jira Issue Integration Card (V7 Phase 91) */}
      <div className="p-5 bg-slate-900/50 border border-slate-800 rounded-lg space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-2">
            <span>🎟️</span>
            <span>Jira Issue Integration</span>
          </h3>
          {jiraIssue ? (
            <span
              data-testid="jira-status-badge"
              className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
            >
              Created
            </span>
          ) : jiraLink ? (
            <span
              data-testid="jira-status-badge"
              className="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30"
            >
              Linked
            </span>
          ) : duplicateEvaluation?.decision === 'USE_EXISTING' ? (
            <span
              data-testid="jira-status-badge"
              className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30"
            >
              Duplicate Found
            </span>
          ) : duplicateEvaluation?.decision === 'INCONCLUSIVE' ? (
            <span
              data-testid="jira-status-badge"
              className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30"
            >
              Conflict Detected
            </span>
          ) : duplicateEvaluation?.decision === 'BLOCKED' ? (
            <span
              data-testid="jira-status-badge"
              className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30"
            >
              Blocked
            </span>
          ) : !jiraConfig ? (
            <span
              data-testid="jira-status-badge"
              className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30"
            >
              Not Configured
            </span>
          ) : jiraConfig.configStatus !== 'CONFIGURED' ? (
            <span
              data-testid="jira-status-badge"
              className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30"
            >
              Config Stale
            </span>
          ) : !report.isApplicationDefect ||
            (report.defectState !== 'CONFIRMED_APPLICATION_DEFECT' &&
              report.defectState !== 'SUPPORTED_APPLICATION_DEFECT') ? (
            <span
              data-testid="jira-status-badge"
              className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-800 text-slate-400 border border-slate-700"
            >
              Ineligible
            </span>
          ) : (
            <span
              data-testid="jira-status-badge"
              className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30"
            >
              Not Created
            </span>
          )}
        </div>

        {jiraError && (
          <div
            data-testid="jira-error-alert"
            className="p-3 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-300 space-y-1"
          >
            <div className="font-semibold flex items-center space-x-1.5">
              <span>⚠️</span>
              <span>Jira Operation Failed</span>
            </div>
            <p>{jiraError}</p>
          </div>
        )}

        {jiraIssue ? (
          <div className="p-3.5 bg-slate-950/60 rounded border border-slate-800/80 space-y-2.5 text-xs">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-slate-500 block">Jira Issue Key:</span>
                <span
                  data-testid="jira-issue-key"
                  className="font-mono text-base font-bold text-emerald-400 mt-0.5 block"
                >
                  {jiraIssue.jiraIssueKey}
                </span>
              </div>
              <button
                type="button"
                data-testid="btn-open-jira-issue"
                onClick={() => {
                  if (jiraIssue.jiraIssueUrl) {
                    window.open(jiraIssue.jiraIssueUrl, '_blank');
                  }
                }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-semibold border border-slate-700 transition flex items-center space-x-1"
              >
                <span>Open Jira Issue</span>
                <span>↗</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 border-t border-slate-800/60 pt-2">
              <div>
                <span className="text-slate-500 block">Project:</span>
                <span className="font-medium text-slate-300">{jiraIssue.jiraProjectKey}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Issue Type:</span>
                <span className="font-medium text-slate-300">{jiraIssue.issueType}</span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-500 block">Created At:</span>
                <span className="font-mono text-slate-300">
                  {new Date(jiraIssue.createdAt).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Phase 92: Evidence Attachment Section */}
            <div
              data-testid="jira-evidence-attachment-section"
              className="mt-3 border-t border-slate-800/80 pt-3 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-slate-200">
                    Execution Evidence & Artifact Attachments
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Select verified evidence artifacts to attach to Jira issue{' '}
                    {jiraIssue.jiraIssueKey}.
                  </p>
                </div>
                {attachableEvidence.length > 0 && (
                  <button
                    type="button"
                    data-testid="btn-toggle-select-all-evidence"
                    onClick={toggleAllEligibleEvidence}
                    className="text-[11px] text-blue-400 hover:text-blue-300 transition underline"
                  >
                    Select/Deselect Eligible
                  </button>
                )}
              </div>

              {attachmentError && (
                <div
                  data-testid="jira-attachment-error-alert"
                  className="p-2.5 bg-rose-950/40 border border-rose-500/30 rounded text-rose-300 text-xs"
                >
                  {attachmentError}
                </div>
              )}

              {attachmentBatchResult && (
                <div
                  data-testid="jira-attachment-success-banner"
                  className="p-2.5 bg-emerald-950/40 border border-emerald-500/30 rounded text-emerald-300 text-xs flex justify-between items-center"
                >
                  <span>
                    Batch result: {attachmentBatchResult.attachedCount} attached,{' '}
                    {attachmentBatchResult.blockedCount} blocked,{' '}
                    {attachmentBatchResult.skippedCount} skipped,{' '}
                    {attachmentBatchResult.failedCount} failed
                  </span>
                  <button
                    type="button"
                    onClick={() => setAttachmentBatchResult(null)}
                    className="text-emerald-400 hover:text-emerald-200 text-xs ml-2"
                  >
                    ✕
                  </button>
                </div>
              )}

              {isLoadingEvidence ? (
                <div className="py-4 text-center text-xs text-slate-400">
                  Loading attachable evidence...
                </div>
              ) : attachableEvidence.length === 0 ? (
                <div className="py-2 text-center text-xs text-slate-500 italic">
                  No evidence artifacts found for this failure case.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {attachableEvidence.map(item => {
                    const isSelected = selectedEvidenceIds.has(item.evidenceReferenceId);
                    const isTrace = item.artifactType === 'PLAYWRIGHT_TRACE';
                    const isDisabled = !item.isEligible || item.isAlreadyAttached;

                    return (
                      <div
                        key={item.evidenceReferenceId}
                        data-testid={`evidence-row-${item.evidenceReferenceId}`}
                        className={`p-2 rounded border transition flex items-center justify-between text-xs ${
                          item.isAlreadyAttached
                            ? 'bg-emerald-950/10 border-emerald-900/40 text-slate-300'
                            : isTrace
                              ? 'bg-amber-950/10 border-amber-900/30 text-slate-400'
                              : isSelected
                                ? 'bg-blue-950/20 border-blue-500/40 text-slate-200'
                                : 'bg-slate-900/50 border-slate-800/80 text-slate-400'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                          <input
                            type="checkbox"
                            data-testid={`checkbox-evidence-${item.evidenceReferenceId}`}
                            disabled={isDisabled}
                            checked={isSelected}
                            onChange={() => toggleEvidenceSelection(item.evidenceReferenceId)}
                            className="rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-0 focus:ring-offset-0 disabled:opacity-30 cursor-pointer"
                          />
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
                            {item.artifactType}
                          </span>
                          <span
                            className="truncate text-[11px] text-slate-200 font-medium"
                            title={item.logicalName}
                          >
                            {item.logicalName}
                          </span>
                          {item.byteSize !== undefined && item.byteSize !== null && (
                            <span className="text-[10px] text-slate-500 font-mono">
                              ({(item.byteSize / 1024).toFixed(1)} KB)
                            </span>
                          )}
                        </div>

                        <div className="flex items-center space-x-2 ml-2 flex-shrink-0">
                          {item.requiresRedaction && (
                            <span
                              data-testid={`badge-redaction-${item.evidenceReferenceId}`}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/30 text-blue-400 border border-blue-800/50"
                              title="Text secrets and credentials will be automatically masked"
                            >
                              Auto-Redaction
                            </span>
                          )}

                          {item.isAlreadyAttached ? (
                            <span
                              data-testid={`badge-status-${item.evidenceReferenceId}`}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/30 text-emerald-400 border border-emerald-800/50"
                            >
                              Attached
                            </span>
                          ) : isTrace ? (
                            <span
                              data-testid={`badge-status-${item.evidenceReferenceId}`}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/30 text-amber-400 border border-amber-800/50"
                              title={
                                item.ineligibilityReason ??
                                'Sensitive trace content cannot be safely sanitized; manual review required'
                              }
                            >
                              Blocked (Trace)
                            </span>
                          ) : !item.isEligible ? (
                            <span
                              data-testid={`badge-status-${item.evidenceReferenceId}`}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-rose-900/30 text-rose-400 border border-rose-800/50"
                              title={item.ineligibilityReason ?? 'Ineligible'}
                            >
                              Ineligible
                            </span>
                          ) : (
                            <span
                              data-testid={`badge-status-${item.evidenceReferenceId}`}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700"
                            >
                              Ready
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  data-testid="btn-attach-evidence"
                  disabled={selectedEvidenceIds.size === 0 || isAttachingEvidence}
                  onClick={() => setShowAttachConfirmModal(true)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white rounded text-xs font-semibold shadow transition flex items-center space-x-1.5"
                >
                  <span>
                    {isAttachingEvidence
                      ? 'Attaching Evidence...'
                      : `Attach Selected Evidence (${selectedEvidenceIds.size})`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        ) : jiraLink ? (
          <div
            data-testid="jira-linked-issue-card"
            className="p-3.5 bg-slate-950/60 rounded border border-purple-800/40 space-y-3 text-xs"
          >
            <div className="flex justify-between items-center">
              <div>
                <span className="text-slate-500 block">Linked Jira Issue:</span>
                <div className="flex items-center space-x-2 mt-0.5">
                  <span
                    data-testid="jira-issue-key"
                    className="font-mono text-base font-bold text-purple-400 block"
                  >
                    {jiraLink.jiraIssueKey}
                  </span>
                  <span
                    data-testid="jira-link-source-badge"
                    className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30"
                  >
                    {jiraLink.linkSource === 'SAME_DEFECT_CLUSTER'
                      ? 'Defect Cluster Link'
                      : jiraLink.linkSource === 'SAME_FAILURE'
                        ? 'Exact Failure Link'
                        : jiraLink.linkSource === 'EXTERNAL_EXACT_MATCH'
                          ? 'Remote Metadata Match'
                          : jiraLink.linkSource === 'USER_CONFIRMED_LINK'
                            ? 'User Confirmed Link'
                            : 'Linked Issue'}
                  </span>
                  {jiraLink.defectClusterId && (
                    <span
                      data-testid="jira-cluster-badge"
                      className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700"
                    >
                      Cluster Linked
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                data-testid="btn-open-jira-issue"
                onClick={() => {
                  if (jiraLink.jiraIssueUrl) {
                    window.open(jiraLink.jiraIssueUrl, '_blank');
                  }
                }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-semibold border border-slate-700 transition flex items-center space-x-1"
              >
                <span>Open Jira Issue</span>
                <span>↗</span>
              </button>
            </div>

            <div className="p-2.5 bg-slate-900/60 rounded border border-slate-800 text-[11px] text-slate-400">
              <span className="font-semibold text-slate-300 block mb-0.5">Linking Provenance:</span>
              <p data-testid="jira-link-reason">{jiraLink.linkReason}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 border-t border-slate-800/60 pt-2">
              <div>
                <span className="text-slate-500 block">Project:</span>
                <span className="font-medium text-slate-300">{jiraLink.jiraProjectKey}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Linked At:</span>
                <span className="font-mono text-slate-300">
                  {new Date(jiraLink.createdAt).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-xs">
            {/* Duplicate Detected Banner */}
            {duplicateEvaluation?.decision === 'USE_EXISTING' && (
              <div
                data-testid="jira-duplicate-detected-banner"
                className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded text-xs text-amber-300 space-y-2"
              >
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <div className="font-bold flex items-center space-x-2">
                      <span>🔍</span>
                      <span>Existing Jira Issue Found</span>
                      <span
                        data-testid="jira-duplicate-rule-id"
                        className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/40"
                      >
                        {duplicateEvaluation.ruleId}
                      </span>
                    </div>
                    <p
                      data-testid="jira-duplicate-reason"
                      className="text-amber-200/90 text-[11px]"
                    >
                      {duplicateEvaluation.reason}
                    </p>
                    <div className="flex items-center space-x-2 pt-1">
                      <span className="text-slate-400 text-[11px]">Matching Issue:</span>
                      <span
                        data-testid="jira-duplicate-issue-key"
                        className="font-mono font-bold text-amber-300"
                      >
                        {duplicateEvaluation.jiraIssueKey}
                      </span>
                      {duplicateEvaluation.defectClusterKey && (
                        <span
                          data-testid="jira-defect-cluster-match-badge"
                          className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700"
                        >
                          Cluster: {duplicateEvaluation.defectClusterKey}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    data-testid="btn-link-existing-jira-issue"
                    disabled={isLinkingJira}
                    onClick={() => setShowLinkConfirmModal(true)}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-semibold shadow transition whitespace-nowrap flex items-center space-x-1"
                  >
                    <span>🔗</span>
                    <span>Link Existing Issue</span>
                  </button>
                </div>
              </div>
            )}

            {/* Inconclusive / Conflict Banner */}
            {duplicateEvaluation?.decision === 'INCONCLUSIVE' && (
              <div
                data-testid="jira-duplicate-conflict-banner"
                className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded text-xs text-rose-300 space-y-1.5"
              >
                <div className="font-bold flex items-center space-x-2">
                  <span>⚠️</span>
                  <span>Defect Cluster Conflict Detected</span>
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-rose-500/20 text-rose-300 border border-rose-500/40">
                    {duplicateEvaluation.ruleId}
                  </span>
                </div>
                <p className="text-rose-200/90 text-[11px]">{duplicateEvaluation.reason}</p>
                <p className="text-rose-400 text-[10px] italic">
                  Manual triage required before linking or creating Jira issues.
                </p>
              </div>
            )}

            <div className="p-3 bg-slate-950/60 rounded border border-slate-800/80 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Target Project:</span>
                <span data-testid="jira-target-project" className="font-semibold text-slate-300">
                  {jiraConfig
                    ? `${jiraConfig.jiraProjectKey} (${jiraConfig.jiraProjectName})`
                    : 'Not configured'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Configured Issue Type:</span>
                <span data-testid="jira-target-issue-type" className="font-semibold text-slate-300">
                  {jiraConfig ? jiraConfig.selectedIssueTypeName : 'N/A'}
                </span>
              </div>
              {jiraConfig?.defaultPriorityName && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Default Priority:</span>
                  <span className="text-slate-300">{jiraConfig.defaultPriorityName}</span>
                </div>
              )}
            </div>

            {jiraConfig &&
              jiraConfig.configStatus === 'CONFIGURED' &&
              report.isApplicationDefect &&
              (report.defectState === 'CONFIRMED_APPLICATION_DEFECT' ||
                report.defectState === 'SUPPORTED_APPLICATION_DEFECT') &&
              (!duplicateEvaluation || duplicateEvaluation.decision === 'CREATE_NEW') && (
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    data-testid="btn-create-jira-issue"
                    disabled={isCreatingJira || isLoadingJira}
                    onClick={() => setShowJiraConfirmModal(true)}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded text-xs font-semibold shadow transition flex items-center space-x-1.5"
                  >
                    <span>Create Jira Issue</span>
                  </button>
                </div>
              )}

            {(!report.isApplicationDefect ||
              (report.defectState !== 'CONFIRMED_APPLICATION_DEFECT' &&
                report.defectState !== 'SUPPORTED_APPLICATION_DEFECT')) && (
              <p className="text-slate-500 text-[11px] italic">
                Jira issue creation is restricted to verified application defects. Automation,
                environment, or inconclusive runs cannot be published as Jira bugs.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Phase 94: Defect Ownership & Assignment Card */}
      <div
        data-testid="defect-ownership-card"
        className="p-5 bg-slate-900/50 border border-slate-800 rounded-lg space-y-4"
      >
        <div className="flex justify-between items-center pb-2 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <span className="text-base">👤</span>
            <div>
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                Defect Ownership & Engineer Assignment
              </h3>
              <p className="text-[11px] text-slate-400">
                Authoritative defect ownership, engineer routing, and bi-directional Jira assignee
                sync
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span
              data-testid="defect-ownership-version"
              className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700"
            >
              {`v${defectOwnership?.ownershipVersion ?? 1}`}
            </span>
            {defectOwnership?.jiraAssigneeSyncStatus === 'SYNCHRONIZED' && (
              <span
                data-testid="jira-sync-status-badge"
                className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center space-x-1"
              >
                <span>✓</span>
                <span>Synced with Jira</span>
              </span>
            )}
            {defectOwnership?.jiraAssigneeSyncStatus === 'JIRA_SYNC_FAILED' && (
              <span
                data-testid="jira-sync-status-badge"
                className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30 flex items-center space-x-1"
              >
                <span>⚠️</span>
                <span>Jira Sync Failed</span>
              </span>
            )}
            {defectOwnership?.jiraAssigneeSyncStatus === 'CONFLICT_DETECTED' && (
              <span
                data-testid="jira-sync-status-badge"
                className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center space-x-1"
              >
                <span>⚠️</span>
                <span>Assignee Conflict</span>
              </span>
            )}
            {(!defectOwnership || defectOwnership.jiraAssigneeSyncStatus === 'NOT_APPLICABLE') && (
              <span
                data-testid="jira-sync-status-badge"
                className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700"
              >
                Internal Only
              </span>
            )}
          </div>
        </div>

        {ownershipError && (
          <div
            data-testid="defect-ownership-error-banner"
            className="p-3 bg-rose-500/10 border border-rose-500/30 rounded text-xs text-rose-400 flex justify-between items-center"
          >
            <span>{ownershipError}</span>
            <button
              type="button"
              onClick={() => setOwnershipError(null)}
              className="text-rose-300 hover:text-rose-200 text-xs font-bold ml-2"
            >
              ✕
            </button>
          </div>
        )}

        {defectOwnership?.lastJiraSyncError &&
          defectOwnership.jiraAssigneeSyncStatus === 'JIRA_SYNC_FAILED' && (
            <div
              data-testid="jira-sync-error-banner"
              className="p-3 bg-rose-950/20 border border-rose-500/30 rounded text-xs text-rose-300 space-y-2"
            >
              <div className="flex justify-between items-start">
                <div>
                  <span className="font-bold flex items-center space-x-1">
                    <span>⚠️</span>
                    <span>Jira Assignee Sync Failed:</span>
                  </span>
                  <p className="text-[11px] text-rose-200/90 mt-0.5">
                    {defectOwnership.lastJiraSyncError}
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="btn-retry-jira-sync"
                  disabled={isRetryingSync}
                  onClick={handleRetryJiraSync}
                  className="px-2.5 py-1 bg-rose-800 hover:bg-rose-700 text-white rounded text-[11px] font-semibold transition flex items-center space-x-1"
                >
                  <span>🔄</span>
                  <span>{isRetryingSync ? 'Retrying...' : 'Retry Sync'}</span>
                </button>
              </div>
            </div>
          )}

        {/* Current Owner Details */}
        <div className="p-4 bg-slate-950/60 rounded border border-slate-800/80 space-y-3 text-xs">
          {defectOwnership?.assignedEngineer ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <span className="text-slate-500 block text-[11px]">Assigned Engineer:</span>
                  <span
                    data-testid="defect-owner-name"
                    className="font-bold text-slate-100 text-sm"
                  >
                    {defectOwnership.assignedEngineer.displayName}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Email Address:</span>
                  <span data-testid="defect-owner-email" className="font-mono text-slate-300">
                    {defectOwnership.assignedEngineer.email}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Jira Account / Identity:</span>
                  <span
                    data-testid="defect-owner-jira-account"
                    className="font-mono text-slate-300"
                  >
                    {defectOwnership.assignedEngineer.jiraAccountId ??
                      defectOwnership.assignedEngineer.jiraUsername ??
                      'Not Linked'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-800/60">
                <div>
                  <span className="text-slate-500 block text-[11px]">Assignment Source:</span>
                  <span className="font-mono text-slate-300">
                    {defectOwnership.assignmentSource}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Assigned At:</span>
                  <span className="font-mono text-slate-300">
                    {defectOwnership.assignedAt
                      ? new Date(defectOwnership.assignedAt).toLocaleString()
                      : 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Linked Jira Issue:</span>
                  <span className="font-mono text-slate-300">
                    {defectOwnership.jiraIssueKey ??
                      jiraIssue?.jiraIssueKey ??
                      jiraLink?.jiraIssueKey ??
                      'None'}
                  </span>
                </div>
              </div>

              {defectOwnership.assignmentReason && (
                <div className="pt-2 border-t border-slate-800/60 text-[11px]">
                  <span className="text-slate-500 block">Assignment Reason:</span>
                  <p
                    data-testid="defect-assignment-reason"
                    className="text-slate-300 mt-0.5 italic"
                  >
                    "{defectOwnership.assignmentReason}"
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div
              data-testid="defect-owner-unassigned"
              className="py-2 text-center text-slate-400 space-y-1"
            >
              <span className="text-xl block">👤</span>
              <p className="font-medium text-slate-300">Unassigned</p>
              <p className="text-[11px] text-slate-500">
                No engineer currently owns this defect. Assign an engineer to route triage and
                remediation.
              </p>
            </div>
          )}
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap justify-between items-center pt-1 gap-2">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              data-testid="btn-view-ownership-history"
              onClick={() => setShowOwnershipHistoryDrawer(true)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-semibold transition flex items-center space-x-1.5"
            >
              <span>📜</span>
              <span>{`Ownership History (${defectOwnership?.history?.length ?? 0})`}</span>
            </button>
            {(jiraIssue || jiraLink) && (
              <button
                type="button"
                data-testid="btn-sync-from-jira"
                disabled={isSyncingFromJira}
                onClick={handleSyncOwnershipFromJira}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-semibold transition flex items-center space-x-1.5"
              >
                <span>🔄</span>
                <span>{isSyncingFromJira ? 'Syncing...' : 'Sync from Jira'}</span>
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {defectOwnership?.assignedEngineer && (
              <button
                type="button"
                data-testid="btn-unassign-engineer"
                disabled={isAssigningEngineer}
                onClick={() => setShowUnassignConfirmModal(true)}
                className="px-3 py-1.5 bg-rose-900/40 hover:bg-rose-900/60 border border-rose-700/50 text-rose-300 rounded text-xs font-semibold transition"
              >
                Unassign
              </button>
            )}
            <button
              type="button"
              data-testid="btn-assign-engineer"
              disabled={isAssigningEngineer || eligibleEngineers.length === 0}
              onClick={() => setShowAssignModal(true)}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded text-xs font-semibold shadow transition flex items-center space-x-1.5"
            >
              <span>👤</span>
              <span>
                {defectOwnership?.assignedEngineer ? 'Reassign Engineer' : 'Assign Engineer'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Expected vs Actual Behavior */}
      <div className="p-5 bg-slate-900/50 border border-slate-800 rounded-lg space-y-4">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-2">
          <span>⚖️</span>
          <span>Expected vs. Actual Behavior</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 bg-emerald-950/20 border border-emerald-500/30 rounded space-y-2">
            <span className="font-bold text-emerald-400 flex items-center space-x-1.5">
              <span>✅</span>
              <span>Expected Behavior</span>
            </span>
            <p
              data-testid="expected-behavior"
              className="text-emerald-200/90 leading-relaxed whitespace-pre-wrap"
            >
              {report.expectedBehavior}
            </p>
          </div>

          <div className="p-4 bg-rose-950/20 border border-rose-500/30 rounded space-y-2">
            <span className="font-bold text-rose-400 flex items-center space-x-1.5">
              <span>❌</span>
              <span>Actual Behavior</span>
            </span>
            <p
              data-testid="actual-behavior"
              className="text-rose-200/90 leading-relaxed whitespace-pre-wrap"
            >
              {report.actualBehavior}
            </p>
            {report.failedStepIndex !== null && report.failedStepIndex !== undefined && (
              <div
                data-testid="failed-step-indicator"
                className="pt-2 border-t border-rose-500/20 text-xs font-semibold text-rose-300"
              >
                ⚠️ Execution failed at Step #{report.failedStepIndex}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Derived Step-by-Step Reproduction Procedure */}
      <div className="p-5 bg-slate-900/50 border border-slate-800 rounded-lg space-y-4">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-2">
          <span>👣</span>
          <span>Derived Reproduction Steps ({report.reproductionSteps.length})</span>
        </h3>

        {report.reproductionSteps.length > 0 ? (
          <div className="overflow-x-auto border border-slate-800 rounded">
            <table data-testid="reproduction-steps-table" className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="p-2.5 text-center w-12">#</th>
                  <th className="p-2.5 w-28">Action</th>
                  <th className="p-2.5">Description & Target</th>
                  <th className="p-2.5 w-24 text-center">Status</th>
                  <th className="p-2.5 w-28 text-center">Failure Point</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-900/20">
                {report.reproductionSteps.map(step => (
                  <tr
                    key={step.stepIndex}
                    data-testid={`step-row-${step.stepIndex}`}
                    className={step.isFailureStep ? 'bg-rose-500/10' : undefined}
                  >
                    <td className="p-2.5 text-center font-mono text-slate-400">{step.stepIndex}</td>
                    <td className="p-2.5 font-mono text-slate-300">{step.actionType}</td>
                    <td className="p-2.5 text-slate-200">
                      <div>{step.description}</div>
                      {step.errorMessage && (
                        <div className="text-rose-400 text-xs font-mono mt-1">
                          {step.errorMessage}
                        </div>
                      )}
                    </td>
                    <td className="p-2.5 text-center">
                      <span
                        className={`px-2 py-0.5 rounded font-mono text-xs ${
                          step.status === 'PASSED'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : step.status === 'FAILED'
                              ? 'bg-rose-500/20 text-rose-300'
                              : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {step.status}
                      </span>
                    </td>
                    <td className="p-2.5 text-center">
                      {step.isFailureStep ? (
                        <span className="px-2 py-0.5 bg-rose-600/30 text-rose-300 border border-rose-500/40 rounded font-semibold text-xs">
                          FAILED
                        </span>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-slate-500 italic">No step execution records available.</p>
        )}
      </div>

      {/* Root-Cause Hypothesis & Epistemic Framing */}
      <div className="p-5 bg-slate-900/50 border border-slate-800 rounded-lg space-y-3">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-2">
          <span>🧠</span>
          <span>Root-Cause Hypothesis & Diagnostic Framing</span>
        </h3>

        <div className="p-3 bg-sky-950/20 border border-sky-500/30 rounded text-xs text-sky-200/90 flex items-start space-x-2">
          <span className="text-base">ℹ️</span>
          <span>
            <strong>Epistemic Humility Invariant:</strong> Root-cause analysis represents a
            probabilistic hypothesis derived from execution telemetry, DOM diffs, and error
            signatures. It is explicitly labeled as a hypothesis and does NOT constitute verified
            source code fact.
          </span>
        </div>

        <div className="p-4 bg-slate-950/60 rounded border border-slate-800 space-y-2">
          <span className="text-slate-500 text-xs font-semibold block">Formulated Hypothesis:</span>
          <p
            data-testid="root-cause-hypothesis"
            className="text-xs text-slate-200 leading-relaxed font-mono whitespace-pre-wrap"
          >
            {report.rootCauseHypothesis ||
              'No root-cause hypothesis formulated for this failure case.'}
          </p>
        </div>
      </div>

      {/* Evidence References & Integrity Verification */}
      <div className="p-5 bg-slate-900/50 border border-slate-800 rounded-lg space-y-4">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-2">
          <span>📁</span>
          <span>Linked Evidence Artifacts ({report.evidenceReferences.length})</span>
        </h3>

        {report.evidenceReferences.length > 0 ? (
          <div className="overflow-x-auto border border-slate-800 rounded">
            <table data-testid="evidence-references-table" className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="p-2.5">Artifact Type</th>
                  <th className="p-2.5">File Path / Storage ID</th>
                  <th className="p-2.5 w-24">MIME Type</th>
                  <th className="p-2.5 w-20 text-right">Size</th>
                  <th className="p-2.5 w-28 text-center">Integrity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-900/20 font-mono">
                {report.evidenceReferences.map(ref => (
                  <tr key={ref.id}>
                    <td className="p-2.5 text-slate-300 font-semibold">{ref.evidenceType}</td>
                    <td className="p-2.5 text-slate-400 truncate max-w-xs">{ref.filePath}</td>
                    <td className="p-2.5 text-slate-500 text-xs">{ref.mimeType}</td>
                    <td className="p-2.5 text-slate-400 text-right">
                      {(ref.byteSize / 1024).toFixed(1)} KB
                    </td>
                    <td className="p-2.5 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          ref.integrityStatus === 'VERIFIED'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : ref.integrityStatus === 'CORRUPT'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        }`}
                      >
                        {ref.integrityStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-slate-500 italic">No evidence artifacts attached.</p>
        )}
      </div>

      {/* Known Limitations & Unknowns */}
      <div className="p-5 bg-slate-900/50 border border-slate-800 rounded-lg space-y-3">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-2">
          <span>⚠️</span>
          <span>Known Limitations & Epistemic Boundaries</span>
        </h3>

        <ul data-testid="limitations-list" className="space-y-1.5 text-xs text-slate-300">
          {report.limitationsAndUnknowns.map((lim, idx) => (
            <li key={idx} className="flex items-start space-x-2">
              <span className="text-amber-400 font-bold">•</span>
              <span>{lim}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Regeneration Modal */}
      {showRegenerateModal && (
        <div
          data-testid="regenerate-modal"
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-lg w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-slate-100">Regenerate Bug Report</h3>
            <p className="text-xs text-slate-400">
              Re-evaluates latest multi-phase facts and creates Revision {report.revision + 1}. The
              prior revision will be preserved and marked as SUPERSEDED.
            </p>

            <form onSubmit={handleRegenerate} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Regeneration Reason (Required)
                </label>
                <textarea
                  data-testid="input-regenerate-reason"
                  rows={3}
                  value={regenerationReason}
                  onChange={e => setRegenerationReason(e.target.value)}
                  placeholder="e.g. Attached new network trace evidence and re-evaluated root cause..."
                  required
                  className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded text-xs text-slate-200 focus:border-rose-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Title Override (Optional)
                </label>
                <input
                  type="text"
                  value={titleOverride}
                  onChange={e => setTitleOverride(e.target.value)}
                  placeholder={report.title}
                  className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded text-xs text-slate-200 focus:border-rose-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRegenerateModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRegenerating || !regenerationReason.trim()}
                  data-testid="btn-submit-regenerate"
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded text-xs font-semibold shadow"
                >
                  {isRegenerating ? 'Regenerating...' : 'Confirm Regeneration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Revision History Modal */}
      {showHistoryModal && (
        <div
          data-testid="history-modal"
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-2xl w-full p-6 space-y-4 shadow-xl max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <h3 className="text-base font-bold text-slate-100">
                Audit Revision History ({history.length})
              </h3>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="text-slate-400 hover:text-slate-200 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto space-y-3 flex-1 pr-1">
              {history.map(rev => (
                <div
                  key={rev.id}
                  data-testid={`history-item-rev-${rev.revision}`}
                  className={`p-3.5 rounded border text-xs space-y-2 ${
                    rev.id === report.id
                      ? 'bg-rose-500/10 border-rose-500/30'
                      : 'bg-slate-950/60 border-slate-800'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold text-rose-400">
                        Revision {rev.revision}
                      </span>
                      <span
                        className={`px-2 py-0.2 rounded text-[10px] font-semibold ${
                          rev.status === 'READY'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {rev.status}
                      </span>
                      {rev.id === report.id && (
                        <span className="px-2 py-0.2 bg-rose-500/20 text-rose-300 rounded text-[10px] font-bold">
                          CURRENT VIEW
                        </span>
                      )}
                    </div>
                    <span className="text-slate-500 font-mono">
                      {new Date(rev.createdAt).toLocaleString()}
                    </span>
                  </div>

                  <p className="font-semibold text-slate-200">{rev.title}</p>
                  {rev.regenerationReason && (
                    <p className="text-slate-400 italic">
                      Reason: &quot;{rev.regenerationReason}&quot;
                    </p>
                  )}
                  {rev.id !== report.id && (
                    <button
                      onClick={() => {
                        setReport(rev);
                        setShowHistoryModal(false);
                      }}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-semibold"
                    >
                      View Revision {rev.revision}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Jira Issue Creation Confirmation Modal (V7 Phase 91) */}
      {showJiraConfirmModal && jiraConfig && (
        <div
          data-testid="jira-confirm-modal"
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
                <span>🎫</span>
                <span>Confirm Jira Issue Creation</span>
              </h3>
              <button
                disabled={isCreatingJira}
                onClick={() => setShowJiraConfirmModal(false)}
                className="text-slate-400 hover:text-slate-200 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300">
              You are about to export this verified defect to your configured Jira workspace. Please
              review the destination parameters below:
            </p>

            <div className="p-3 bg-slate-950/70 rounded border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Destination Project:</span>
                <span className="font-semibold text-slate-200">
                  {jiraConfig.jiraProjectKey} ({jiraConfig.jiraProjectName})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Issue Type:</span>
                <span className="font-semibold text-slate-200">
                  {jiraConfig.selectedIssueTypeName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Default Priority:</span>
                <span className="text-slate-300">
                  {jiraConfig.defaultPriorityName || 'Project Default'}
                </span>
              </div>
              <div className="border-t border-slate-800/80 pt-2 space-y-1">
                <span className="text-slate-500 block">Summary Preview:</span>
                <p className="text-slate-200 font-mono text-[11px] bg-slate-900 p-2 rounded truncate">
                  {report.title}
                </p>
              </div>
            </div>

            <div className="p-3 bg-blue-950/20 border border-blue-500/30 rounded text-xs space-y-1 text-blue-300">
              <div className="font-semibold flex items-center space-x-1.5 text-blue-200">
                <span>ℹ️</span>
                <span>Epistemic Integrity & Attachments Notice</span>
              </div>
              <p className="text-[11px] leading-relaxed text-blue-200/80">
                The created Jira issue clearly distinguishes between observed factual execution
                events, deterministic classification, and AI-inferred hypotheses. Binary artifacts
                (screenshots/traces) are strictly scoped for Phase 92 and will not be attached.
              </p>
            </div>

            <div className="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                data-testid="btn-cancel-jira-create"
                disabled={isCreatingJira}
                onClick={() => setShowJiraConfirmModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="btn-confirm-jira-create"
                disabled={isCreatingJira}
                onClick={handleCreateJiraIssue}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded text-xs font-semibold shadow transition flex items-center space-x-1.5"
              >
                <span>{isCreatingJira ? 'Creating in Jira...' : 'Confirm & Create Issue'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase 92: Evidence Attachment Confirmation Modal */}
      {showAttachConfirmModal && jiraIssue && (
        <div
          data-testid="jira-attach-confirm-modal"
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-lg shadow-2xl max-w-lg w-full p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
                <span>📎</span>
                <span>Attach Evidence to Jira Issue</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAttachConfirmModal(false)}
                className="text-slate-400 hover:text-slate-200 text-xs"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-950/60 rounded border border-slate-800 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Target Jira Issue:</span>
                  <span className="font-mono font-bold text-emerald-400">
                    {jiraIssue.jiraIssueKey}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Artifacts to Attach:</span>
                  <span className="font-semibold text-slate-300">
                    {selectedEvidenceIds.size} artifact(s)
                  </span>
                </div>
              </div>

              <div className="p-3 bg-blue-950/20 border border-blue-500/30 rounded text-xs space-y-1 text-blue-300">
                <div className="font-semibold flex items-center space-x-1.5 text-blue-200">
                  <span>🔒</span>
                  <span>Safety, Redaction & Immutability Notice</span>
                </div>
                <p className="text-[11px] leading-relaxed text-blue-200/80">
                  Text/log artifacts (console logs, network requests, DOM snapshots) will be
                  automatically sanitized via the failure evidence redactor prior to upload.
                  Historical original evidence files in managed storage remain strictly immutable.
                  Playwright traces are excluded in accordance with platform safety policies.
                </p>
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-2 border-t border-slate-800/80">
              <button
                type="button"
                data-testid="btn-cancel-attach-confirm"
                disabled={isAttachingEvidence}
                onClick={() => setShowAttachConfirmModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="btn-confirm-attach-submit"
                disabled={isAttachingEvidence || selectedEvidenceIds.size === 0}
                onClick={handleAttachEvidence}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded text-xs font-semibold shadow transition flex items-center space-x-1.5"
              >
                <span>{isAttachingEvidence ? 'Uploading...' : 'Confirm & Upload'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase 93: Jira Link Confirmation Modal */}
      {showLinkConfirmModal && duplicateEvaluation && (
        <div
          data-testid="jira-link-confirm-modal"
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
                <span>🔗</span>
                <span>Link Existing Jira Issue</span>
              </h3>
              <button
                type="button"
                disabled={isLinkingJira}
                onClick={() => setShowLinkConfirmModal(false)}
                className="text-slate-400 hover:text-slate-200 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300">
              An existing Jira issue was detected. Linking will associate this failure case with the
              existing issue and avoid creating duplicate tickets:
            </p>

            <div className="p-3.5 bg-slate-950/70 rounded border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Matching Jira Issue:</span>
                <span className="font-mono font-bold text-emerald-400">
                  {duplicateEvaluation.jiraIssueKey}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Deduplication Rule:</span>
                <span className="font-mono text-amber-400">{duplicateEvaluation.ruleId}</span>
              </div>
              {duplicateEvaluation.defectClusterKey && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Defect Cluster:</span>
                  <span className="font-medium text-blue-400">
                    {duplicateEvaluation.defectClusterKey}
                  </span>
                </div>
              )}
              <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
                <span className="font-semibold text-slate-300 block mb-0.5">Rationale:</span>
                <span>{duplicateEvaluation.reason}</span>
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                data-testid="btn-cancel-jira-link"
                disabled={isLinkingJira}
                onClick={() => setShowLinkConfirmModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="btn-confirm-jira-link"
                disabled={isLinkingJira}
                onClick={handleLinkExistingIssue}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded text-xs font-semibold shadow transition flex items-center space-x-1.5"
              >
                <span>{isLinkingJira ? 'Linking Issue...' : 'Confirm & Link Issue'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase 96: Bug Status & External Workflow Synchronization Card */}
      <WorkflowSyncCard
        projectId={projectId}
        failureCaseId={failureCaseId}
        bugReportId={report.id}
        jiraIssueKey={jiraIssue?.jiraIssueKey ?? jiraLink?.jiraIssueKey}
      />

      {/* Phase 97: Defect Reverification Foundation Card */}
      <DefectReverificationCard
        projectId={projectId}
        failureCaseId={failureCaseId}
        bugReportId={report.id}
        jiraIssueKey={jiraIssue?.jiraIssueKey ?? jiraLink?.jiraIssueKey}
      />

      {/* Phase 94: Assign / Reassign Engineer Modal */}
      {showAssignModal && (
        <div
          data-testid="assign-engineer-modal"
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
                <span>👤</span>
                <span>
                  {defectOwnership?.assignedEngineer
                    ? 'Reassign Defect Ownership'
                    : 'Assign Defect Ownership'}
                </span>
              </h3>
              <button
                type="button"
                disabled={isAssigningEngineer}
                onClick={() => setShowAssignModal(false)}
                className="text-slate-400 hover:text-slate-200 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Select Engineer:</label>
                <select
                  data-testid="select-engineer"
                  value={selectedEngineerId}
                  onChange={e => setSelectedEngineerId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  {eligibleEngineers.map(eng => (
                    <option key={eng.id} value={eng.id}>
                      {eng.displayName} ({eng.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-semibold">
                  Assignment Reason (Optional):
                </label>
                <textarea
                  data-testid="input-assignment-reason"
                  rows={3}
                  value={assignmentReason}
                  onChange={e => setAssignmentReason(e.target.value)}
                  placeholder="e.g. Component domain lead, triage investigation, etc."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-blue-500 resize-none text-xs"
                />
              </div>

              {(jiraIssue || jiraLink) && (
                <div className="p-2.5 bg-blue-950/20 border border-blue-500/30 rounded text-[11px] text-blue-300">
                  ℹ️ This defect is linked to Jira issue{' '}
                  <span className="font-mono font-bold text-blue-200">
                    {jiraIssue?.jiraIssueKey ?? jiraLink?.jiraIssueKey}
                  </span>
                  . The assignee will be automatically synchronized in Jira.
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-3 pt-2 border-t border-slate-800">
              <button
                type="button"
                data-testid="btn-cancel-assign"
                disabled={isAssigningEngineer}
                onClick={() => setShowAssignModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="btn-confirm-assign"
                disabled={isAssigningEngineer || !selectedEngineerId}
                onClick={handleAssignEngineer}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded text-xs font-semibold shadow transition"
              >
                {isAssigningEngineer ? 'Saving...' : 'Confirm Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase 94: Unassign Engineer Confirmation Modal */}
      {showUnassignConfirmModal && (
        <div
          data-testid="unassign-confirm-modal"
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
                <span>⚠️</span>
                <span>Unassign Defect Ownership</span>
              </h3>
              <button
                type="button"
                disabled={isAssigningEngineer}
                onClick={() => setShowUnassignConfirmModal(false)}
                className="text-slate-400 hover:text-slate-200 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Are you sure you want to unassign this defect? If a Jira issue is linked, it will also
              be unassigned in Jira.
            </p>

            <div className="space-y-2 text-xs">
              <label className="text-slate-400 block font-semibold">
                Unassignment Reason (Optional):
              </label>
              <textarea
                data-testid="input-unassign-reason"
                rows={2}
                value={unassignReason}
                onChange={e => setUnassignReason(e.target.value)}
                placeholder="e.g. Returned to backlog, awaiting team assignment"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-blue-500 resize-none text-xs"
              />
            </div>

            <div className="flex justify-end space-x-3 pt-2 border-t border-slate-800">
              <button
                type="button"
                data-testid="btn-cancel-unassign"
                disabled={isAssigningEngineer}
                onClick={() => setShowUnassignConfirmModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="btn-confirm-unassign"
                disabled={isAssigningEngineer}
                onClick={handleUnassignEngineer}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded text-xs font-semibold shadow transition"
              >
                {isAssigningEngineer ? 'Unassigning...' : 'Confirm Unassign'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase 94: Ownership History Drawer / Modal */}
      {showOwnershipHistoryDrawer && (
        <div
          data-testid="ownership-history-modal"
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-2xl w-full p-6 space-y-4 shadow-xl max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <h3 className="text-base font-bold text-slate-100 flex items-center space-x-2">
                <span>📜</span>
                <span>Defect Ownership History & Audit Trail</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowOwnershipHistoryDrawer(false)}
                className="text-slate-400 hover:text-slate-200 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto flex-1 space-y-2 pr-1">
              {defectOwnership?.history && defectOwnership.history.length > 0 ? (
                <table
                  data-testid="ownership-history-table"
                  className="w-full text-left text-xs border-collapse"
                >
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                      <th className="py-2 px-2">Version</th>
                      <th className="py-2 px-2">Action</th>
                      <th className="py-2 px-2">Actor</th>
                      <th className="py-2 px-2">Jira Sync</th>
                      <th className="py-2 px-2">Reason</th>
                      <th className="py-2 px-2">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {defectOwnership.history.map(entry => (
                      <tr key={entry.id} className="hover:bg-slate-800/30">
                        <td className="py-2 px-2 font-mono text-slate-400">
                          v{entry.ownershipVersion}
                        </td>
                        <td className="py-2 px-2 font-semibold">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] ${
                              entry.action === 'ASSIGNED'
                                ? 'bg-blue-500/10 text-blue-400'
                                : entry.action === 'REASSIGNED'
                                  ? 'bg-purple-500/10 text-purple-400'
                                  : entry.action === 'UNASSIGNED'
                                    ? 'bg-rose-500/10 text-rose-400'
                                    : 'bg-slate-700 text-slate-300'
                            }`}
                          >
                            {entry.action}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-slate-300 font-mono text-[11px]">
                          {entry.actorUserId ?? 'SYSTEM'}
                        </td>
                        <td className="py-2 px-2 text-[11px]">
                          <span
                            className={`${
                              entry.jiraAssigneeSyncStatus === 'SYNCHRONIZED'
                                ? 'text-emerald-400'
                                : entry.jiraAssigneeSyncStatus === 'JIRA_SYNC_FAILED'
                                  ? 'text-rose-400'
                                  : 'text-slate-500'
                            }`}
                          >
                            {entry.jiraAssigneeSyncStatus}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-slate-400 text-[11px] max-w-xs truncate">
                          {entry.assignmentReason ?? '—'}
                        </td>
                        <td className="py-2 px-2 font-mono text-slate-400 text-[11px]">
                          {new Date(entry.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-slate-500 text-xs text-center py-6">
                  No ownership transitions recorded yet.
                </p>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowOwnershipHistoryDrawer(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-semibold transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
