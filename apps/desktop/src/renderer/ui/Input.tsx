import React, { forwardRef } from 'react';

export type InputSize = 'sm' | 'md';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  sizeVariant?: InputSize;
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { sizeVariant = 'md', invalid = false, className = '', ...rest },
  ref,
) {
  const classes = ['form-input', `form-input-${sizeVariant}`, className].filter(Boolean).join(' ');

  return (
    <input ref={ref} className={classes} aria-invalid={invalid ? 'true' : undefined} {...rest} />
  );
});
