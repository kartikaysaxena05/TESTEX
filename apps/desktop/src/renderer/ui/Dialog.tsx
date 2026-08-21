import React, { useEffect, useRef } from 'react';
import { IconButton } from './IconButton.js';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  footer?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  footer,
  className = '',
  children,
}: DialogProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Focus trap / management & Escape handler
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      // Focus modal content
      contentRef.current?.focus();

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      };

      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus();
    }
  }, [open, onClose]);

  if (!open) return null;

  const descId = description ? 'dialog-description' : undefined;

  return (
    <div className="dialog-backdrop" onClick={onClose} data-testid="dialog-backdrop">
      <div
        ref={contentRef}
        className={`dialog-content ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby={descId}
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
      >
        <div className="dialog-header">
          <div>
            <h2 id="dialog-title" className="dialog-title">
              {title}
            </h2>
            {description && (
              <p id={descId} className="dialog-description">
                {description}
              </p>
            )}
          </div>
          <IconButton
            size="sm"
            aria-label="Close dialog"
            onClick={onClose}
            icon={
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            }
          />
        </div>

        <div className="dialog-body">{children}</div>

        {footer && <div className="dialog-footer">{footer}</div>}
      </div>
    </div>
  );
}
