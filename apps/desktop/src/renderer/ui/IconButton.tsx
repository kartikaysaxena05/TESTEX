import React, { forwardRef } from 'react';

export type IconButtonSize = 'sm' | 'md';

export interface IconButtonProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-label'
> {
  'aria-label': string; // Enforce mandatory accessible label
  size?: IconButtonSize;
  icon: React.ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { 'aria-label': ariaLabel, size = 'md', icon, className = '', type = 'button', ...rest },
  ref,
) {
  const classes = ['icon-btn', `icon-btn-${size}`, className].filter(Boolean).join(' ');

  return (
    <button ref={ref} type={type} className={classes} aria-label={ariaLabel} {...rest}>
      <span aria-hidden="true">{icon}</span>
    </button>
  );
});
