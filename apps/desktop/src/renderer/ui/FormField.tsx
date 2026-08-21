import React from 'react';

export interface FormFieldProps {
  label: string;
  htmlFor: string;
  description?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function FormField({
  label,
  htmlFor,
  description,
  error,
  required = false,
  className = '',
  children,
}: FormFieldProps) {
  const descId = description ? `${htmlFor}-desc` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;
  const describedBy = [descId, errorId].filter(Boolean).join(' ') || undefined;

  // Clone child to automatically pass id, aria-describedby, aria-invalid if appropriate
  const clonedChild = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        id: htmlFor,
        'aria-describedby': describedBy,
        invalid: Boolean(error),
      })
    : children;

  return (
    <div className={`form-field ${className}`.trim()}>
      <label htmlFor={htmlFor} className="form-label">
        <span>{label}</span>
        {required && (
          <span aria-hidden="true" style={{ color: 'var(--color-danger)' }}>
            *
          </span>
        )}
      </label>
      {clonedChild}
      {description && !error && (
        <span id={descId} className="form-description">
          {description}
        </span>
      )}
      {error && (
        <span id={errorId} className="form-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
