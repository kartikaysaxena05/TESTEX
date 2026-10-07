/**
 * @file packages/core/src/execution/compiler/step-action-parser.ts
 * Deterministic structured step parser translating natural language test steps into strongly typed ExecutablePlanStepDto.
 */

import crypto from 'node:crypto';
import type {
  ExecutablePlanStepDto,
  ExecutableActionType,
  ExecutableTargetDescriptorDto,
  ExecutableValueReferenceDto,
  CompilationDiagnosticDto,
  TestCaseStepDto,
  TestCaseTestDataItemDto,
} from '@ai-quality/contracts';
import {
  PROHIBITED_CODE_PATTERNS,
  UNSAFE_URL_PROTOCOLS,
  FORBIDDEN_FILE_PATH_PATTERNS,
  COMPILER_BOUNDS,
  type CompilationContext,
} from './compiler-types.js';

export interface StepParseResult {
  readonly step: ExecutablePlanStepDto;
  readonly diagnostics: readonly CompilationDiagnosticDto[];
}

export class StepActionParser {
  /**
   * Parses a single test case step into a strongly typed ExecutablePlanStepDto with diagnostics.
   */
  public parseStep(
    stepDto: TestCaseStepDto,
    context: CompilationContext,
    testDataItems?: readonly TestCaseTestDataItemDto[],
  ): StepParseResult {
    const diagnostics: CompilationDiagnosticDto[] = [];
    const stepSequence = stepDto.stepNumber;
    const rawAction = (stepDto.action || '').trim();

    // 1. Check for prohibited script / shell execution patterns
    for (const pattern of PROHIBITED_CODE_PATTERNS) {
      if (pattern.test(rawAction)) {
        diagnostics.push({
          code: 'PROHIBITED_ACTION',
          severity: 'ERROR',
          message: `Step ${stepSequence} contains prohibited code execution instruction.`,
          reason: `Pattern '${pattern.source}' matched in action text: '${rawAction.slice(0, 100)}'`,
          stepSequence,
          suggestedAction: 'Remove arbitrary code/script execution from test case steps.',
        });

        return {
          step: {
            id: crypto.randomUUID(),
            sequence: stepSequence,
            action: 'CLICK', // Fallback placeholder
            description: rawAction.slice(0, COMPILER_BOUNDS.MAX_TARGET_HINT_LENGTH),
            isOptional: stepDto.isOptional ?? false,
            assertions: [],
          },
          diagnostics,
        };
      }
    }

    if (!rawAction) {
      diagnostics.push({
        code: 'UNSUPPORTED_ACTION',
        severity: 'ERROR',
        message: `Step ${stepSequence} action description is empty.`,
        reason: 'Step action text cannot be empty.',
        stepSequence,
        suggestedAction: 'Specify an action such as Navigate, Click, Fill, or Select.',
      });

      return {
        step: {
          id: crypto.randomUUID(),
          sequence: stepSequence,
          action: 'CLICK',
          description: 'Empty action',
          isOptional: stepDto.isOptional ?? false,
          assertions: [],
        },
        diagnostics,
      };
    }

    // 2. Identify Action Type & Target & Value
    const lower = rawAction.toLowerCase();
    let actionType: ExecutableActionType = 'CLICK';
    let target: ExecutableTargetDescriptorDto | undefined;
    let value: ExecutableValueReferenceDto | undefined;

    // Pattern Matching Architecture
    if (this.isNavigateAction(lower)) {
      actionType = 'NAVIGATE';
      const parsedNav = this.parseNavigate(rawAction, context);
      target = parsedNav.target;
      diagnostics.push(...parsedNav.diagnostics.map(d => ({ ...d, stepSequence })));
    } else if (this.isFillAction(lower)) {
      actionType = 'FILL';
      const parsedFill = this.parseFill(stepDto, rawAction, context, testDataItems);
      target = parsedFill.target;
      value = parsedFill.value;
      diagnostics.push(...parsedFill.diagnostics.map(d => ({ ...d, stepSequence })));
    } else if (this.isClearAction(lower)) {
      actionType = 'CLEAR';
      target = this.extractFieldTarget(rawAction, 'clear');
    } else if (this.isSelectAction(lower)) {
      actionType = 'SELECT';
      const parsedSelect = this.parseSelect(rawAction, stepDto.testDataSummary);
      target = parsedSelect.target;
      value = parsedSelect.value;
      diagnostics.push(...parsedSelect.diagnostics.map(d => ({ ...d, stepSequence })));
    } else if (this.isCheckAction(lower)) {
      actionType = 'CHECK';
      target = this.extractCheckboxTarget(rawAction, 'check');
    } else if (this.isUncheckAction(lower)) {
      actionType = 'UNCHECK';
      target = this.extractCheckboxTarget(rawAction, 'uncheck');
    } else if (this.isPressAction(lower)) {
      actionType = 'PRESS';
      const parsedPress = this.parsePress(rawAction);
      target = parsedPress.target;
      value = parsedPress.value;
    } else if (this.isHoverAction(lower)) {
      actionType = 'HOVER';
      target = this.extractGenericTarget(rawAction, ['hover over', 'hover', 'mouse over']);
    } else if (this.isScrollAction(lower)) {
      actionType = 'SCROLL';
      target = this.extractGenericTarget(rawAction, [
        'scroll to',
        'scroll down to',
        'scroll up to',
        'scroll',
      ]);
    } else if (this.isUploadAction(lower)) {
      actionType = 'UPLOAD';
      const parsedUpload = this.parseUpload(rawAction, stepDto.testDataSummary);
      target = parsedUpload.target;
      value = parsedUpload.value;
      diagnostics.push(...parsedUpload.diagnostics.map(d => ({ ...d, stepSequence })));
    } else if (this.isWaitAction(lower)) {
      actionType = 'WAIT_FOR_STATE';
      target = this.extractGenericTarget(rawAction, [
        'wait for',
        'wait until',
        'await',
        'wait for visible',
      ]);
    } else if (this.isClickAction(lower)) {
      actionType = 'CLICK';
      target = this.extractButtonOrLinkTarget(rawAction);
    } else {
      // Ambiguous or generic action
      actionType = 'CLICK';
      target = this.extractFallbackTarget(rawAction);
      diagnostics.push({
        code: 'AMBIGUOUS_ACTION',
        severity: 'WARNING',
        message: `Step ${stepSequence} action could not be mapped unambiguously. Defaulting to CLICK.`,
        reason: `Action phrasing '${rawAction.slice(0, 80)}' does not match standard action verbs.`,
        stepSequence,
        suggestedAction:
          'Use standard test verbs: Navigate, Click, Enter, Fill, Select, Check, etc.',
      });
    }

    // 3. Post-parsing Validation Checks
    if (!target && actionType !== 'PRESS') {
      diagnostics.push({
        code: 'MISSING_TARGET',
        severity: 'ERROR',
        message: `Step ${stepSequence} (${actionType}) does not have a recognizable target element.`,
        reason: 'No UI element, button, field, or route could be extracted from action text.',
        stepSequence,
        suggestedAction: 'Specify the target control or element name.',
      });
    }

    if ((actionType === 'FILL' || actionType === 'SELECT') && !value) {
      diagnostics.push({
        code: 'MISSING_INPUT_VALUE',
        severity: 'ERROR',
        message: `Step ${stepSequence} (${actionType}) requires an input value, but none was provided.`,
        reason: 'Missing test value, variable, or literal in action or testDataSummary.',
        stepSequence,
        suggestedAction: 'Specify the text value to enter or option to select.',
      });
    }

    return {
      step: {
        id: crypto.randomUUID(),
        sequence: stepSequence,
        action: actionType,
        target,
        value,
        description: rawAction.slice(0, COMPILER_BOUNDS.MAX_TARGET_HINT_LENGTH),
        isOptional: stepDto.isOptional ?? false,
        timeoutMs: COMPILER_BOUNDS.DEFAULT_STEP_TIMEOUT_MS,
        assertions: [],
      },
      diagnostics,
    };
  }

  // ----------------------------------------------------------------------------
  // Action Recognition Helpers
  // ----------------------------------------------------------------------------

  private isNavigateAction(text: string): boolean {
    return (
      text.startsWith('navigate') ||
      text.startsWith('open ') ||
      text.startsWith('go to') ||
      text.startsWith('visit ') ||
      text.startsWith('load ') ||
      text.includes('open the ') ||
      text.includes('navigate to')
    );
  }

  private isFillAction(text: string): boolean {
    return (
      text.startsWith('enter ') ||
      text.startsWith('fill ') ||
      text.startsWith('type ') ||
      text.startsWith('input ') ||
      text.startsWith('provide ') ||
      text.includes('fill in ') ||
      text.includes('enter the ') ||
      text.includes('type into ')
    );
  }

  private isClearAction(text: string): boolean {
    return text.startsWith('clear ') || text.startsWith('erase ') || text.startsWith('empty ');
  }

  private isSelectAction(text: string): boolean {
    return (
      text.startsWith('select ') ||
      text.startsWith('choose ') ||
      text.startsWith('pick ') ||
      text.includes('select option')
    );
  }

  private isCheckAction(text: string): boolean {
    return (
      text.startsWith('check ') ||
      text.startsWith('tick ') ||
      text.startsWith('toggle on') ||
      text.includes('check the ')
    );
  }

  private isUncheckAction(text: string): boolean {
    return (
      text.startsWith('uncheck ') ||
      text.startsWith('untick ') ||
      text.startsWith('toggle off') ||
      text.includes('uncheck the ')
    );
  }

  private isPressAction(text: string): boolean {
    return (
      text.startsWith('press key') ||
      text.startsWith('press enter') ||
      text.startsWith('press tab') ||
      text.startsWith('press escape') ||
      text.startsWith('hit ')
    );
  }

  private isHoverAction(text: string): boolean {
    return text.startsWith('hover') || text.includes('mouse over') || text.includes('hover over');
  }

  private isScrollAction(text: string): boolean {
    return (
      text.startsWith('scroll') || text.includes('scroll to') || text.includes('scroll down to')
    );
  }

  private isUploadAction(text: string): boolean {
    return (
      text.startsWith('upload') ||
      text.startsWith('attach ') ||
      text.includes('upload file') ||
      text.includes('attach file')
    );
  }

  private isWaitAction(text: string): boolean {
    return (
      text.startsWith('wait for') ||
      text.startsWith('wait until') ||
      text.startsWith('await ') ||
      text.includes('wait for ')
    );
  }

  private isClickAction(text: string): boolean {
    return (
      text.startsWith('click') ||
      text.startsWith('press button') ||
      text.startsWith('press ') ||
      text.startsWith('tap ') ||
      text.startsWith('submit') ||
      text.includes('click on') ||
      text.includes('click the')
    );
  }

  // ----------------------------------------------------------------------------
  // Specific Action Parsers
  // ----------------------------------------------------------------------------

  private parseNavigate(
    rawAction: string,
    _context: CompilationContext,
  ): { target: ExecutableTargetDescriptorDto; diagnostics: CompilationDiagnosticDto[] } {
    const diagnostics: CompilationDiagnosticDto[] = [];
    let route = '/';

    // Extract path/URL
    const match = rawAction.match(
      /(?:navigate to|open|go to|visit|load)\s+(?:the\s+)?(?:page\s+)?['"`]?([^'"`\s]+)['"`]?/i,
    );
    if (match && match[1]) {
      route = match[1].trim();
    } else {
      // If phrasing like "Open the login page"
      const pageMatch = rawAction.match(/open\s+(?:the\s+)?([a-z0-9_-]+)\s+page/i);
      if (pageMatch && pageMatch[1]) {
        const pageName = pageMatch[1].toLowerCase();
        route = `/${pageName}`;
      }
    }

    // Check unsafe protocols
    for (const proto of UNSAFE_URL_PROTOCOLS) {
      if (route.toLowerCase().startsWith(proto)) {
        diagnostics.push({
          code: 'UNSAFE_URL',
          severity: 'ERROR',
          message: `Unsafe navigation URL scheme: '${route}'.`,
          reason: `Protocol '${proto}' is strictly prohibited in test execution.`,
          suggestedAction: 'Use relative application routes like /login or /dashboard.',
        });
      }
    }

    // Normalize relative routes
    if (!route.startsWith('http://') && !route.startsWith('https://') && !route.startsWith('/')) {
      route = `/${route}`;
    }

    return {
      target: {
        kind: 'ROUTE',
        route,
        semanticHint: route,
      },
      diagnostics,
    };
  }

  private parseFill(
    stepDto: TestCaseStepDto,
    rawAction: string,
    _context: CompilationContext,
    testDataItems?: readonly TestCaseTestDataItemDto[],
  ): {
    target?: ExecutableTargetDescriptorDto;
    value?: ExecutableValueReferenceDto;
    diagnostics: CompilationDiagnosticDto[];
  } {
    const diagnostics: CompilationDiagnosticDto[] = [];

    // Target extraction
    let fieldName = '';
    const fieldMatch =
      rawAction.match(/(?:enter|fill|type|input|provide)\s+(?:the\s+)?['"`]?([^'"`\s]+)['"`]?/i) ||
      rawAction.match(/(?:into|in)\s+(?:the\s+)?['"`]?([^'"`]+)['"`]?\s+field/i) ||
      rawAction.match(/(?:enter|fill|type)\s+(?:user's\s+)?([a-z0-9_\s-]+)/i);

    if (fieldMatch && fieldMatch[1]) {
      fieldName = fieldMatch[1]
        .replace(/^(the|user's|a|an)\s+/i, '')
        .replace(/\s+(field|input|box)$/i, '')
        .trim();
    }

    const isPassword =
      fieldName.toLowerCase().includes('password') ||
      rawAction.toLowerCase().includes('password') ||
      stepDto.action.toLowerCase().includes('password');

    const target: ExecutableTargetDescriptorDto = {
      kind: 'FIELD',
      role: 'textbox',
      name: fieldName || 'input',
      label: fieldName || undefined,
      placeholder: fieldName || undefined,
      semanticHint: fieldName || 'field',
    };

    // Value extraction
    let value: ExecutableValueReferenceDto | undefined;
    const testDataSummary = (stepDto.testDataSummary || '').trim();

    // Check if matching test data item exists
    const matchingItem = testDataItems?.find(
      item =>
        item.name.toLowerCase() === fieldName.toLowerCase() ||
        item.name.toLowerCase().includes(fieldName.toLowerCase()),
    );

    if (isPassword) {
      value = {
        kind: 'SECRET_REFERENCE',
        secretRef: 'auth.primary.password',
        keyName: 'password',
      };
    } else if (matchingItem?.isSensitive) {
      value = {
        kind: 'SECRET_REFERENCE',
        secretRef: `secret.${matchingItem.name}`,
        keyName: matchingItem.name,
      };
    } else if (testDataSummary) {
      // Check variable pattern {{var}} or var
      const varMatch = testDataSummary.match(/^\{\{([^}]+)\}\}$/);
      if (varMatch && varMatch[1]) {
        value = {
          kind: 'VARIABLE',
          variableName: varMatch[1].trim(),
        };
      } else if (testDataSummary.startsWith('user.') || testDataSummary.startsWith('env.')) {
        value = {
          kind: 'VARIABLE',
          variableName: testDataSummary,
        };
      } else {
        value = {
          kind: 'LITERAL',
          value: testDataSummary,
        };
      }
    } else if (fieldName) {
      // Derive variable name from field
      const cleanVar = fieldName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      value = {
        kind: 'VARIABLE',
        variableName: cleanVar.includes('.') ? cleanVar : `user.${cleanVar}`,
      };
    }

    return {
      target,
      value,
      diagnostics,
    };
  }

  private parseSelect(
    rawAction: string,
    testDataSummary?: string | null,
  ): {
    target?: ExecutableTargetDescriptorDto;
    value?: ExecutableValueReferenceDto;
    diagnostics: CompilationDiagnosticDto[];
  } {
    const diagnostics: CompilationDiagnosticDto[] = [];

    // Phrasing: "Select 'United States' from Country dropdown" or "Select United States in country"
    let option = '';
    let dropdownName = '';

    const quoteMatch = rawAction.match(/select\s+['"`]([^'"`]+)['"`]\s+(?:from|in)\s+(.+)/i);
    if (quoteMatch && quoteMatch[1] && quoteMatch[2]) {
      option = quoteMatch[1].trim();
      dropdownName = quoteMatch[2].replace(/\s+(dropdown|select|menu)$/i, '').trim();
    } else {
      const match = rawAction.match(/select\s+([^\s]+)\s+(?:from|in)\s+(.+)/i);
      if (match && match[1] && match[2]) {
        option = match[1].trim();
        dropdownName = match[2].replace(/\s+(dropdown|select|menu)$/i, '').trim();
      } else {
        dropdownName = rawAction.replace(/^select\s+/i, '').trim();
      }
    }

    if (!option && testDataSummary) {
      option = testDataSummary.trim();
    }

    const target: ExecutableTargetDescriptorDto = {
      kind: 'CONTROL',
      role: 'combobox',
      name: dropdownName || 'dropdown',
      semanticHint: dropdownName || 'select',
    };

    const value: ExecutableValueReferenceDto | undefined = option
      ? { kind: 'LITERAL', value: option }
      : undefined;

    return { target, value, diagnostics };
  }

  private parsePress(rawAction: string): {
    target?: ExecutableTargetDescriptorDto;
    value: ExecutableValueReferenceDto;
  } {
    let key = 'Enter';
    const match = rawAction.match(/(?:press key|press|hit)\s+([a-z0-9_]+)/i);
    if (match && match[1]) {
      key = match[1].trim();
    }

    return {
      value: {
        kind: 'LITERAL',
        value: key,
      },
    };
  }

  private parseUpload(
    rawAction: string,
    testDataSummary?: string | null,
  ): {
    target?: ExecutableTargetDescriptorDto;
    value?: ExecutableValueReferenceDto;
    diagnostics: CompilationDiagnosticDto[];
  } {
    const diagnostics: CompilationDiagnosticDto[] = [];
    let fileName = (testDataSummary || '').trim();

    const match = rawAction.match(/(?:upload|attach)\s+(?:file\s+)?['"`]?([^'"`\s]+)['"`]?/i);
    if (match && match[1]) {
      fileName = match[1].trim();
    }

    // Check for forbidden file paths / directory traversal
    for (const pattern of FORBIDDEN_FILE_PATH_PATTERNS) {
      if (pattern.test(fileName)) {
        diagnostics.push({
          code: 'UNSAFE_PATH',
          severity: 'ERROR',
          message: `Unsafe file upload path: '${fileName}'.`,
          reason: `Upload path matches forbidden pattern '${pattern.source}'.`,
          suggestedAction: 'Use safe fixture file names without absolute paths or ../ traversal.',
        });
      }
    }

    const target: ExecutableTargetDescriptorDto = {
      kind: 'DOCUMENT_UPLOAD',
      role: 'button',
      semanticHint: 'upload',
    };

    const value: ExecutableValueReferenceDto = {
      kind: 'LITERAL',
      value: fileName || 'sample_fixture.txt',
    };

    return { target, value, diagnostics };
  }

  private extractButtonOrLinkTarget(rawAction: string): ExecutableTargetDescriptorDto {
    const name = rawAction
      .replace(/^click\s+(on\s+|the\s+)?/i, '')
      .replace(/^press\s+(button\s+|the\s+)?/i, '')
      .replace(/\s+(button|link|icon|tab)$/i, '')
      .trim();

    const isLink = rawAction.toLowerCase().includes('link');

    return {
      kind: 'CONTROL',
      role: isLink ? 'link' : 'button',
      name: name || 'Submit',
      semanticHint: name || 'button',
    };
  }

  private extractFieldTarget(rawAction: string, prefix: string): ExecutableTargetDescriptorDto {
    const name = rawAction
      .replace(new RegExp(`^${prefix}\\s+(the\\s+)?`, 'i'), '')
      .replace(/\s+(field|input|box)$/i, '')
      .trim();

    return {
      kind: 'FIELD',
      role: 'textbox',
      name: name || 'input',
      semanticHint: name || 'field',
    };
  }

  private extractCheckboxTarget(rawAction: string, prefix: string): ExecutableTargetDescriptorDto {
    const name = rawAction
      .replace(new RegExp(`^${prefix}\\s+(the\\s+)?`, 'i'), '')
      .replace(/\s+(checkbox|box|toggle)$/i, '')
      .trim();

    return {
      kind: 'CONTROL',
      role: 'checkbox',
      name: name || 'checkbox',
      semanticHint: name || 'checkbox',
    };
  }

  private extractGenericTarget(
    rawAction: string,
    prefixes: readonly string[],
  ): ExecutableTargetDescriptorDto {
    let hint = rawAction;
    for (const prefix of prefixes) {
      if (hint.toLowerCase().startsWith(prefix)) {
        hint = hint.slice(prefix.length).trim();
        break;
      }
    }
    hint = hint.replace(/^(the|a|an)\s+/i, '').trim();

    return {
      kind: 'ELEMENT',
      semanticHint: hint || 'target_element',
    };
  }

  private extractFallbackTarget(rawAction: string): ExecutableTargetDescriptorDto {
    return {
      kind: 'ELEMENT',
      semanticHint: rawAction.slice(0, 100),
    };
  }
}
