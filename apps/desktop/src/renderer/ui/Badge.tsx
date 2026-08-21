import React from 'react';

export type BadgeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  dot?: boolean;
}

export function Badge({
  variant = 'neutral',
  dot = false,
  className = '',
  children,
  ...rest
}: BadgeProps) {
  const classes = ['badge', `badge-${variant}`, className].filter(Boolean).join(' ');

  return (
    <span className={classes} {...rest}>
      {dot && <span className="badge-dot" aria-hidden="true" />}
      <span>{children}</span>
    </span>
  );
}
