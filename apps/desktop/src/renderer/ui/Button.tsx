import React, { forwardRef } from 'react';
import { Spinner } from './Spinner.js';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    icon,
    disabled = false,
    className = '',
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  const isActuallyDisabled = disabled || loading;
  const classes = ['btn', `btn-${variant}`, `btn-${size}`, loading ? 'btn-loading' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={isActuallyDisabled}
      aria-busy={loading ? 'true' : undefined}
      {...rest}
    >
      {loading ? (
        <span className="btn-spinner" aria-hidden="true">
          <Spinner size="sm" />
        </span>
      ) : (
        icon && (
          <span className="btn-icon" aria-hidden="true">
            {icon}
          </span>
        )
      )}
      {children && <span>{children}</span>}
    </button>
  );
});
