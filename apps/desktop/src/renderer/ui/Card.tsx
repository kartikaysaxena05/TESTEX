import React from 'react';

export type CardVariant = 'default' | 'subtle';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
}

export function Card({ variant = 'default', className = '', children, ...rest }: CardProps) {
  const classes = ['card', `card-${variant}`, className].filter(Boolean).join(' ');
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}

export type CardHeaderProps = React.HTMLAttributes<HTMLDivElement>;

export function CardHeader({ className = '', children, ...rest }: CardHeaderProps) {
  return (
    <div className={`card-header ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
}

export interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  level?: 2 | 3 | 4;
}

export function CardTitle({ level = 3, className = '', children, ...rest }: CardTitleProps) {
  const Tag = `h${level}` as const;
  return (
    <Tag className={`card-title ${className}`.trim()} {...rest}>
      {children}
    </Tag>
  );
}

export type CardDescriptionProps = React.HTMLAttributes<HTMLParagraphElement>;

export function CardDescription({ className = '', children, ...rest }: CardDescriptionProps) {
  return (
    <p className={`card-description ${className}`.trim()} {...rest}>
      {children}
    </p>
  );
}

export type CardContentProps = React.HTMLAttributes<HTMLDivElement>;

export function CardContent({ className = '', children, ...rest }: CardContentProps) {
  return (
    <div className={`card-content ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
}

export type CardFooterProps = React.HTMLAttributes<HTMLDivElement>;

export function CardFooter({ className = '', children, ...rest }: CardFooterProps) {
  return (
    <div className={`card-footer ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
}
