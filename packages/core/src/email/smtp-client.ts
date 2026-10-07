/**
 * @file packages/core/src/email/smtp-client.ts
 * RFC 5321 compliant SMTP client using native node:net and node:tls.
 * Provides full socket handshake, authentication, dot-stuffing, and 4xx/5xx classification.
 */

import net from 'node:net';
import tls from 'node:tls';
import crypto from 'node:crypto';
import { EmailDeliveryFailedError, EmailProviderUnavailableError } from './email-errors.js';
import { SecretRedactor } from '../execution/sessions/secret-redactor.js';

export interface SmtpClientOptions {
  host: string;
  port: number;
  secure?: boolean;
  user?: string;
  password?: string;
  timeoutMs?: number;
  clientHostname?: string;
  tlsOptions?: tls.ConnectionOptions;
}

export interface SmtpSendPayload {
  from: string;
  to: string[];
  subject: string;
  headers?: Record<string, string>;
  bodyText: string;
  bodyHtml?: string;
  replyTo?: string;
}

export interface SmtpSendResult {
  accepted: boolean;
  messageId: string;
  response: string;
  durationMs: number;
}

interface SmtpResponse {
  code: number;
  lines: string[];
  message: string;
}

export class SmtpClient {
  private readonly host: string;
  private readonly port: number;
  private readonly secure: boolean;
  private readonly user?: string;
  private readonly password?: string;
  private readonly timeoutMs: number;
  private readonly clientHostname: string;
  private readonly tlsOptions: tls.ConnectionOptions;

  constructor(options: SmtpClientOptions) {
    this.host = options.host;
    this.port = options.port;
    this.secure = options.secure ?? false;
    this.user = options.user;
    this.password = options.password;
    this.timeoutMs = options.timeoutMs ?? 10000;
    this.clientHostname = options.clientHostname ?? 'localhost';
    this.tlsOptions = options.tlsOptions ?? { rejectUnauthorized: false };

    if (this.password) {
      SecretRedactor.registerSecret(this.password);
    }
  }

  public async send(payload: SmtpSendPayload): Promise<SmtpSendResult> {
    const startTime = performance.now();
    let socket: net.Socket | tls.TLSSocket | null = null;

    try {
      socket = await this.connect();
      const reader = new SmtpSocketReader(socket, this.timeoutMs);

      // 1. Await 220 greeting
      const greeting = await reader.readResponse();
      if (greeting.code !== 220) {
        throw this.createErrorFromResponse(greeting, 'Greeting rejected');
      }

      // 2. Send EHLO
      await this.sendCommand(socket, `EHLO ${this.clientHostname}`);
      const ehloResp = await reader.readResponse();
      if (ehloResp.code !== 250) {
        // Fallback to HELO if EHLO not supported
        await this.sendCommand(socket, `HELO ${this.clientHostname}`);
        const heloResp = await reader.readResponse();
        if (heloResp.code !== 250) {
          throw this.createErrorFromResponse(heloResp, 'HELO command rejected');
        }
      }

      // 3. Authenticate if credentials provided
      if (this.user && this.password) {
        await this.authenticate(socket, reader);
      }

      // 4. MAIL FROM
      const fromAddress = this.extractBareAddress(payload.from);
      await this.sendCommand(socket, `MAIL FROM:<${fromAddress}>`);
      const mailResp = await reader.readResponse();
      if (mailResp.code !== 250) {
        throw this.createErrorFromResponse(mailResp, `MAIL FROM <${fromAddress}> rejected`);
      }

      // 5. RCPT TO for each recipient
      for (const rcpt of payload.to) {
        const toAddress = this.extractBareAddress(rcpt);
        await this.sendCommand(socket, `RCPT TO:<${toAddress}>`);
        const rcptResp = await reader.readResponse();
        if (rcptResp.code !== 250 && rcptResp.code !== 251) {
          throw this.createErrorFromResponse(rcptResp, `RCPT TO <${toAddress}> rejected`);
        }
      }

      // 6. DATA command
      await this.sendCommand(socket, 'DATA');
      const dataResp = await reader.readResponse();
      if (dataResp.code !== 354) {
        throw this.createErrorFromResponse(dataResp, 'DATA command rejected');
      }

      // 7. Format and stream message payload with dot-stuffing
      const messageId = `<${crypto.randomUUID()}@${this.clientHostname}>`;
      const mimeData = this.formatMimeMessage(payload, messageId);
      await this.sendMessageData(socket, mimeData);

      // 8. Expect 250 acknowledgement
      const ackResp = await reader.readResponse();
      if (ackResp.code !== 250) {
        throw this.createErrorFromResponse(ackResp, 'Message data rejected');
      }

      // 9. Send QUIT gracefully
      try {
        await this.sendCommand(socket, 'QUIT');
        await reader.readResponse();
      } catch {
        // Ignore quit errors if email was already accepted
      }

      const durationMs = Math.round(performance.now() - startTime);
      return {
        accepted: true,
        messageId,
        response: `${ackResp.code} ${ackResp.message}`,
        durationMs,
      };
    } catch (err: unknown) {
      if (err instanceof EmailDeliveryFailedError || err instanceof EmailProviderUnavailableError) {
        throw err;
      }

      const msg = err instanceof Error ? err.message : String(err);
      const isTransient = this.isTransientError(msg);
      if (isTransient) {
        throw new EmailProviderUnavailableError(`SMTP provider unavailable: ${msg}`, true);
      }
      throw new EmailDeliveryFailedError(`SMTP delivery failed: ${msg}`, false);
    } finally {
      if (socket) {
        try {
          socket.destroy();
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }

  private async connect(): Promise<net.Socket | tls.TLSSocket> {
    return new Promise((resolve, reject) => {
      let resolved = false;

      if (this.secure) {
        const socket = tls.connect(
          {
            host: this.host,
            port: this.port,
            ...this.tlsOptions,
          },
          () => {
            if (!resolved) {
              resolved = true;
              resolve(socket);
            }
          },
        );

        socket.setTimeout(this.timeoutMs);
        socket.once('timeout', () => {
          socket.destroy();
          if (!resolved) {
            resolved = true;
            reject(
              new EmailProviderUnavailableError(
                `Connection to SMTP server ${this.host}:${this.port} timed out after ${this.timeoutMs}ms.`,
                true,
              ),
            );
          }
        });

        socket.once('error', err => {
          if (!resolved) {
            resolved = true;
            reject(err);
          }
        });
      } else {
        const socket = net.createConnection(
          {
            host: this.host,
            port: this.port,
          },
          () => {
            if (!resolved) {
              resolved = true;
              resolve(socket);
            }
          },
        );

        socket.setTimeout(this.timeoutMs);
        socket.once('timeout', () => {
          socket.destroy();
          if (!resolved) {
            resolved = true;
            reject(
              new EmailProviderUnavailableError(
                `Connection to SMTP server ${this.host}:${this.port} timed out after ${this.timeoutMs}ms.`,
                true,
              ),
            );
          }
        });

        socket.once('error', err => {
          if (!resolved) {
            resolved = true;
            reject(err);
          }
        });
      }
    });
  }

  private async authenticate(
    socket: net.Socket | tls.TLSSocket,
    reader: SmtpSocketReader,
  ): Promise<void> {
    // Attempt AUTH LOGIN
    await this.sendCommand(socket, 'AUTH LOGIN');
    const authStart = await reader.readResponse();

    if (authStart.code === 334) {
      // Send base64 username
      const b64User = Buffer.from(this.user!).toString('base64');
      await this.sendCommand(socket, b64User);
      const userResp = await reader.readResponse();

      if (userResp.code === 334) {
        // Send base64 password
        const b64Pass = Buffer.from(this.password!).toString('base64');
        await this.sendCommand(socket, b64Pass);
        const passResp = await reader.readResponse();

        if (passResp.code !== 235) {
          throw this.createErrorFromResponse(passResp, 'SMTP AUTH LOGIN failed');
        }
        return;
      }
    }

    // If AUTH LOGIN rejected or returned unexpected code, try AUTH PLAIN
    const plainToken = Buffer.from(`\0${this.user}\0${this.password}`).toString('base64');
    await this.sendCommand(socket, `AUTH PLAIN ${plainToken}`);
    const plainResp = await reader.readResponse();
    if (plainResp.code !== 235) {
      throw this.createErrorFromResponse(plainResp, 'SMTP authentication failed');
    }
  }

  private async sendCommand(socket: net.Socket | tls.TLSSocket, cmd: string): Promise<void> {
    return new Promise((resolve, reject) => {
      socket.write(`${cmd}\r\n`, 'utf8', err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  private async sendMessageData(
    socket: net.Socket | tls.TLSSocket,
    messageData: string,
  ): Promise<void> {
    // RFC 5321 Dot-Stuffing: lines starting with '.' must be prepended with an extra '.'
    const dotStuffed = messageData
      .split('\r\n')
      .map(line => (line.startsWith('.') ? `.${line}` : line))
      .join('\r\n');

    return new Promise((resolve, reject) => {
      socket.write(`${dotStuffed}\r\n.\r\n`, 'utf8', err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  private formatMimeMessage(payload: SmtpSendPayload, messageId: string): string {
    const boundary = `----=_Part_${crypto.randomBytes(8).toString('hex')}`;
    const dateStr = new Date().toUTCString();

    const headers: string[] = [
      `Message-ID: ${messageId}`,
      `Date: ${dateStr}`,
      `From: ${payload.from}`,
      `To: ${payload.to.join(', ')}`,
      `Subject: ${payload.subject}`,
    ];

    if (payload.replyTo) {
      headers.push(`Reply-To: ${payload.replyTo}`);
    }

    if (payload.headers) {
      for (const [k, v] of Object.entries(payload.headers)) {
        headers.push(`${k}: ${v}`);
      }
    }

    if (payload.bodyHtml) {
      // Multipart/alternative containing plain text and HTML
      headers.push('MIME-Version: 1.0');
      headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);

      const parts = [
        headers.join('\r\n'),
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        payload.bodyText,
        '',
        `--${boundary}`,
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        payload.bodyHtml,
        '',
        `--${boundary}--`,
      ];
      return parts.join('\r\n');
    }

    // Plain text only
    headers.push('MIME-Version: 1.0');
    headers.push('Content-Type: text/plain; charset=UTF-8');
    headers.push('Content-Transfer-Encoding: 8bit');

    return `${headers.join('\r\n')}\r\n\r\n${payload.bodyText}`;
  }

  private extractBareAddress(input: string): string {
    const match = input.match(/<([^>]+)>/);
    if (match && match[1]) {
      return match[1].trim();
    }
    return input.replace(/["']/g, '').trim();
  }

  private createErrorFromResponse(resp: SmtpResponse, context: string): Error {
    const code = resp.code;
    const isTransient = code >= 400 && code < 500;
    const desc = `${context} (SMTP ${code}: ${resp.message})`;

    if (isTransient) {
      return new EmailProviderUnavailableError(desc, true);
    }
    return new EmailDeliveryFailedError(desc, false);
  }

  private isTransientError(errorText: string): boolean {
    const lower = errorText.toLowerCase();
    return (
      lower.includes('timed out') ||
      lower.includes('timeout') ||
      lower.includes('econnrefused') ||
      lower.includes('econnreset') ||
      lower.includes('epipe') ||
      lower.includes('ehostunreach') ||
      lower.includes('enotfound') ||
      lower.includes('421') ||
      lower.includes('450') ||
      lower.includes('451') ||
      lower.includes('452') ||
      lower.includes('try again')
    );
  }
}

class SmtpSocketReader {
  private buffer = '';
  private readonly socket: net.Socket | tls.TLSSocket;
  private readonly timeoutMs: number;

  constructor(socket: net.Socket | tls.TLSSocket, timeoutMs: number) {
    this.socket = socket;
    this.timeoutMs = timeoutMs;
  }

  public async readResponse(): Promise<SmtpResponse> {
    return new Promise((resolve, reject) => {
      let timer: NodeJS.Timeout | null = setTimeout(() => {
        cleanup();
        reject(
          new EmailProviderUnavailableError(
            `Read from SMTP server timed out after ${this.timeoutMs}ms.`,
            true,
          ),
        );
      }, this.timeoutMs);

      const onData = (chunk: Buffer): void => {
        this.buffer += chunk.toString('utf8');
        const parsed = this.tryParseResponse();
        if (parsed) {
          cleanup();
          resolve(parsed);
        }
      };

      const onError = (err: Error): void => {
        cleanup();
        reject(err);
      };

      const onClose = (): void => {
        cleanup();
        const parsed = this.tryParseResponse();
        if (parsed) {
          resolve(parsed);
        } else {
          reject(new EmailProviderUnavailableError('SMTP connection closed unexpectedly.', true));
        }
      };

      const cleanup = (): void => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        this.socket.off('data', onData);
        this.socket.off('error', onError);
        this.socket.off('close', onClose);
      };

      // Check if buffer already contains complete response
      const immediate = this.tryParseResponse();
      if (immediate) {
        cleanup();
        resolve(immediate);
        return;
      }

      this.socket.on('data', onData);
      this.socket.once('error', onError);
      this.socket.once('close', onClose);
    });
  }

  private tryParseResponse(): SmtpResponse | null {
    const lines = this.buffer.split(/\r?\n/);
    // Needs at least one complete line with terminator
    if (lines.length < 2) {
      return null;
    }

    const completedLines: string[] = [];
    let complete = false;
    let code = 0;
    let bytesConsumed = 0;

    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i]!;
      bytesConsumed += line.length + 2; // account for CRLF roughly

      if (line.length >= 3) {
        const lineCode = parseInt(line.substring(0, 3), 10);
        if (!isNaN(lineCode)) {
          code = lineCode;
          completedLines.push(line.substring(4));

          // In SMTP, "250-..." is continuation; "250 ..." is the final line
          if (line.length === 3 || line.charAt(3) === ' ') {
            complete = true;
            // Trim buffer up to this point
            this.buffer = lines.slice(i + 1).join('\r\n');
            break;
          }
        }
      }
    }

    if (complete && code > 0) {
      return {
        code,
        lines: completedLines,
        message: completedLines.join('\n'),
      };
    }

    return null;
  }
}
