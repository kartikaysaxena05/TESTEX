import React from 'react';

export type SeparatorOrientation = 'horizontal' | 'vertical';

export interface SeparatorProps {
  orientation?: SeparatorOrientation;
  className?: string;
}

export function Separator({ orientation = 'horizontal', className = '' }: SeparatorProps) {
  return (
    <hr className={`separator-${orientation} ${className}`.trim()} aria-orientation={orientation} />
  );
}
