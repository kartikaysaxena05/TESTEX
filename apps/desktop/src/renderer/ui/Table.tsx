import React from 'react';

export interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  containerClassName?: string;
}

export function Table({ containerClassName = '', className = '', children, ...rest }: TableProps) {
  return (
    <div className={`table-container ${containerClassName}`.trim()}>
      <table className={`table ${className}`.trim()} {...rest}>
        {children}
      </table>
    </div>
  );
}

export type TableHeaderProps = React.HTMLAttributes<HTMLTableSectionElement>;

export function TableHeader({ className = '', children, ...rest }: TableHeaderProps) {
  return (
    <thead className={`table-header ${className}`.trim()} {...rest}>
      {children}
    </thead>
  );
}

export type TableBodyProps = React.HTMLAttributes<HTMLTableSectionElement>;

export function TableBody({ className = '', children, ...rest }: TableBodyProps) {
  return (
    <tbody className={`table-body ${className}`.trim()} {...rest}>
      {children}
    </tbody>
  );
}

export type TableRowProps = React.HTMLAttributes<HTMLTableRowElement>;

export function TableRow({ className = '', children, ...rest }: TableRowProps) {
  return (
    <tr className={`table-row ${className}`.trim()} {...rest}>
      {children}
    </tr>
  );
}

export type TableHeadProps = React.ThHTMLAttributes<HTMLTableCellElement>;

export function TableHead({ className = '', children, ...rest }: TableHeadProps) {
  return (
    <th className={`table-head ${className}`.trim()} scope="col" {...rest}>
      {children}
    </th>
  );
}

export type TableCellProps = React.TdHTMLAttributes<HTMLTableCellElement>;

export function TableCell({ className = '', children, ...rest }: TableCellProps) {
  return (
    <td className={`table-cell ${className}`.trim()} {...rest}>
      {children}
    </td>
  );
}
