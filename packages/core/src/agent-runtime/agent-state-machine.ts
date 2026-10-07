/**
 * @file packages/core/src/agent-runtime/agent-state-machine.ts
 * Deterministic finite state machine for V10 Phase 141 Agent Runtime.
 * Validates state transitions:
 * IDLE -> THINKING -> TOOL_CALLING -> WAITING_FOR_TOOL -> THINKING -> COMPLETED
 * Terminal/failure states: CANCELLED, FAILED, TIMEOUT
 */

import type { AgentRuntimeState } from '@ai-quality/contracts';
import { AgentInvalidStateTransitionError } from './agent-runtime-errors.js';

export interface StateTransitionEvent {
  from: AgentRuntimeState;
  to: AgentRuntimeState;
  timestamp: string;
  reason?: string;
}

export class AgentStateMachine {
  private _state: AgentRuntimeState;
  private readonly _history: StateTransitionEvent[] = [];

  // Allowed transitions map
  private static readonly ALLOWED_TRANSITIONS: Record<AgentRuntimeState, readonly AgentRuntimeState[]> = {
    IDLE: ['THINKING', 'CANCELLED', 'FAILED', 'TIMEOUT'],
    THINKING: ['TOOL_CALLING', 'COMPLETED', 'CANCELLED', 'FAILED', 'TIMEOUT'],
    TOOL_CALLING: ['WAITING_FOR_TOOL', 'CANCELLED', 'FAILED', 'TIMEOUT'],
    WAITING_FOR_TOOL: ['THINKING', 'CANCELLED', 'FAILED', 'TIMEOUT'],
    COMPLETED: [],
    CANCELLED: [],
    FAILED: [],
    TIMEOUT: [],
  };

  constructor(initialState: AgentRuntimeState = 'IDLE') {
    this._state = initialState;
  }

  public get currentState(): AgentRuntimeState {
    return this._state;
  }

  public get history(): readonly StateTransitionEvent[] {
    return [...this._history];
  }

  public isTerminal(): boolean {
    return (
      this._state === 'COMPLETED' ||
      this._state === 'CANCELLED' ||
      this._state === 'FAILED' ||
      this._state === 'TIMEOUT'
    );
  }

  public canTransitionTo(targetState: AgentRuntimeState): boolean {
    const allowed = AgentStateMachine.ALLOWED_TRANSITIONS[this._state];
    return allowed ? allowed.includes(targetState) : false;
  }

  public transition(targetState: AgentRuntimeState, reason?: string): StateTransitionEvent {
    if (this._state === targetState) {
      return {
        from: this._state,
        to: targetState,
        timestamp: new Date().toISOString(),
        reason: 'no-op same state',
      };
    }

    if (!this.canTransitionTo(targetState)) {
      throw new AgentInvalidStateTransitionError(this._state, targetState, reason);
    }

    const event: StateTransitionEvent = {
      from: this._state,
      to: targetState,
      timestamp: new Date().toISOString(),
      reason,
    };

    this._state = targetState;
    this._history.push(event);
    return event;
  }
}
