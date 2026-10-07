/**
 * @file packages/core/src/execution/actions/action-handler-registry.ts
 * Central registry mapping ExecutableActionType to concrete ActionHandlers.
 */

import type { ExecutableActionType } from '@ai-quality/contracts';
import type { IActionHandler } from './action-types.js';
import { ActionExecutionUnsupportedError } from './action-errors.js';
import { NavigateActionHandler } from './action-handlers/navigate-action-handler.js';
import {
  ClickActionHandler,
  DoubleClickActionHandler,
} from './action-handlers/click-action-handler.js';
import {
  FillActionHandler,
  TypeActionHandler,
  ClearActionHandler,
} from './action-handlers/fill-action-handler.js';
import { PressKeyActionHandler } from './action-handlers/press-key-action-handler.js';
import {
  SelectOptionActionHandler,
  SelectOptionAliasActionHandler,
} from './action-handlers/select-option-action-handler.js';
import {
  CheckActionHandler,
  UncheckActionHandler,
} from './action-handlers/check-action-handler.js';
import { HoverActionHandler } from './action-handlers/hover-action-handler.js';
import {
  FocusActionHandler,
  BlurActionHandler,
} from './action-handlers/focus-blur-action-handler.js';
import { ScrollActionHandler } from './action-handlers/scroll-action-handler.js';
import { ScrollIntoViewActionHandler } from './action-handlers/scroll-into-view-action-handler.js';
import {
  WaitForStateActionHandler,
  WaitForElementActionHandler,
  WaitForUrlActionHandler,
  WaitForLoadStateActionHandler,
} from './action-handlers/wait-action-handler.js';
import {
  UploadActionHandler,
  UploadFileAliasActionHandler,
} from './action-handlers/upload-action-handler.js';
import { DragAndDropActionHandler } from './action-handlers/drag-and-drop-action-handler.js';
import {
  GoBackActionHandler,
  GoForwardActionHandler,
  ReloadActionHandler,
} from './action-handlers/history-action-handler.js';
import { LocatorResolver } from './locator-resolver.js';
import { SecretRedactor } from '../sessions/secret-redactor.js';

export class ActionHandlerRegistry {
  private readonly handlers: Map<string, IActionHandler> = new Map();

  constructor(locatorResolver?: LocatorResolver, secretRedactor?: SecretRedactor) {
    const resolver = locatorResolver ?? new LocatorResolver();
    const redactor = secretRedactor ?? new SecretRedactor();

    // Register built-in handlers
    this.register(new NavigateActionHandler(resolver, redactor));
    this.register(new ClickActionHandler());
    this.register(new DoubleClickActionHandler());
    this.register(new FillActionHandler());
    this.register(new TypeActionHandler());
    this.register(new ClearActionHandler());
    this.register(new PressKeyActionHandler(resolver, redactor));
    this.register(new SelectOptionActionHandler(resolver, redactor));
    this.register(new SelectOptionAliasActionHandler(resolver, redactor));
    this.register(new CheckActionHandler());
    this.register(new UncheckActionHandler());
    this.register(new HoverActionHandler(resolver, redactor));
    this.register(new FocusActionHandler());
    this.register(new BlurActionHandler());
    this.register(new ScrollActionHandler(resolver, redactor));
    this.register(new ScrollIntoViewActionHandler(resolver, redactor));
    this.register(new WaitForStateActionHandler(resolver, redactor));
    this.register(new WaitForElementActionHandler(resolver, redactor));
    this.register(new WaitForUrlActionHandler(resolver, redactor));
    this.register(new WaitForLoadStateActionHandler(resolver, redactor));
    this.register(new UploadActionHandler(resolver, redactor));
    this.register(new UploadFileAliasActionHandler(resolver, redactor));
    this.register(new DragAndDropActionHandler(resolver, redactor));
    this.register(new GoBackActionHandler(resolver, redactor));
    this.register(new GoForwardActionHandler(resolver, redactor));
    this.register(new ReloadActionHandler(resolver, redactor));
  }

  public register(handler: IActionHandler): void {
    this.handlers.set(handler.actionType, handler);
  }

  public getHandler(actionType: string): IActionHandler {
    const handler = this.handlers.get(actionType);
    if (!handler) {
      throw new ActionExecutionUnsupportedError(actionType);
    }
    return handler;
  }

  public hasHandler(actionType: string): boolean {
    return this.handlers.has(actionType);
  }

  public getSupportedActionTypes(): readonly ExecutableActionType[] {
    return Array.from(this.handlers.keys()) as ExecutableActionType[];
  }
}
