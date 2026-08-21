import React from 'react';

export type SpinnerSize = 'sm' | 'md';

export interface SpinnerProps {
  size?: SpinnerSize;
  label?: string;
  className?: string;
}

export function Spinner({ size = 'md', label = 'Loading...', className = '' }: SpinnerProps) {
  return (
    <span
      className={`spinner spinner-${size} ${className}`.trim()}
      role="status"
      aria-label={label}
    />
  );
}
