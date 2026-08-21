/**
 * @file packages/core/src/logging/file-stream.ts
 * Bounded rotating local file stream for structured JSON logs.
 */

import fs from 'node:fs';
import path from 'node:path';

export interface RotatingLogStreamOptions {
  readonly logDir: string;
  readonly logFileName?: string;
  readonly maxFileSizeBytes?: number;
  readonly maxRetainedFiles?: number;
}

export class RotatingLogStream {
  private readonly logDir: string;
  private readonly logFileName: string;
  private readonly maxFileSizeBytes: number;
  private readonly maxRetainedFiles: number;
  private currentFilePath: string;
  private currentSizeBytes = 0;
  private isInitialized = false;

  constructor(options: RotatingLogStreamOptions) {
    this.logDir = options.logDir;
    this.logFileName = options.logFileName || 'ai-quality-platform.log';
    this.maxFileSizeBytes = options.maxFileSizeBytes || 5 * 1024 * 1024; // 5 MB
    this.maxRetainedFiles = options.maxRetainedFiles || 5;
    this.currentFilePath = path.join(this.logDir, this.logFileName);
  }

  /**
   * Initializes log directory and calculates initial file size.
   */
  public init(): void {
    if (this.isInitialized) return;
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
      if (fs.existsSync(this.currentFilePath)) {
        const stats = fs.statSync(this.currentFilePath);
        this.currentSizeBytes = stats.size;
      } else {
        this.currentSizeBytes = 0;
      }
      this.isInitialized = true;
    } catch (err) {
      console.error('[Logger Stream] Failed to initialize log directory:', err);
    }
  }

  /**
   * Rotates log files when size exceeds threshold.
   */
  private rotate(): void {
    try {
      // 1. Remove oldest retained file if it exists
      const oldestFile = path.join(this.logDir, `${this.logFileName}.${this.maxRetainedFiles}`);
      if (fs.existsSync(oldestFile)) {
        fs.unlinkSync(oldestFile);
      }

      // 2. Shift older rotated files (N-1 -> N)
      for (let i = this.maxRetainedFiles - 1; i >= 1; i--) {
        const sourceFile = path.join(this.logDir, `${this.logFileName}.${i}`);
        const targetFile = path.join(this.logDir, `${this.logFileName}.${i + 1}`);
        if (fs.existsSync(sourceFile)) {
          fs.renameSync(sourceFile, targetFile);
        }
      }

      // 3. Rename current active log file to .1
      const firstRotated = path.join(this.logDir, `${this.logFileName}.1`);
      if (fs.existsSync(this.currentFilePath)) {
        fs.renameSync(this.currentFilePath, firstRotated);
      }

      this.currentSizeBytes = 0;
    } catch (err) {
      console.error('[Logger Stream] Log rotation failed:', err);
    }
  }

  /**
   * Appends a JSON line to the log file, triggering rotation if needed.
   */
  public writeLine(line: string): void {
    this.init();

    const dataBuffer = Buffer.from(line + '\n', 'utf-8');
    if (this.currentSizeBytes + dataBuffer.length > this.maxFileSizeBytes) {
      this.rotate();
    }

    try {
      fs.appendFileSync(this.currentFilePath, dataBuffer);
      this.currentSizeBytes += dataBuffer.length;
    } catch (err) {
      console.error('[Logger Stream] Failed to write log line:', err);
    }
  }

  public async flush(): Promise<void> {
    // Synchronous fs.appendFileSync flushes automatically to OS buffer
    return Promise.resolve();
  }

  public async close(): Promise<void> {
    return Promise.resolve();
  }

  public getLogFilePath(): string {
    return this.currentFilePath;
  }
}
