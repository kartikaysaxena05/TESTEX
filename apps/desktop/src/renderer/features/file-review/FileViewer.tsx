/**
 * @file apps/desktop/src/renderer/features/file-review/FileViewer.tsx
 * Safe, read-only file inspection panel for V10 Phase 156.
 *
 * CRITICAL INVARIANT:
 * Code displayed here is strictly inert text for visual inspection.
 * It is never evaluated, executed, or mounted as active runtime components.
 */

import React from 'react';
import type { FileReviewContentDto } from '@ai-quality/contracts';
import { Badge } from '../../ui/index.js';
import { formatFileSize } from './diff-utils.js';

export interface FileViewerProps {
  readonly fileContent?: FileReviewContentDto | null;
  readonly isLoading?: boolean;
  readonly error?: string | null;
  readonly className?: string;
}

export function FileViewer({
  fileContent,
  isLoading = false,
  error = null,
  className = '',
}: FileViewerProps): React.JSX.Element {
  if (isLoading) {
    return (
      <div
        className={`flex items-center justify-center p-12 text-xs text-neutral-400 bg-neutral-950 border border-neutral-800 rounded-lg ${className}`}
        data-testid="file-viewer-loading"
      >
        <span className="animate-pulse">Loading file content securely...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`p-6 bg-red-950/20 border border-red-500/40 rounded-lg text-xs text-red-300 ${className}`}
        data-testid="file-viewer-error"
      >
        <div className="font-semibold mb-1">Failed to read project file:</div>
        <p className="font-mono">{error}</p>
      </div>
    );
  }

  if (!fileContent) {
    return (
      <div
        className={`flex items-center justify-center p-12 text-xs text-neutral-400 bg-neutral-950 border border-neutral-800 rounded-lg ${className}`}
        data-testid="file-viewer-empty"
      >
        Select a file from the changed files list to safely view its contents.
      </div>
    );
  }

  const lines = fileContent.content.split(/\r?\n/);

  return (
    <div
      className={`flex flex-col h-full bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden text-neutral-200 font-mono text-xs ${className}`}
      data-testid="file-viewer"
    >
      {/* File Metadata Header */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2.5 bg-neutral-900 border-b border-neutral-800 gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="font-semibold text-neutral-100 truncate"
            title={fileContent.filePath}
            data-testid="file-viewer-path"
          >
            {fileContent.filePath}
          </span>
          <Badge
            variant="neutral"
            className="uppercase text-[10px] tracking-wider font-semibold"
            data-testid="file-viewer-language"
          >
            {fileContent.language}
          </Badge>
          <span className="text-neutral-400 text-[11px]" data-testid="file-viewer-size">
            {formatFileSize(fileContent.sizeBytes)}
          </span>
        </div>

        <div className="flex items-center gap-2 text-[11px]">
          <Badge variant="info" className="text-[10px]">
            Read-Only
          </Badge>
          <span
            className="text-neutral-500 font-sans"
            title={fileContent.modifiedAt}
            data-testid="file-viewer-modified"
          >
            Modified: {new Date(fileContent.modifiedAt).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Code Text Content (Strictly Non-Executable) */}
      <div className="flex-1 overflow-auto bg-neutral-950 p-0 select-text">
        {fileContent.isBinary ? (
          <div
            className="p-8 text-center text-neutral-400 text-xs italic"
            data-testid="file-viewer-binary-notice"
          >
            [Binary file: visual text preview not available]
          </div>
        ) : (
          <div className="divide-y divide-neutral-900/40" data-testid="file-viewer-lines">
            {lines.map((line, idx) => (
              <div
                key={`line-${idx + 1}`}
                className="flex items-start hover:bg-neutral-900/30 transition-colors"
              >
                {/* Line Number */}
                <span className="w-12 py-0.5 pr-3 text-right select-none text-neutral-600 bg-neutral-950/80 border-r border-neutral-900 shrink-0 text-[11px]">
                  {idx + 1}
                </span>
                {/* Code Text */}
                <span className="flex-1 py-0.5 px-3 whitespace-pre-wrap break-all leading-relaxed font-mono text-neutral-300">
                  {line}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
