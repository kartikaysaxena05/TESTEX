/**
 * @file packages/core/src/logging/logger.ts
 * Structured, secure local logger implementation with automated redaction.
 */

import type { ILogger, LogLevel, LoggerOptions, StructuredLogRecord } from './logger-types.js';
import { redactValue } from './redaction.js';
import { serializeError } from './error-serializer.js';
import { RotatingLogStream } from './file-stream.js';

const LEVEL_SEVERITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

export class AppLogger implements ILogger {
  private level: LogLevel;
  private isDevelopment: boolean;
  private stream: RotatingLogStream | null = null;

  constructor(options: LoggerOptions = {}) {
    const envLevel = process.env['AI_QUALITY_LOG_LEVEL'] as LogLevel | undefined;
    this.level =
      envLevel && LEVEL_SEVERITY[envLevel] !== undefined
        ? envLevel
        : options.level || (options.isDevelopment ? 'debug' : 'info');

    this.isDevelopment = options.isDevelopment ?? process.env['NODE_ENV'] !== 'production';

    if (options.logDir) {
      this.stream = new RotatingLogStream({
        logDir: options.logDir,
        logFileName: options.logFileName,
        maxFileSizeBytes: options.maxFileSizeBytes,
        maxRetainedFiles: options.maxRetainedFiles,
      });
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_SEVERITY[level] >= LEVEL_SEVERITY[this.level];
  }

  private writeRecord(
    level: LogLevel,
    event: string,
    error?: unknown,
    context?: Record<string, unknown>,
  ): void {
    if (!this.shouldLog(level)) return;

    const timestamp = new Date().toISOString();
    const redactedContext = context ? (redactValue(context) as Record<string, unknown>) : undefined;

    const serializedError = error !== undefined ? serializeError(error) : undefined;

    const record: StructuredLogRecord = {
      timestamp,
      level,
      event,
      ...(redactedContext || {}),
      ...(serializedError ? { error: serializedError } : {}),
    };

    const jsonLine = JSON.stringify(record);

    // 1. Write to rotating local file
    if (this.stream) {
      this.stream.writeLine(jsonLine);
    }

    // 2. In development or test console, write formatted line to stderr / stdout
    if (this.isDevelopment && !process.env['AI_QUALITY_SUPPRESS_CONSOLE_LOG']) {
      const errStr = record.error ? ` | ${record.error.name}: ${record.error.message}` : '';
      const ctxStr = redactedContext ? ` ${JSON.stringify(redactedContext)}` : '';
      const formatted = `[${timestamp}] [${level.toUpperCase()}] [${event}]${ctxStr}${errStr}`;

      if (level === 'error' || level === 'fatal') {
        console.error(formatted);
      } else if (level === 'warn') {
        console.warn(formatted);
      } else {
        console.log(formatted);
      }
    }
  }

  public debug(event: string, context?: Record<string, unknown>): void {
    this.writeRecord('debug', event, undefined, context);
  }

  public info(event: string, context?: Record<string, unknown>): void {
    this.writeRecord('info', event, undefined, context);
  }

  public warn(event: string, context?: Record<string, unknown>): void {
    this.writeRecord('warn', event, undefined, context);
  }

  public error(event: string, error?: unknown, context?: Record<string, unknown>): void {
    this.writeRecord('error', event, error, context);
  }

  public fatal(event: string, error?: unknown, context?: Record<string, unknown>): void {
    this.writeRecord('fatal', event, error, context);
  }

  public async flush(): Promise<void> {
    if (this.stream) {
      await this.stream.flush();
    }
  }

  public async close(): Promise<void> {
    if (this.stream) {
      await this.stream.close();
    }
  }
}

// ------------------------------------------------------------------------------
// Singleton Logger Management
// ------------------------------------------------------------------------------

let defaultLogger: ILogger | null = null;

export function initLogger(options: LoggerOptions): ILogger {
  defaultLogger = new AppLogger(options);
  return defaultLogger;
}

export function getLogger(): ILogger {
  if (!defaultLogger) {
    defaultLogger = new AppLogger({ isDevelopment: true });
  }
  return defaultLogger;
}

export function setLoggerForTest(logger: ILogger | null): void {
  defaultLogger = logger;
}

export async function flushLogger(): Promise<void> {
  if (defaultLogger) {
    await defaultLogger.flush();
  }
}

export async function closeLogger(): Promise<void> {
  if (defaultLogger) {
    await defaultLogger.close();
  }
}
