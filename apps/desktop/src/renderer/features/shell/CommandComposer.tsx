import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useProject } from '../../context/ProjectContext.js';
import { useWorkspace } from '../../context/WorkspaceContext.js';

export type ComposerMode = 'autonomous' | 'requirements' | 'failure' | 'regression';

export function CommandComposer(): React.JSX.Element {
  const { selectedProjectId } = useProject();
  const { addSessionMessage, registerComposerFocusHandler, activeSessionId } = useWorkspace();
  const [commandText, setCommandText] = useState('');
  const [selectedMode, setSelectedMode] = useState<ComposerMode>('autonomous');
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);
  const [showAttachNotice, setShowAttachNotice] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Register focus handler for global Cmd/Ctrl + K shortcut
  useEffect(() => {
    const unregister = registerComposerFocusHandler(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.select();
      }
    });
    return unregister;
  }, [registerComposerFocusHandler]);

  const suggestionChips = [
    'Test complete authentication flow',
    'Run regression tests on latest changes',
    'Inspect unverified high-severity defects',
    'Verify cart subtotal calculation',
  ];

  const handleChipClick = (chip: string) => {
    setCommandText(chip);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleAttachClick = async () => {
    if (window.desktop?.sources?.pickDirectory) {
      try {
        const res = await window.desktop.sources.pickDirectory();
        if (res.ok && !res.data.cancelled && res.data.directoryPath) {
          setCommandText(prev =>
            prev.trim()
              ? `${prev.trim()}\nContext path: ${res.data.directoryPath}`
              : `Analyze codebase at: ${res.data.directoryPath}`,
          );
          if (textareaRef.current) {
            textareaRef.current.focus();
          }
          return;
        }
      } catch {
        // Fallback to tooltip
      }
    }
    setShowAttachNotice(true);
    setTimeout(() => setShowAttachNotice(false), 4000);
  };

  const executeSubmit = useCallback(async () => {
    const trimmed = commandText.trim();
    if (!trimmed || isRunning) return;

    if (!selectedProjectId) {
      setFeedbackNotice('Run unavailable until project context is configured.');
      return;
    }

    // Append to chronological session messages
    addSessionMessage({
      role: 'user',
      content: trimmed,
      mode: selectedMode,
    });

    setCommandText('');

    if (window.desktop?.conversationalAgent?.sendMessage) {
      setIsRunning(true);
      setFeedbackNotice(`Agent analyzing request in ${selectedMode} mode...`);

      try {
        let currentSessionId = activeSessionId;
        if (!currentSessionId) {
          const listRes = await window.desktop.conversationalAgent.listSessions({
            projectId: selectedProjectId,
          });
          if (listRes.ok && listRes.data.length > 0 && listRes.data[0]) {
            currentSessionId = listRes.data[0].id;
          } else {
            const createRes = await window.desktop.conversationalAgent.createSession({
              projectId: selectedProjectId,
              title: `${selectedMode.charAt(0).toUpperCase() + selectedMode.slice(1)} Session`,
            });
            if (createRes.ok) {
              currentSessionId = createRes.data.id;
            }
          }
        }

        if (currentSessionId) {
          const res = await window.desktop.conversationalAgent.sendMessage({
            sessionId: currentSessionId,
            projectId: selectedProjectId,
            content: trimmed,
          });

          if (res.ok) {
            const agentContent = res.data.agentMessage?.content ?? 'Task processed successfully.';
            addSessionMessage({
              role: 'agent',
              content: agentContent,
              status: 'completed',
              mode: selectedMode,
            });
            setFeedbackNotice(
              res.data.sessionStatus === 'WAITING'
                ? 'Agent awaiting input or clarification.'
                : `Command executed in ${selectedMode} mode.`,
            );
          } else {
            addSessionMessage({
              role: 'agent',
              content: res.error?.message || 'Agent was unable to process the request.',
              status: 'info',
              mode: selectedMode,
            });
            setFeedbackNotice(res.error?.message || 'Agent error occurred.');
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Error communicating with AI agent';
        addSessionMessage({
          role: 'agent',
          content: `Agent notice: ${errorMsg}`,
          status: 'info',
          mode: selectedMode,
        });
        setFeedbackNotice(errorMsg);
      } finally {
        setIsRunning(false);
      }
    } else {
      addSessionMessage({
        role: 'agent',
        content: `Command received: "${trimmed}". Dispatched in ${selectedMode} mode.`,
        status: 'completed',
        mode: selectedMode,
      });
      setFeedbackNotice(`Command dispatched in ${selectedMode} mode.`);
    }
  }, [commandText, selectedProjectId, selectedMode, activeSessionId, isRunning, addSessionMessage]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSubmit();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Cmd+Enter or Ctrl+Enter
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      executeSubmit();
      return;
    }
    // Submit on Enter without Shift
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      executeSubmit();
    }
  };

  return (
    <div
      className="codex-command-composer"
      data-testid="codex-command-composer"
      aria-label="Command Composer"
    >
      <div className="composer-chips-row" role="list" aria-label="Suggested Commands">
        {suggestionChips.map((chip, idx) => (
          <button
            key={idx}
            type="button"
            className="composer-chip-btn"
            onClick={() => handleChipClick(chip)}
            aria-label={`Suggest command: ${chip}`}
          >
            {chip}
          </button>
        ))}
      </div>

      <form className="composer-input-row" onSubmit={handleSubmit}>
        <div className="composer-attach-wrapper">
          <button
            type="button"
            className="composer-attach-btn"
            data-testid="composer-attach-btn"
            onClick={handleAttachClick}
            aria-label="Add Context or Attachment"
            title="Attach folder or repository context"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          {showAttachNotice && (
            <div
              className="composer-attach-tooltip"
              data-testid="composer-attach-tooltip"
              role="alert"
            >
              Attachment and source folder context can be added here.
            </div>
          )}
        </div>

        <div className="composer-input-wrapper">
          <label htmlFor="composer-textarea" className="sr-only">
            Ask AI to test, analyze or investigate
          </label>
          <textarea
            id="composer-textarea"
            ref={textareaRef}
            rows={1}
            className="composer-textarea"
            data-testid="composer-textarea"
            value={commandText}
            onChange={e => {
              setCommandText(e.target.value);
              if (feedbackNotice) setFeedbackNotice(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ask AI what to test, analyze or investigate (Press Enter or Cmd+Enter to run, Shift+Enter for newline)..."
            aria-label="Ask AI what to test, analyze or investigate"
          />
        </div>

        <div className="composer-mode-selector-wrapper">
          <label htmlFor="composer-mode-select" className="sr-only">
            Testing Mode
          </label>
          <select
            id="composer-mode-select"
            className="composer-mode-select"
            data-testid="composer-mode-select"
            value={selectedMode}
            onChange={e => setSelectedMode(e.target.value as ComposerMode)}
            aria-label="Select Testing Mode"
          >
            <option value="autonomous">Autonomous Testing</option>
            <option value="requirements">Requirement Analysis</option>
            <option value="failure">Failure Investigation</option>
            <option value="regression">Regression Suite</option>
          </select>
        </div>

        <button
          type="submit"
          className="composer-submit-btn"
          data-testid="composer-run-btn"
          disabled={!commandText.trim() || isRunning}
          aria-label="Run Command"
          title={isRunning ? "Running..." : "Run Command (Cmd+Enter)"}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <span>Run</span>
          <span className="sr-only">Send</span>
        </button>
      </form>

      {feedbackNotice && (
        <div
          className="composer-feedback-notice"
          data-testid="composer-feedback-notice"
          role="status"
          aria-live="polite"
        >
          <span>{feedbackNotice}</span>
        </div>
      )}
    </div>
  );
}
