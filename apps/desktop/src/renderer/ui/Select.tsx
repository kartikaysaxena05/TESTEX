import React, { forwardRef } from 'react';

export type SelectSize = 'sm' | 'md';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  sizeVariant?: SelectSize;
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { sizeVariant = 'md', invalid = false, className = '', children, ...rest },
  ref,
) {
  const classes = ['form-select', `form-select-${sizeVariant}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <select ref={ref} className={classes} aria-invalid={invalid ? 'true' : undefined} {...rest}>
      {children}
    </select>
  );
});
