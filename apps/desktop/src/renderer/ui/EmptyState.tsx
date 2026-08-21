import React from 'react';

export interface EmptyStateProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  screenId?: string;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  screenId,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`empty-state ${className}`.trim()}
      data-screen={screenId}
      data-testid={screenId ? `screen-${screenId}` : 'empty-state'}
    >
      {icon && (
        <div className="empty-state-icon" aria-hidden="true">
          {icon}
        </div>
      )}
      <h2 className="empty-state-title">{title}</h2>
      <p className="empty-state-description">{description}</p>
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
