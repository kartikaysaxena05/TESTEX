/**
 * @file packages/core/src/email/sandbox-provider.ts
 * In-memory sandbox email provider for automated unit testing and failure injection.
 */

import crypto from 'node:crypto';
import type { IEmailProvider, SendEmailMessage, SendEmailResult } from './email-types.js';
import { EmailRecipientInvalidError } from './email-errors.js';

export interface InjectedFailure {
  errorCode: string;
  errorMessage: string;
  isTransient: boolean;
  count?: number; // Number of times this failure triggers before clearing
}

export class SandboxEmailProvider implements IEmailProvider {
  public readonly providerType = 'SANDBOX' as const;
  private readonly sentMessages: Array<{ message: SendEmailMessage; timestamp: Date; id: string }> =
    [];
  private injectedFailure: InjectedFailure | null = null;
  private latencyMs = 0;

  public async send(message: SendEmailMessage): Promise<SendEmailResult> {
    const startTime = performance.now();

    if (this.latencyMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.latencyMs));
    }

    // Validate recipients
    if (!message.to || message.to.length === 0) {
      throw new EmailRecipientInvalidError('No recipient email addresses provided.');
    }

    for (const email of message.to) {
      if (!this.isValidEmail(email)) {
        throw new EmailRecipientInvalidError(`Invalid recipient email address: "${email}".`);
      }
    }

    // Check injected failure
    if (this.injectedFailure) {
      const failure = this.injectedFailure;
      if (failure.count !== undefined) {
        failure.count -= 1;
        if (failure.count <= 0) {
          this.injectedFailure = null;
        }
      }

      const durationMs = Math.round(performance.now() - startTime);
      return {
        accepted: false,
        deliveryMode: 'SIMULATED',
        timestamp: new Date(),
        errorCode: failure.errorCode,
        errorMessage: failure.errorMessage,
        isTransient: failure.isTransient,
        durationMs,
      };
    }

    const messageId = `<sandbox-${crypto.randomUUID()}@aiquality.internal>`;
    this.sentMessages.push({
      message,
      timestamp: new Date(),
      id: messageId,
    });

    const durationMs = Math.round(performance.now() - startTime);
    return {
      accepted: true,
      providerMessageId: messageId,
      providerResponse: '250 2.0.0 Ok: queued in sandbox',
      deliveryMode: 'SIMULATED',
      timestamp: new Date(),
      durationMs,
    };
  }

  public async validateConfiguration(): Promise<{ valid: boolean; message?: string }> {
    return { valid: true, message: 'Sandbox email provider active.' };
  }

  public injectFailure(failure: InjectedFailure | null): void {
    this.injectedFailure = failure;
  }

  public setLatency(ms: number): void {
    this.latencyMs = ms;
  }

  public getSentMessages(): readonly { message: SendEmailMessage; timestamp: Date; id: string }[] {
    return [...this.sentMessages];
  }

  public getLastMessage(): { message: SendEmailMessage; timestamp: Date; id: string } | undefined {
    return this.sentMessages[this.sentMessages.length - 1];
  }

  public clear(): void {
    this.sentMessages.length = 0;
    this.injectedFailure = null;
    this.latencyMs = 0;
  }

  private isValidEmail(email: string): boolean {
    if (!email || typeof email !== 'string') return false;
    const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return re.test(email.trim());
  }
}
