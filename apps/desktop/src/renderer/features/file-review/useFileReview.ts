/**
 * @file apps/desktop/src/renderer/features/file-review/useFileReview.ts
 * React hook for managing File & Diff Review Workspace state, IPC queries, and actions.
 */

import { useState, useEffect, useCallback } from 'react';
import type {
  FileDiffReviewDto,
  FileReviewContentDto,
  ApplyFileReviewResultDto,
} from '@ai-quality/contracts';

export interface UseFileReviewOptions {
  readonly projectId: string;
  readonly threadId?: string;
  readonly taskId?: string;
  readonly initialReviewId?: string;
}

export interface UseFileReviewResult {
  readonly reviews: readonly FileDiffReviewDto[];
  readonly activeReview: FileDiffReviewDto | null;
  readonly selectedFile: string | null;
  readonly viewMode: 'diff' | 'file';
  readonly fileContent: FileReviewContentDto | null;
  readonly isLoading: boolean;
  readonly isSubmitting: boolean;
  readonly isFileLoading: boolean;
  readonly error: string | null;
  readonly fileError: string | null;
  readonly setActiveReviewId: (id: string) => void;
  readonly setSelectedFile: (filePath: string) => void;
  readonly setViewMode: (mode: 'diff' | 'file') => void;
  readonly refreshReviews: () => Promise<void>;
  readonly approveReview: (reason?: string) => Promise<boolean>;
  readonly rejectReview: (reason?: string) => Promise<boolean>;
  readonly cancelReview: (reason?: string) => Promise<boolean>;
  readonly applyReview: () => Promise<ApplyFileReviewResultDto | null>;
}

export function useFileReview({
  projectId,
  threadId,
  taskId,
  initialReviewId,
}: UseFileReviewOptions): UseFileReviewResult {
  const [reviews, setReviews] = useState<readonly FileDiffReviewDto[]>([]);
  const [activeReviewId, setActiveReviewId] = useState<string | null>(initialReviewId ?? null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'diff' | 'file'>('diff');
  const [fileContent, setFileContent] = useState<FileReviewContentDto | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isFileLoading, setIsFileLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  // 1. Fetch reviews list
  const refreshReviews = useCallback(async () => {
    if (!projectId || !window.desktop?.fileReview) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await window.desktop.fileReview.list({
        projectId,
        threadId,
        taskId,
      });
      if (res.ok) {
        setReviews(res.data);
        if (res.data.length > 0) {
          if (!activeReviewId || !res.data.some(r => r.id === activeReviewId)) {
            setActiveReviewId(res.data[0]?.id ?? null);
          }
        } else {
          setActiveReviewId(null);
        }
      } else {
        setError(res.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [projectId, threadId, taskId, activeReviewId]);

  useEffect(() => {
    void refreshReviews();
  }, [projectId, threadId, taskId]);

  const activeReview = reviews.find(r => r.id === activeReviewId) ?? null;

  // 2. Automatically select first file when activeReview changes
  useEffect(() => {
    if (activeReview && activeReview.affectedFiles.length > 0) {
      if (!selectedFile || !activeReview.affectedFiles.includes(selectedFile)) {
        setSelectedFile(activeReview.affectedFiles[0] ?? null);
      }
    } else {
      setSelectedFile(null);
    }
  }, [activeReview]);

  // 3. Fetch file content when in 'file' mode and file is selected
  useEffect(() => {
    if (viewMode !== 'file' || !selectedFile || !projectId || !window.desktop?.fileReview) {
      setFileContent(null);
      setFileError(null);
      return;
    }

    let isMounted = true;
    const fetchContent = async () => {
      if (!window.desktop?.fileReview) return;
      setIsFileLoading(true);
      setFileError(null);
      try {
        const res = await window.desktop.fileReview.getFileContent({
          projectId,
          filePath: selectedFile,
        });
        if (isMounted) {
          if (res.ok) {
            setFileContent(res.data);
          } else {
            setFileError(res.error.message);
          }
        }
      } catch (err) {
        if (isMounted) {
          setFileError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (isMounted) {
          setIsFileLoading(false);
        }
      }
    };

    void fetchContent();

    return () => {
      isMounted = false;
    };
  }, [viewMode, selectedFile, projectId]);

  // 4. Decision Actions
  const approveReview = useCallback(
    async (reason?: string): Promise<boolean> => {
      if (!activeReview || !window.desktop?.fileReview) return false;
      setIsSubmitting(true);
      setError(null);
      try {
        const res = await window.desktop.fileReview.approve({
          projectId,
          reviewId: activeReview.id,
          reason,
        });
        if (res.ok) {
          await refreshReviews();
          return true;
        } else {
          setError(res.error.message);
          return false;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [activeReview, projectId, refreshReviews],
  );

  const rejectReview = useCallback(
    async (reason?: string): Promise<boolean> => {
      if (!activeReview || !window.desktop?.fileReview) return false;
      setIsSubmitting(true);
      setError(null);
      try {
        const res = await window.desktop.fileReview.reject({
          projectId,
          reviewId: activeReview.id,
          reason,
        });
        if (res.ok) {
          await refreshReviews();
          return true;
        } else {
          setError(res.error.message);
          return false;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [activeReview, projectId, refreshReviews],
  );

  const cancelReview = useCallback(
    async (reason?: string): Promise<boolean> => {
      if (!activeReview || !window.desktop?.fileReview) return false;
      setIsSubmitting(true);
      setError(null);
      try {
        const res = await window.desktop.fileReview.cancel({
          projectId,
          reviewId: activeReview.id,
          reason,
        });
        if (res.ok) {
          await refreshReviews();
          return true;
        } else {
          setError(res.error.message);
          return false;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [activeReview, projectId, refreshReviews],
  );

  const applyReview = useCallback(async (): Promise<ApplyFileReviewResultDto | null> => {
    if (!activeReview || !window.desktop?.fileReview) return null;
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await window.desktop.fileReview.apply({
        projectId,
        reviewId: activeReview.id,
      });
      if (res.ok) {
        await refreshReviews();
        return res.data;
      } else {
        setError(res.error.message);
        return null;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }, [activeReview, projectId, refreshReviews]);

  return {
    reviews,
    activeReview,
    selectedFile,
    viewMode,
    fileContent,
    isLoading,
    isSubmitting,
    isFileLoading,
    error,
    fileError,
    setActiveReviewId,
    setSelectedFile,
    setViewMode,
    refreshReviews,
    approveReview,
    rejectReview,
    cancelReview,
    applyReview,
  };
}
