import React, { forwardRef } from 'react';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, id, disabled = false, className = '', ...rest },
  ref,
) {
  const inputId = id || (label ? `cb-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);
  const containerClasses = ['checkbox-container', disabled ? 'disabled' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <label className={containerClasses} htmlFor={inputId}>
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        className="checkbox-input"
        disabled={disabled}
        {...rest}
      />
      <span className="checkbox-label">{label}</span>
    </label>
  );
});
