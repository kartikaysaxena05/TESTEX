import React, { useState, useEffect, useCallback } from 'react';
import type {
  RequirementDocumentDto,
  RequirementDocumentExtractionDto,
} from '@ai-quality/contracts';
import {
  Dialog,
  Button,
  Badge,
  Spinner,
  Alert,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  EmptyState,
  type BadgeVariant,
} from '../../ui/index.js';

export interface DocumentExtractionModalProps {
  readonly isOpen: boolean;
  readonly projectId: string;
  readonly document: RequirementDocumentDto | null;
  readonly onClose: () => void;
}

export function DocumentExtractionModal({
  isOpen,
  projectId,
  document,
  onClose,
}: DocumentExtractionModalProps) {
  const [extraction, setExtraction] = useState<RequirementDocumentExtractionDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<string>('text');
  const [copied, setCopied] = useState<boolean>(false);

  const fetchExtraction = useCallback(async () => {
    if (!document) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      if (!window.desktop?.requirementDocuments?.getExtraction) {
        setExtraction(null);
        return;
      }

      const res = await window.desktop.requirementDocuments.getExtraction({
        projectId,
        documentId: document.id,
      });

      if (res.ok) {
        setExtraction(res.data);
      } else {
        setErrorMessage(res.error.message || 'Failed to fetch document extraction.');
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [projectId, document]);

  useEffect(() => {
    if (isOpen && document) {
      void fetchExtraction();
    } else {
      setExtraction(null);
      setErrorMessage(null);
      setSelectedTab('text');
      setCopied(false);
    }
  }, [isOpen, document, fetchExtraction]);

  const handleExtract = async (force = false) => {
    if (!document) return;
    setIsExtracting(true);
    setErrorMessage(null);

    try {
      if (!window.desktop?.requirementDocuments?.extract) {
        setErrorMessage('Desktop extraction bridge is unavailable.');
        return;
      }

      const res = await window.desktop.requirementDocuments.extract({
        projectId,
        documentId: document.id,
        force,
      });

      if (res.ok) {
        setExtraction(res.data);
      } else {
        setErrorMessage(res.error.message || 'Extraction failed.');
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsExtracting(false);
    }
  };

  const handleCopyText = async () => {
    if (!extraction?.plainText) return;
    try {
      await navigator.clipboard.writeText(extraction.plainText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  if (!isOpen || !document) return null;

  const getFormatBadgeVariant = (format: string): BadgeVariant => {
    switch (format.toLowerCase()) {
      case 'pdf':
        return 'danger';
      case 'docx':
        return 'info';
      case 'md':
        return 'success';
      case 'txt':
      default:
        return 'neutral';
    }
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title={`Document Extraction: ${document.originalFileName}`}
      className="max-w-4xl max-h-[90vh] flex flex-col"
    >
      <div className="flex flex-col space-y-4 overflow-y-auto pr-1">
        {/* Document Header Details */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-900/60 rounded-lg border border-slate-800 text-xs text-slate-300">
          <div className="flex items-center space-x-3">
            <Badge variant={getFormatBadgeVariant(document.fileExtension)}>
              .{document.fileExtension.toUpperCase()}
            </Badge>
            <span>
              Size:{' '}
              <strong className="text-white">{(document.fileSize / 1024).toFixed(1)} KB</strong>
            </span>
            <span className="font-mono text-slate-400">
              SHA: {document.sha256.substring(0, 12)}...
            </span>
          </div>

          <div className="flex items-center space-x-2">
            {extraction ? (
              <Badge variant={extraction.warnings.length > 0 ? 'warning' : 'success'}>
                {extraction.warnings.length > 0 ? 'Extracted (Warnings)' : 'Extracted'}
              </Badge>
            ) : (
              <Badge variant="neutral">Not Extracted</Badge>
            )}

            <Button
              variant="secondary"
              size="sm"
              disabled={isExtracting || isLoading}
              onClick={() => void handleExtract(Boolean(extraction))}
            >
              {isExtracting ? (
                <span className="flex items-center space-x-1.5">
                  <Spinner size="sm" />
                  <span>Extracting...</span>
                </span>
              ) : extraction ? (
                'Re-extract'
              ) : (
                'Extract Document'
              )}
            </Button>
          </div>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <Alert variant="danger" title="Extraction Error">
            {errorMessage}
          </Alert>
        )}

        {/* Loading Spinner */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-12 space-y-3">
            <Spinner size="md" />
            <p className="text-sm text-slate-400">Loading document extraction...</p>
          </div>
        )}

        {/* Not Extracted State */}
        {!isLoading && !extraction && !errorMessage && (
          <EmptyState
            title="Document Not Extracted"
            description="Extract this requirement document to inspect its plain text, structural headings, hierarchy, lists, and tables."
            action={
              <Button
                variant="primary"
                onClick={() => void handleExtract(false)}
                disabled={isExtracting}
              >
                {isExtracting ? 'Extracting...' : 'Extract Document Now'}
              </Button>
            }
          />
        )}

        {/* Extracted View */}
        {!isLoading && extraction && (
          <div className="space-y-4">
            {/* Factual Metrics Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-center text-xs">
              <div className="p-2.5 bg-slate-900/40 rounded border border-slate-800">
                <span className="text-slate-400 block">Pages</span>
                <strong className="text-base text-white">
                  {extraction.pageCount !== null ? extraction.pageCount : 'N/A'}
                </strong>
              </div>
              <div className="p-2.5 bg-slate-900/40 rounded border border-slate-800">
                <span className="text-slate-400 block">Blocks</span>
                <strong className="text-base text-white">{extraction.blockCount}</strong>
              </div>
              <div className="p-2.5 bg-slate-900/40 rounded border border-slate-800">
                <span className="text-slate-400 block">Headings</span>
                <strong className="text-base text-white">{extraction.headingCount}</strong>
              </div>
              <div className="p-2.5 bg-slate-900/40 rounded border border-slate-800">
                <span className="text-slate-400 block">Sections</span>
                <strong className="text-base text-white">{extraction.sectionCount}</strong>
              </div>
              <div className="p-2.5 bg-slate-900/40 rounded border border-slate-800">
                <span className="text-slate-400 block">Tables</span>
                <strong className="text-base text-white">{extraction.tableCount}</strong>
              </div>
              <div className="p-2.5 bg-slate-900/40 rounded border border-slate-800">
                <span className="text-slate-400 block">Lines</span>
                <strong className="text-base text-white">{extraction.lineCount}</strong>
              </div>
              <div className="p-2.5 bg-slate-900/40 rounded border border-slate-800">
                <span className="text-slate-400 block">Characters</span>
                <strong className="text-base text-white">{extraction.characterCount}</strong>
              </div>
            </div>

            {/* Warnings Alert */}
            {extraction.warnings.length > 0 && (
              <div className="space-y-2">
                {extraction.warnings.map((w, idx) => (
                  <Alert key={idx} variant="warning" title={`Warning: ${w.code}`}>
                    {w.message}
                  </Alert>
                ))}
              </div>
            )}

            {/* Tabs */}
            <Tabs value={selectedTab} onChange={setSelectedTab}>
              <TabList>
                <Tab value="text">Plain Text Preview</Tab>
                <Tab value="structure">Structure & Headings ({extraction.headingCount})</Tab>
                <Tab value="blocks">Blocks ({extraction.blockCount})</Tab>
                {extraction.tables.length > 0 && (
                  <Tab value="tables">Tables ({extraction.tables.length})</Tab>
                )}
              </TabList>

              {/* Text Preview Panel */}
              <TabPanel value="text">
                <div className="space-y-2 pt-2">
                  <div className="flex justify-between items-center text-xs text-slate-400">
                    <span>
                      Normalized UTF-8 Extracted Text ({extraction.characterCount} characters,{' '}
                      {extraction.lineCount} lines)
                    </span>
                    <Button variant="secondary" size="sm" onClick={() => void handleCopyText()}>
                      {copied ? 'Copied!' : 'Copy Text'}
                    </Button>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 max-h-96 overflow-y-auto font-mono text-xs text-slate-200 whitespace-pre-wrap leading-relaxed select-text">
                    {extraction.plainText || '(Empty document)'}
                  </div>
                </div>
              </TabPanel>

              {/* Structure & Headings Preview Panel */}
              <TabPanel value="structure">
                <div className="space-y-2 pt-2">
                  {extraction.headings.length === 0 ? (
                    <p className="text-sm text-slate-400 italic py-6 text-center">
                      No structural headings detected in this document.
                    </p>
                  ) : (
                    <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
                      {extraction.headings.map(h => (
                        <div
                          key={h.id}
                          style={{ paddingLeft: `${(h.level - 1) * 1.5}rem` }}
                          className="flex items-center space-x-2 py-1 px-2 rounded hover:bg-slate-800/40 text-xs"
                        >
                          <span className="font-mono px-1.5 py-0.5 rounded bg-slate-800 text-cyan-400 text-[10px] font-bold">
                            H{h.level}
                          </span>
                          <span className="text-slate-200 font-medium">{h.text}</span>
                          {h.pageNumber !== null && (
                            <span className="text-[10px] text-slate-500 font-mono">
                              (Page {h.pageNumber})
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabPanel>

              {/* Blocks Preview Panel */}
              <TabPanel value="blocks">
                <div className="space-y-2 pt-2 max-h-96 overflow-y-auto pr-1">
                  {extraction.blocks.map(b => (
                    <div
                      key={b.id}
                      className="p-2.5 rounded bg-slate-900/50 border border-slate-800 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-slate-500">#{b.orderIndex}</span>
                          <Badge
                            variant={
                              b.type === 'HEADING'
                                ? 'info'
                                : b.type === 'TABLE'
                                  ? 'warning'
                                  : b.type === 'LIST_ITEM'
                                    ? 'success'
                                    : 'neutral'
                            }
                          >
                            {b.type}
                          </Badge>
                          {b.headingLevel && (
                            <span className="text-cyan-400 font-mono">H{b.headingLevel}</span>
                          )}
                        </div>
                        <div className="flex items-center space-x-2 text-[10px] text-slate-500 font-mono">
                          {b.pageNumber !== null && <span>Page {b.pageNumber}</span>}
                          <span>
                            Lines {b.lineStart}-{b.lineEnd}
                          </span>
                          <span>
                            Offsets {b.startOffset}-{b.endOffset}
                          </span>
                        </div>
                      </div>
                      <p className="text-slate-300 font-mono text-[11px] whitespace-pre-wrap">
                        {b.text}
                      </p>
                    </div>
                  ))}
                </div>
              </TabPanel>

              {/* Tables Preview Panel */}
              {extraction.tables.length > 0 && (
                <TabPanel value="tables">
                  <div className="space-y-4 pt-2 max-h-96 overflow-y-auto pr-1">
                    {extraction.tables.map((tbl, tIdx) => (
                      <div
                        key={tbl.id}
                        className="border border-slate-800 rounded-lg overflow-hidden"
                      >
                        <div className="bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-300 flex justify-between">
                          <span>
                            Table #{tIdx + 1} ({tbl.rowCount} rows, {tbl.columnCount} cols)
                          </span>
                          {tbl.pageNumber !== null && <span>Page {tbl.pageNumber}</span>}
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs text-left border-collapse">
                            <tbody>
                              {tbl.rows.map(row => (
                                <tr
                                  key={row.rowIndex}
                                  className={
                                    row.rowIndex === 0
                                      ? 'bg-slate-900/80 font-semibold border-b border-slate-700 text-white'
                                      : 'border-b border-slate-800/60 text-slate-300'
                                  }
                                >
                                  {row.cells.map(cell => (
                                    <td
                                      key={cell.columnIndex}
                                      className="px-3 py-1.5 border-r border-slate-800/60 last:border-r-0"
                                    >
                                      {cell.text}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                </TabPanel>
              )}
            </Tabs>
          </div>
        )}
      </div>

      <div className="flex justify-end pt-4 border-t border-slate-800 mt-4">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </Dialog>
  );
}
