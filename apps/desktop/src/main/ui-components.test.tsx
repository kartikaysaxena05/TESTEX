import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  Button,
  IconButton,
  Input,
  Textarea,
  Select,
  Checkbox,
  FormField,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,
  Alert,
  EmptyState,
  Spinner,
  Skeleton,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Dialog,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  Separator,
} from '../renderer/ui/index.js';

describe('Design System UI Components Unit Tests', () => {
  describe('Button Component', () => {
    it('should render standard button with variant and size classes', () => {
      const html = renderToString(
        <Button variant="primary" size="md">
          Execute Run
        </Button>,
      );
      assert.ok(html.includes('btn'), 'Must include base .btn class');
      assert.ok(html.includes('btn-primary'), 'Must include .btn-primary class');
      assert.ok(html.includes('btn-md'), 'Must include .btn-md class');
      assert.ok(html.includes('Execute Run'), 'Must render button label');
    });

    it('should apply disabled state natively', () => {
      const html = renderToString(
        <Button disabled variant="secondary">
          Disabled Action
        </Button>,
      );
      assert.ok(
        html.includes('disabled=""') || html.includes('disabled'),
        'Must have native disabled attribute',
      );
    });

    it('should handle loading state with aria-busy and spinner', () => {
      const html = renderToString(
        <Button loading variant="primary">
          Saving...
        </Button>,
      );
      assert.ok(html.includes('btn-loading'), 'Must include .btn-loading class');
      assert.ok(html.includes('aria-busy="true"'), 'Must communicate loading via aria-busy');
      assert.ok(html.includes('disabled'), 'Must disable button during loading');
      assert.ok(html.includes('spinner'), 'Must include spinner element');
    });
  });

  describe('IconButton Component', () => {
    it('should render icon button with mandatory aria-label', () => {
      const html = renderToString(
        <IconButton
          aria-label="Refresh Workspace"
          size="sm"
          icon={<span className="test-icon" />}
        />,
      );
      assert.ok(html.includes('icon-btn'), 'Must include .icon-btn class');
      assert.ok(html.includes('icon-btn-sm'), 'Must include .icon-btn-sm class');
      assert.ok(html.includes('aria-label="Refresh Workspace"'), 'Must have accessible label');
      assert.ok(html.includes('test-icon'), 'Must render icon inside');
    });
  });

  describe('Form Controls & FormField', () => {
    it('should connect FormField label, description, and input through IDs', () => {
      const html = renderToString(
        <FormField
          label="Project Name"
          htmlFor="proj-name-input"
          description="Enter a unique name for this test workspace"
        >
          <Input placeholder="E.g. Payment Gateway" />
        </FormField>,
      );
      assert.ok(html.includes('for="proj-name-input"'), 'Label must have matching htmlFor');
      assert.ok(html.includes('id="proj-name-input"'), 'Input must receive linked id');
      assert.ok(html.includes('id="proj-name-input-desc"'), 'Description must have desc id');
      assert.ok(
        html.includes('aria-describedby="proj-name-input-desc"'),
        'Input must have aria-describedby',
      );
    });

    it('should associate error alert and set aria-invalid on invalid fields', () => {
      const html = renderToString(
        <FormField
          label="Target Host"
          htmlFor="host-input"
          error="Host URL is malformed or unreachable"
        >
          <Input />
        </FormField>,
      );
      assert.ok(html.includes('role="alert"'), 'Error must have alert role');
      assert.ok(html.includes('Host URL is malformed or unreachable'), 'Must render error message');
      assert.ok(html.includes('aria-invalid="true"'), 'Input must have aria-invalid="true"');
      assert.ok(html.includes('id="host-input-error"'), 'Error must have error id');
      assert.ok(
        html.includes('aria-describedby="host-input-error"'),
        'Input must reference error id',
      );
    });

    it('should render Textarea with native attributes', () => {
      const html = renderToString(
        <Textarea rows={4} placeholder="Requirement description..." invalid />,
      );
      assert.ok(html.includes('form-textarea'), 'Must include form-textarea class');
      assert.ok(html.includes('aria-invalid="true"'), 'Must apply aria-invalid');
    });

    it('should render Select dropdown with options', () => {
      const html = renderToString(
        <Select sizeVariant="md">
          <option value="p1">Priority 1</option>
          <option value="p2">Priority 2</option>
        </Select>,
      );
      assert.ok(html.includes('form-select'), 'Must include form-select class');
      assert.ok(html.includes('Priority 1'), 'Must render options');
    });

    it('should render Checkbox with native input and accessible label', () => {
      const html = renderToString(<Checkbox label="Enable Autonomous Healing" defaultChecked />);
      assert.ok(html.includes('type="checkbox"'), 'Must render real checkbox input');
      assert.ok(
        html.includes('checked=""') || html.includes('checked'),
        'Must handle checked property',
      );
      assert.ok(html.includes('Enable Autonomous Healing'), 'Must render label text');
    });
  });

  describe('Card Component', () => {
    it('should render composable card hierarchy', () => {
      const html = renderToString(
        <Card variant="default">
          <CardHeader>
            <CardTitle level={3}>Test Suite Summary</CardTitle>
            <CardDescription>Automated regression overview</CardDescription>
          </CardHeader>
          <CardContent>
            <p>12 test cases executed.</p>
          </CardContent>
          <CardFooter>
            <Button size="sm">View Details</Button>
          </CardFooter>
        </Card>,
      );
      assert.ok(html.includes('card card-default'), 'Must include card class');
      assert.ok(html.includes('card-title'), 'Must include card title');
      assert.ok(html.includes('card-description'), 'Must include card description');
      assert.ok(html.includes('card-content'), 'Must include card content');
      assert.ok(html.includes('card-footer'), 'Must include card footer');
    });
  });

  describe('Badge & Status Indicators', () => {
    it('should render semantic badge variants with optional dot', () => {
      const successHtml = renderToString(
        <Badge variant="success" dot>
          PASSED
        </Badge>,
      );
      assert.ok(successHtml.includes('badge badge-success'), 'Must include success badge classes');
      assert.ok(successHtml.includes('badge-dot'), 'Must render dot indicator');
      assert.ok(successHtml.includes('PASSED'), 'Must render text');

      const dangerHtml = renderToString(<Badge variant="danger">FAILED</Badge>);
      assert.ok(dangerHtml.includes('badge badge-danger'), 'Must include danger badge classes');
      assert.ok(!dangerHtml.includes('badge-dot'), 'Must not render dot when disabled');
    });
  });

  describe('Alert Component', () => {
    it('should render alert with semantic role', () => {
      const html = renderToString(
        <Alert variant="danger" title="Execution Terminated">
          Browser crashed due to out-of-memory exception.
        </Alert>,
      );
      assert.ok(html.includes('alert alert-danger'), 'Must include alert classes');
      assert.ok(html.includes('role="alert"'), 'Must have alert role for danger/warning');
      assert.ok(html.includes('Execution Terminated'), 'Must render title');
      assert.ok(
        html.includes('Browser crashed due to out-of-memory exception.'),
        'Must render body',
      );
    });
  });

  describe('EmptyState Component', () => {
    it('should render empty state with title, description, and optional action', () => {
      const html = renderToString(
        <EmptyState
          screenId="test-runs"
          title="No Test Runs Recorded"
          description="Autonomous web test execution history will appear here."
          action={<Button variant="primary">Launch Run</Button>}
        />,
      );
      assert.ok(html.includes('empty-state'), 'Must include .empty-state class');
      assert.ok(html.includes('data-screen="test-runs"'), 'Must attach data-screen attribute');
      assert.ok(html.includes('No Test Runs Recorded'), 'Must render title');
      assert.ok(
        html.includes('Autonomous web test execution history will appear here.'),
        'Must render description',
      );
      assert.ok(html.includes('Launch Run'), 'Must render action button');
    });
  });

  describe('Table Primitives', () => {
    it('should render semantic HTML table elements', () => {
      const html = renderToString(
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Identifier</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>TC-001</TableCell>
              <TableCell>
                <Badge variant="success">PASS</Badge>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>,
      );
      assert.ok(html.includes('<table class="table'), 'Must render real table tag');
      assert.ok(html.includes('<thead class="table-header'), 'Must render real thead tag');
      assert.ok(
        html.includes('<th class="table-head" scope="col"'),
        'Must render th with scope="col"',
      );
      assert.ok(html.includes('<tbody class="table-body'), 'Must render real tbody tag');
      assert.ok(html.includes('<td class="table-cell"'), 'Must render real td tag');
    });
  });

  describe('Dialog Component', () => {
    it('should render dialog when open is true', () => {
      const html = renderToString(
        <Dialog
          open={true}
          onClose={() => {}}
          title="Confirm Deletion"
          description="This action cannot be undone."
          footer={<Button variant="danger">Delete</Button>}
        >
          Are you sure you want to delete this test artifact?
        </Dialog>,
      );
      assert.ok(html.includes('role="dialog"'), 'Must have role="dialog"');
      assert.ok(html.includes('aria-modal="true"'), 'Must have aria-modal="true"');
      assert.ok(html.includes('aria-labelledby="dialog-title"'), 'Must have aria-labelledby');
      assert.ok(html.includes('Confirm Deletion'), 'Must render dialog title');
      assert.ok(html.includes('Delete'), 'Must render footer action');
    });

    it('should render null when open is false', () => {
      const html = renderToString(
        <Dialog open={false} onClose={() => {}} title="Hidden Dialog">
          Content
        </Dialog>,
      );
      assert.strictEqual(html, '', 'Must render empty string when closed');
    });
  });

  describe('Tabs Component', () => {
    it('should render accessible ARIA tabs structure with active panel', () => {
      const html = renderToString(
        <Tabs defaultValue="overview">
          <TabList aria-label="Project Details">
            <Tab value="overview">Overview</Tab>
            <Tab value="runs">Test Runs</Tab>
          </TabList>
          <TabPanel value="overview">
            <p>Overview Content Panel</p>
          </TabPanel>
          <TabPanel value="runs">
            <p>Runs Content Panel</p>
          </TabPanel>
        </Tabs>,
      );
      assert.ok(html.includes('role="tablist"'), 'Must render role="tablist"');
      assert.ok(html.includes('role="tab"'), 'Must render role="tab"');
      assert.ok(html.includes('aria-selected="true"'), 'Active tab must have aria-selected="true"');
      assert.ok(
        html.includes('aria-selected="false"'),
        'Inactive tab must have aria-selected="false"',
      );
      assert.ok(html.includes('role="tabpanel"'), 'Must render role="tabpanel"');
      assert.ok(html.includes('Overview Content Panel'), 'Must render active panel content');
      assert.ok(!html.includes('Runs Content Panel'), 'Must not render inactive panel content');
    });
  });

  describe('Separator, Spinner, and Skeleton', () => {
    it('should render Separator with proper orientation', () => {
      const horiz = renderToString(<Separator orientation="horizontal" />);
      assert.ok(horiz.includes('separator-horizontal'), 'Must include horizontal separator class');

      const vert = renderToString(<Separator orientation="vertical" />);
      assert.ok(vert.includes('separator-vertical'), 'Must include vertical separator class');
    });

    it('should render Spinner with accessible status role', () => {
      const html = renderToString(<Spinner size="md" label="Loading test data..." />);
      assert.ok(html.includes('spinner spinner-md'), 'Must include spinner classes');
      assert.ok(html.includes('role="status"'), 'Must have role="status"');
      assert.ok(html.includes('aria-label="Loading test data..."'), 'Must have accessible label');
    });

    it('should render Skeleton placeholder with aria-hidden', () => {
      const html = renderToString(<Skeleton width={200} height={24} />);
      assert.ok(html.includes('skeleton'), 'Must include skeleton class');
      assert.ok(html.includes('aria-hidden="true"'), 'Must have aria-hidden="true"');
      assert.ok(
        html.includes('width:200px') || html.includes('width: 200px'),
        'Must apply width style',
      );
    });
  });
});
