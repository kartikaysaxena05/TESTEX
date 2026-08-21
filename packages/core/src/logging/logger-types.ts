/**
 * @file packages/core/src/logging/logger-types.ts
 * Type definitions and contracts for the structured logging subsystem.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface SerializedError {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
  readonly code?: string;
}

export interface StructuredLogRecord {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly event: string;
  readonly message?: string;
  readonly requestId?: string;
  readonly durationMs?: number;
  readonly error?: SerializedError;
  readonly [key: string]: unknown;
}

export interface LoggerOptions {
  readonly logDir?: string;
  readonly logFileName?: string;
  readonly level?: LogLevel;
  readonly isDevelopment?: boolean;
  readonly maxFileSizeBytes?: number;
  readonly maxRetainedFiles?: number;
}

export interface ILogger {
  readonly debug: (event: string, context?: Record<string, unknown>) => void;
  readonly info: (event: string, context?: Record<string, unknown>) => void;
  readonly warn: (event: string, context?: Record<string, unknown>) => void;
  readonly error: (event: string, error?: unknown, context?: Record<string, unknown>) => void;
  readonly fatal: (event: string, error?: unknown, context?: Record<string, unknown>) => void;
  readonly flush: () => Promise<void>;
  readonly close: () => Promise<void>;
}
