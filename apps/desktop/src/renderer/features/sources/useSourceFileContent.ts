/**
 * @file apps/desktop/src/renderer/features/sources/useSourceFileContent.ts
 * React hook managing secure source file content fetching with dual-race stale-response protection.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { SourceFileContentDto } from '@ai-quality/contracts';

export interface UseSourceFileContentResult {
  readonly fileContent: SourceFileContentDto | null;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly refresh: () => Promise<void>;
}

export function useSourceFileContent(
  projectId: string | null,
  relativePath: string | null,
): UseSourceFileContentResult {
  const [fileContent, setFileContent] = useState<SourceFileContentDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const requestKeyRef = useRef<string | null>(null);

  const loadContent = useCallback(async () => {
    if (!projectId || !relativePath) {
      setFileContent(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    const currentKey = `${projectId}::${relativePath}`;
    requestKeyRef.current = currentKey;
    setIsLoading(true);
    setError(null);

    try {
      if (!window.desktop?.sources?.content?.get) {
        if (requestKeyRef.current === currentKey) {
          setIsLoading(false);
        }
        return;
      }

      const result = await window.desktop.sources.content.get({
        projectId,
        relativePath,
      });

      if (requestKeyRef.current !== currentKey) {
        return;
      }

      if (result.ok) {
        setFileContent(result.data);
        setError(null);
      } else {
        setError(result.error.message);
      }
    } catch {
      if (requestKeyRef.current === currentKey) {
        setError('Failed to read source file content.');
      }
    } finally {
      if (requestKeyRef.current === currentKey) {
        setIsLoading(false);
      }
    }
  }, [projectId, relativePath]);

  useEffect(() => {
    loadContent();
  }, [loadContent]);

  return {
    fileContent,
    isLoading,
    error,
    refresh: loadContent,
  };
}
