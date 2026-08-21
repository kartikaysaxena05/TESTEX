/**
 * @file apps/desktop/src/renderer/ui/index.ts
 * Public entry point for Design System & Reusable UI Components.
 */

// Controls
export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from './Button.js';
export { IconButton, type IconButtonProps, type IconButtonSize } from './IconButton.js';
export { Input, type InputProps, type InputSize } from './Input.js';
export { Textarea, type TextareaProps } from './Textarea.js';
export { Select, type SelectProps, type SelectSize } from './Select.js';
export { Checkbox, type CheckboxProps } from './Checkbox.js';
export { FormField, type FormFieldProps } from './FormField.js';

// Layout & Structure
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  type CardProps,
  type CardVariant,
} from './Card.js';
export { Separator, type SeparatorProps, type SeparatorOrientation } from './Separator.js';

// Data Display
export { Badge, type BadgeProps, type BadgeVariant } from './Badge.js';
export { EmptyState, type EmptyStateProps } from './EmptyState.js';
export {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  type TableProps,
} from './Table.js';

// Feedback & Loading
export { Alert, type AlertProps, type AlertVariant } from './Alert.js';
export { Spinner, type SpinnerProps, type SpinnerSize } from './Spinner.js';
export { Skeleton, type SkeletonProps } from './Skeleton.js';

// Overlays & Navigation
export { Dialog, type DialogProps } from './Dialog.js';
export {
  Tabs,
  TabList,
  Tab,
  TabPanel,
  type TabsProps,
  type TabProps,
  type TabListProps,
  type TabPanelProps,
} from './Tabs.js';
