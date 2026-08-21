import React, { forwardRef } from 'react';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid = false, className = '', ...rest },
  ref,
) {
  const classes = ['form-textarea', className].filter(Boolean).join(' ');

  return (
    <textarea ref={ref} className={classes} aria-invalid={invalid ? 'true' : undefined} {...rest} />
  );
});
