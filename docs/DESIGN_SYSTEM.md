# Design System & Component Guidelines

## AI-Driven Software Quality Engineering Platform

---

## 1. Principles & Objectives

The design system provides a compact, accessible, domain-neutral component library built for desktop QA engineering tools.

### Core Tenets:

1. **Desktop Information Density:** Standard control heights calibrated to 30–36px (`--control-height-sm` and `--control-height-md`).
2. **Domain Neutrality:** Generic UI primitives know nothing about projects, requirements, Playwright tests, bugs, or Jira.
3. **Accessibility First:** Semantic HTML elements (`<button>`, `<input>`, `<select>`, `<dialog>`, `<table>`), ARIA roles, focus outlines, and `prefers-reduced-motion` compliance.
4. **Zero Heavy Frameworks:** Built purely with React 19, TypeScript, and standard CSS design tokens.
5. **No IPC in Primitives:** UI components never call `window.desktop.*`.

---

## 2. CSS Design Tokens

Tokens are defined in `apps/desktop/src/renderer/styles/tokens.css` and consumed via standard CSS custom properties:

| Category              | Token Name            | Value / Usage                                |
| :-------------------- | :-------------------- | :------------------------------------------- |
| **Backgrounds**       | `--bg-app`            | `#0f172a` (Primary app backdrop)             |
|                       | `--bg-sidebar`        | `#0b1120` (Sidebar background)               |
|                       | `--bg-surface`        | `#1e293b` (Panel / Card base)                |
|                       | `--bg-surface-raised` | `#243248` (Hover / Elevated panel)           |
|                       | `--bg-statusbar`      | `#080d1a` (Footer background)                |
| **Borders**           | `--border-default`    | `#263345` (Standard container border)        |
|                       | `--border-subtle`     | `#1e293b` (Subtle separator)                 |
|                       | `--border-highlight`  | `#334155` (Hover border)                     |
|                       | `--border-focus`      | `#38bdf8` (2px visible keyboard focus ring)  |
| **Typography**        | `--text-primary`      | `#f8fafc` (Headings and primary text)        |
|                       | `--text-secondary`    | `#94a3b8` (Supporting copy and descriptions) |
|                       | `--text-muted`        | `#64748b` (Meta labels and timestamps)       |
|                       | `--text-accent`       | `#38bdf8` (Active navigation and highlights) |
| **Status (Semantic)** | `--color-success`     | `#4ade80` (Pass / healthy state)             |
|                       | `--color-warning`     | `#fbbf24` (Attention / pending state)        |
|                       | `--color-danger`      | `#f87171` (Fail / destructive state)         |
|                       | `--color-info`        | `#38bdf8` (Informational notice)             |
| **Controls**          | `--control-height-sm` | `30px` (Compact buttons / inputs)            |
|                       | `--control-height-md` | `36px` (Standard desktop height)             |

---

## 3. Component Catalog

All components are exported from `apps/desktop/src/renderer/ui/index.ts`.

### Controls & Inputs

#### `<Button />`

- **Variants:** `primary`, `secondary`, `ghost`, `danger`
- **Sizes:** `sm`, `md`
- **States:** `disabled`, `loading` (sets `aria-busy="true"`, disables clicks, renders inline `<Spinner />`)
- **Usage:**
  ```tsx
  import { Button } from '../ui/index.js';

  <Button variant="primary" size="md" onClick={handleSave}>
    Save Changes
  </Button>
  <Button variant="danger" size="sm" loading={isDeleting}>
    Delete
  </Button>
  ```

#### `<IconButton />`

- **Props:** Requires mandatory `aria-label`, `icon`, `size?: 'sm' | 'md'`
- **Usage:**
  ```tsx
  import { IconButton } from '../ui/index.js';

  <IconButton aria-label="Refresh Data" size="sm" icon={<RefreshIcon />} onClick={handleRefresh} />;
  ```

#### `<FormField />` & `<Input />` / `<Textarea />` / `<Select />`

- Automatically links `label` `htmlFor`, description `id`, and error alert with `aria-describedby` and `aria-invalid`.
- **Usage:**
  ```tsx
  import { FormField, Input } from '../ui/index.js';

  <FormField
    label="Target Base URL"
    htmlFor="base-url-input"
    description="Enter the root HTTP endpoint for web testing"
    error={urlError}
    required
  >
    <Input placeholder="https://example.com" />
  </FormField>;
  ```

#### `<Checkbox />`

- Native `<input type="checkbox">` wrapped with accessible clickable label.
- **Usage:**
  ```tsx
  import { Checkbox } from '../ui/index.js';

  <Checkbox label="Enable autonomous healing" defaultChecked />;
  ```

---

### Data Display & Layout

#### `<Card />`

- Composable structural container: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`.
- **Usage:**
  ```tsx
  import { Card, CardHeader, CardTitle, CardContent } from '../ui/index.js';

  <Card variant="default">
    <CardHeader>
      <CardTitle level={3}>Test Run Details</CardTitle>
    </CardHeader>
    <CardContent>
      <p>Results summary content...</p>
    </CardContent>
  </Card>;
  ```

#### `<Badge />`

- Semantic status pills: `neutral`, `success`, `warning`, `danger`, `info` with optional `dot`.
- **Usage:**
  ```tsx
  import { Badge } from '../ui/index.js';

  <Badge variant="success" dot>PASSED</Badge>
  <Badge variant="danger">FAILED</Badge>
  ```

#### `<EmptyState />`

- Reusable empty state with icon slot, title, description, and optional action button.
- **Usage:**
  ```tsx
  import { EmptyState, Button } from '../ui/index.js';

  <EmptyState
    screenId="requirements"
    title="No Requirements Available"
    description="Requirements will appear here once specifications are uploaded."
    action={<Button variant="primary">Upload Document</Button>}
  />;
  ```

#### `<Table />`

- Semantic HTML table primitives: `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`.
- **Usage:**
  ```tsx
  import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../ui/index.js';

  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Test ID</TableHead>
        <TableHead>Title</TableHead>
        <TableHead>Status</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow>
        <TableCell>TC-101</TableCell>
        <TableCell>User Authentication</TableCell>
        <TableCell><Badge variant="success">PASS</TableCell>
      </TableRow>
    </TableBody>
  </Table>
  ```

---

### Feedback & Overlays

#### `<Alert />`

- Inline notification box: `info`, `success`, `warning`, `danger`.
- **Usage:**
  ```tsx
  import { Alert } from '../ui/index.js';

  <Alert variant="warning" title="Stale Artifact">
    The test snapshot was recorded with a previous DOM version.
  </Alert>;
  ```

#### `<Dialog />`

- Accessible modal dialog supporting `Escape` dismissal, backdrop click closing, focus restoration, `role="dialog"`, `aria-modal="true"`, and `aria-labelledby`.
- **Usage:**
  ```tsx
  import { Dialog, Button } from '../ui/index.js';

  <Dialog
    open={isOpen}
    onClose={() => setIsOpen(false)}
    title="Confirm Test Suite Deletion"
    description="This will permanently delete all associated execution runs."
    footer={
      <>
        <Button variant="ghost" onClick={() => setIsOpen(false)}>
          Cancel
        </Button>
        <Button variant="danger" onClick={handleDelete}>
          Delete
        </Button>
      </>
    }
  >
    <p>Are you sure you want to proceed?</p>
  </Dialog>;
  ```

#### `<Tabs />`

- Accessible ARIA tabs with keyboard arrow navigation (Left/Right/Home/End): `Tabs`, `TabList`, `Tab`, `TabPanel`.
- **Usage:**
  ```tsx
  import { Tabs, TabList, Tab, TabPanel } from '../ui/index.js';

  <Tabs defaultValue="overview">
    <TabList aria-label="Project Sections">
      <Tab value="overview">Overview</Tab>
      <Tab value="runs">Test Runs</Tab>
    </TabList>
    <TabPanel value="overview">Overview content...</TabPanel>
    <TabPanel value="runs">Test runs list...</TabPanel>
  </Tabs>;
  ```

#### `<Spinner />` & `<Skeleton />`

- Standard loading indicators respecting `prefers-reduced-motion`.

---

## 4. Component Creation Rules

Before creating a new reusable primitive in future phases:

1. **Confirm existing primitives cannot solve it:** Check if composition of `Card`, `Badge`, `Button`, or `Table` meets the requirement.
2. **Keep primitives domain-neutral:** Never couple UI components to specific database schemas, AI endpoints, or IPC channels.
3. **Ensure keyboard accessibility:** Verify native elements, visible `:focus-visible` outlines, and ARIA relationships.
4. **Include behavioral unit tests:** Write tests verifying state, props, and accessibility roles.
5. **Avoid one-off variants:** Use established design tokens and variants (`primary`, `secondary`, `ghost`, `danger`, `success`, `warning`, `info`).
