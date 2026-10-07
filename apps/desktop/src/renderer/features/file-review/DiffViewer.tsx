/**
 * @file apps/desktop/src/renderer/features/file-review/DiffViewer.tsx
 * Codex-style Unified and Split Diff Viewer for V10 Phase 156.
 */

import React, { useState } from 'react';
import { parseUnifiedDiffForUi, type ParsedUiFileDiff } from './diff-utils.js';

export interface DiffViewerProps {
  readonly diffText: string;
  readonly selectedFilePath?: string;
  readonly onSelectFile?: (filePath: string) => void;
  readonly className?: string;
}

export function DiffViewer({
  diffText,
  selectedFilePath,
  onSelectFile,
  className = '',
}: DiffViewerProps): React.JSX.Element {
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');

  const files = parseUnifiedDiffForUi(diffText);

  // If a file path is specified, find it; otherwise default to first file
  const activeFile: ParsedUiFileDiff | undefined = selectedFilePath
    ? (files.find(f => f.filePath === selectedFilePath) ?? files[0])
    : files[0];

  if (files.length === 0 || !activeFile) {
    return (
      <div
        className={`p-8 text-center text-xs text-neutral-400 bg-neutral-900 border border-neutral-800 rounded-lg ${className}`}
        data-testid="diff-viewer-empty"
      >
        No differences or valid patch hunks found in proposed change.
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col h-full bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden text-neutral-200 font-mono text-xs ${className}`}
      data-testid="diff-viewer"
    >
      {/* Top Diff Header Bar */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2.5 bg-neutral-900/90 border-b border-neutral-800 gap-3">
        {/* File Path & Status */}
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-semibold text-neutral-100 truncate" title={activeFile.filePath}>
            {activeFile.filePath}
          </span>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-emerald-400 font-medium" data-testid="diff-added-count">
              +{activeFile.linesAdded}
            </span>
            <span className="text-rose-400 font-medium" data-testid="diff-removed-count">
              -{activeFile.linesRemoved}
            </span>
          </div>
        </div>

        {/* View Mode Toggle & File Navigation if multi-file */}
        <div className="flex items-center gap-2">
          {files.length > 1 && (
            <select
              value={activeFile.filePath}
              onChange={e => onSelectFile?.(e.target.value)}
              className="bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs rounded px-2 py-1 outline-none"
              data-testid="diff-file-selector"
            >
              {files.map(f => (
                <option key={f.filePath} value={f.filePath}>
                  {f.filePath} (+{f.linesAdded} -{f.linesRemoved})
                </option>
              ))}
            </select>
          )}

          <div className="flex items-center rounded border border-neutral-800 bg-neutral-950 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('unified')}
              className={`px-2.5 py-0.5 text-xs rounded transition-colors font-sans ${
                viewMode === 'unified'
                  ? 'bg-neutral-800 text-neutral-100 font-medium'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
              data-testid="btn-view-unified"
            >
              Unified
            </button>
            <button
              type="button"
              onClick={() => setViewMode('split')}
              className={`px-2.5 py-0.5 text-xs rounded transition-colors font-sans ${
                viewMode === 'split'
                  ? 'bg-neutral-800 text-neutral-100 font-medium'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
              data-testid="btn-view-split"
            >
              Split
            </button>
          </div>
        </div>
      </div>

      {/* Main Diff Content */}
      <div className="flex-1 overflow-auto bg-neutral-950 p-0 select-text">
        {viewMode === 'unified' ? (
          /* UNIFIED DIFF VIEW */
          <div className="divide-y divide-neutral-900/60" data-testid="unified-diff-container">
            {activeFile.lines.map((line, idx) => {
              if (line.type === 'header') {
                return (
                  <div
                    key={`line-${idx}`}
                    className="flex items-center bg-cyan-950/20 text-cyan-400 px-4 py-1 border-y border-cyan-900/30 font-semibold text-[11px]"
                    data-testid="diff-hunk-header"
                  >
                    {line.content}
                  </div>
                );
              }

              const isAdded = line.type === 'added';
              const isRemoved = line.type === 'removed';

              return (
                <div
                  key={`line-${idx}`}
                  className={`flex items-start hover:bg-neutral-900/40 transition-colors ${
                    isAdded
                      ? 'bg-emerald-950/25 text-emerald-300'
                      : isRemoved
                        ? 'bg-rose-950/25 text-rose-300'
                        : 'text-neutral-300'
                  }`}
                  data-testid={`diff-line-${line.type}`}
                >
                  {/* Old Line Number */}
                  <span className="w-12 py-0.5 pr-2 text-right select-none text-neutral-500 bg-neutral-950/60 border-r border-neutral-900 shrink-0 text-[11px]">
                    {line.oldLineNumber ?? ''}
                  </span>
                  {/* New Line Number */}
                  <span className="w-12 py-0.5 pr-2 text-right select-none text-neutral-500 bg-neutral-950/60 border-r border-neutral-900 shrink-0 text-[11px]">
                    {line.newLineNumber ?? ''}
                  </span>
                  {/* Marker Prefix */}
                  <span
                    className={`w-6 py-0.5 text-center select-none font-bold shrink-0 ${
                      isAdded
                        ? 'text-emerald-400'
                        : isRemoved
                          ? 'text-rose-400'
                          : 'text-neutral-600'
                    }`}
                  >
                    {isAdded ? '+' : isRemoved ? '-' : ' '}
                  </span>
                  {/* Line Content */}
                  <span className="flex-1 py-0.5 pr-4 whitespace-pre-wrap break-all leading-relaxed">
                    {line.content}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          /* SPLIT (SIDE-BY-SIDE) DIFF VIEW */
          <div
            className="grid grid-cols-2 divide-x divide-neutral-800"
            data-testid="split-diff-container"
          >
            {/* Left Column: Old / Removed */}
            <div className="divide-y divide-neutral-900/60">
              {activeFile.splitRows.map((row, idx) => {
                const oldLine = row.oldLine;
                if (!oldLine) {
                  return (
                    <div
                      key={`left-${idx}`}
                      className="flex items-start bg-neutral-950 text-transparent select-none py-0.5"
                    >
                      <span className="w-12 pr-2 text-right text-neutral-800 bg-neutral-950/60 border-r border-neutral-900 shrink-0 text-[11px]">
                        &nbsp;
                      </span>
                      <span className="w-6 text-center shrink-0">&nbsp;</span>
                      <span className="flex-1">&nbsp;</span>
                    </div>
                  );
                }

                const isRemoved = oldLine.type === 'removed';
                return (
                  <div
                    key={`left-${idx}`}
                    className={`flex items-start hover:bg-neutral-900/40 transition-colors ${
                      isRemoved ? 'bg-rose-950/30 text-rose-300' : 'text-neutral-300'
                    }`}
                    data-testid={`split-left-${oldLine.type}`}
                  >
                    <span className="w-12 py-0.5 pr-2 text-right select-none text-neutral-500 bg-neutral-950/60 border-r border-neutral-900 shrink-0 text-[11px]">
                      {oldLine.lineNumber}
                    </span>
                    <span
                      className={`w-6 py-0.5 text-center select-none font-bold shrink-0 ${
                        isRemoved ? 'text-rose-400' : 'text-neutral-600'
                      }`}
                    >
                      {isRemoved ? '-' : ' '}
                    </span>
                    <span className="flex-1 py-0.5 pr-2 whitespace-pre-wrap break-all leading-relaxed">
                      {oldLine.content}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Right Column: New / Added */}
            <div className="divide-y divide-neutral-900/60">
              {activeFile.splitRows.map((row, idx) => {
                const newLine = row.newLine;
                if (!newLine) {
                  return (
                    <div
                      key={`right-${idx}`}
                      className="flex items-start bg-neutral-950 text-transparent select-none py-0.5"
                    >
                      <span className="w-12 pr-2 text-right text-neutral-800 bg-neutral-950/60 border-r border-neutral-900 shrink-0 text-[11px]">
                        &nbsp;
                      </span>
                      <span className="w-6 text-center shrink-0">&nbsp;</span>
                      <span className="flex-1">&nbsp;</span>
                    </div>
                  );
                }

                const isAdded = newLine.type === 'added';
                return (
                  <div
                    key={`right-${idx}`}
                    className={`flex items-start hover:bg-neutral-900/40 transition-colors ${
                      isAdded ? 'bg-emerald-950/30 text-emerald-300' : 'text-neutral-300'
                    }`}
                    data-testid={`split-right-${newLine.type}`}
                  >
                    <span className="w-12 py-0.5 pr-2 text-right select-none text-neutral-500 bg-neutral-950/60 border-r border-neutral-900 shrink-0 text-[11px]">
                      {newLine.lineNumber}
                    </span>
                    <span
                      className={`w-6 py-0.5 text-center select-none font-bold shrink-0 ${
                        isAdded ? 'text-emerald-400' : 'text-neutral-600'
                      }`}
                    >
                      {isAdded ? '+' : ' '}
                    </span>
                    <span className="flex-1 py-0.5 pr-2 whitespace-pre-wrap break-all leading-relaxed">
                      {newLine.content}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
