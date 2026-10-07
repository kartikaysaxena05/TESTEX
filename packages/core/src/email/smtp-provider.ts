/**
 * @file packages/core/src/email/smtp-provider.ts
 * SMTP Email Provider implementing IEmailProvider via SmtpClient.
 */

import type { IEmailProvider, SendEmailMessage, SendEmailResult } from './email-types.js';
import { SmtpClient } from './smtp-client.js';
import { EmailConfigurationMissingError, EmailRecipientInvalidError } from './email-errors.js';
import { SecretRedactor } from '../execution/sessions/secret-redactor.js';

export interface SmtpProviderConfig {
  host?: string | null;
  port?: number | null;
  secure?: boolean;
  user?: string | null;
  password?: string | null;
  senderAddress: string;
  senderName?: string;
  replyTo?: string | null;
  isTestMode?: boolean;
  testInboxAddress?: string | null;
}

export class SmtpEmailProvider implements IEmailProvider {
  public readonly providerType = 'SMTP' as const;
  private readonly config: SmtpProviderConfig;

  constructor(config: SmtpProviderConfig) {
    this.config = config;
    if (config.password) {
      SecretRedactor.registerSecret(config.password);
    }
  }

  public async send(message: SendEmailMessage): Promise<SendEmailResult> {
    const startTime = performance.now();

    if (!this.config.host) {
      throw new EmailConfigurationMissingError('SMTP host is not configured.');
    }

    const port = this.config.port ?? (this.config.secure ? 465 : 587);

    // Validate recipient emails
    if (!message.to || message.to.length === 0) {
      throw new EmailRecipientInvalidError('No recipient email addresses provided.');
    }

    for (const email of message.to) {
      if (!this.isValidEmail(email)) {
        throw new EmailRecipientInvalidError(`Invalid recipient email address: "${email}".`);
      }
    }

    // If test mode is active and testInboxAddress is provided, redirect recipients safely
    const actualRecipients =
      this.config.isTestMode && this.config.testInboxAddress
        ? [this.config.testInboxAddress]
        : message.to;

    const fromAddress = this.config.senderName
      ? `"${this.config.senderName}" <${this.config.senderAddress}>`
      : this.config.senderAddress;

    const client = new SmtpClient({
      host: this.config.host,
      port,
      secure: this.config.secure ?? false,
      user: this.config.user ?? undefined,
      password: this.config.password ?? undefined,
      timeoutMs: 10000,
    });

    try {
      const result = await client.send({
        from: fromAddress,
        to: actualRecipients,
        subject: message.subject,
        bodyText: message.textBody,
        bodyHtml: message.htmlBody,
        replyTo: message.replyTo ?? this.config.replyTo ?? undefined,
        headers: message.headers,
      });

      const durationMs = Math.round(performance.now() - startTime);
      return {
        accepted: true,
        providerMessageId: result.messageId,
        providerResponse: result.response,
        deliveryMode: this.config.isTestMode ? 'TEST' : 'REAL',
        timestamp: new Date(),
        durationMs,
      };
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - startTime);
      const isTransient = (err as { isTransient?: boolean }).isTransient ?? false;
      const code = (err as { code?: string }).code ?? 'EMAIL_DELIVERY_FAILED';
      const msg = err instanceof Error ? err.message : String(err);

      return {
        accepted: false,
        deliveryMode: this.config.isTestMode ? 'TEST' : 'REAL',
        timestamp: new Date(),
        errorCode: code,
        errorMessage: msg,
        isTransient,
        durationMs,
      };
    }
  }

  public async validateConfiguration(): Promise<{ valid: boolean; message?: string }> {
    if (!this.config.host) {
      return { valid: false, message: 'SMTP host is required.' };
    }
    if (!this.config.senderAddress || !this.isValidEmail(this.config.senderAddress)) {
      return { valid: false, message: 'Valid sender email address is required.' };
    }

    const port = this.config.port ?? (this.config.secure ? 465 : 587);
    const client = new SmtpClient({
      host: this.config.host,
      port,
      secure: this.config.secure ?? false,
      user: this.config.user ?? undefined,
      password: this.config.password ?? undefined,
      timeoutMs: 5000,
    });

    try {
      // Send a ping message to test inbox or sender
      const testTo = this.config.testInboxAddress || this.config.senderAddress;
      const res = await client.send({
        from: this.config.senderAddress,
        to: [testTo],
        subject: '[Test Connection] SMTP Configuration Health Check',
        bodyText: 'This is an automated connection validation message from AI Quality Platform.',
      });
      return { valid: res.accepted, message: res.response };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { valid: false, message: msg };
    }
  }

  private isValidEmail(email: string): boolean {
    if (!email || typeof email !== 'string') return false;
    const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return re.test(email.trim());
  }
}
