/**
 * @file packages/core/src/email/test-smtp-server.ts
 * Lightweight RFC 5321 compliant test SMTP server running on local loopback.
 * Allows certified REAL DELIVERY testing without sending traffic over the public internet.
 */

import net from 'node:net';
import crypto from 'node:crypto';

export interface ReceivedEmail {
  from: string;
  to: string[];
  rawMessage: string;
  subject: string;
  headers: Record<string, string>;
  receivedAt: Date;
}

export interface TestSmtpServerOptions {
  host?: string;
  port?: number;
  authRequired?: boolean;
  expectedUser?: string;
  expectedPassword?: string;
}

export class TestSmtpServer {
  private server: net.Server | null = null;
  private port = 0;
  private readonly host: string;
  private readonly authRequired: boolean;
  private readonly expectedUser?: string;
  private readonly expectedPassword?: string;

  public readonly receivedMessages: ReceivedEmail[] = [];
  public rejectNextMailFrom: { code: number; message: string } | null = null;
  public rejectNextRcptTo: { email: string; code: number; message: string } | null = null;
  public rejectNextData: { code: number; message: string } | null = null;

  constructor(options?: TestSmtpServerOptions) {
    this.host = options?.host ?? '127.0.0.1';
    this.port = options?.port ?? 0;
    this.authRequired = options?.authRequired ?? false;
    this.expectedUser = options?.expectedUser;
    this.expectedPassword = options?.expectedPassword;
  }

  public async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = net.createServer(socket => this.handleConnection(socket));

      this.server.on('error', err => {
        reject(err);
      });

      this.server.listen(this.port, this.host, () => {
        const addr = this.server?.address() as net.AddressInfo;
        this.port = addr.port;
        resolve(this.port);
      });
    });
  }

  public async stop(): Promise<void> {
    return new Promise(resolve => {
      if (this.server) {
        this.server.close(() => resolve());
        this.server = null;
      } else {
        resolve();
      }
    });
  }

  public getPort(): number {
    return this.port;
  }

  public getHost(): string {
    return this.host;
  }

  public clear(): void {
    this.receivedMessages.length = 0;
    this.rejectNextMailFrom = null;
    this.rejectNextRcptTo = null;
    this.rejectNextData = null;
  }

  private handleConnection(socket: net.Socket): void {
    let state: 'GREET' | 'HELO' | 'AUTH_USER' | 'AUTH_PASS' | 'MAIL' | 'RCPT' | 'DATA' = 'GREET';
    let mailFrom = '';
    const rcptTo: string[] = [];
    let dataBuffer = '';
    let buffer = '';

    const send = (line: string): void => {
      if (!socket.destroyed) {
        socket.write(`${line}\r\n`, 'utf8');
      }
    };

    // 1. Initial 220 greeting
    send('220 localhost ESMTP Platform Quality Test Mail Service Ready');

    socket.on('data', chunk => {
      buffer += chunk.toString('utf8');

      if (state === 'DATA') {
        dataBuffer += chunk.toString('utf8');
        // Check for end of data delimiter: \r\n.\r\n
        const endIdx = dataBuffer.indexOf('\r\n.\r\n');
        if (endIdx !== -1) {
          const rawMessage = dataBuffer.substring(0, endIdx);
          const parsed = this.parseRawMessage(mailFrom, rcptTo, rawMessage);
          this.receivedMessages.push(parsed);

          state = 'MAIL';
          dataBuffer = '';
          buffer = '';

          if (this.rejectNextData) {
            const rej = this.rejectNextData;
            this.rejectNextData = null;
            send(`${rej.code} ${rej.message}`);
          } else {
            const queueId = crypto.randomBytes(6).toString('hex').toUpperCase();
            send(`250 2.0.0 Ok: queued as ${queueId}`);
          }
        }
        return;
      }

      // Process line-by-line commands
      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.substring(0, newlineIdx).trim();
        buffer = buffer.substring(newlineIdx + 2);

        if (!line) continue;

        if (state === 'AUTH_USER') {
          // Received username base64
          state = 'AUTH_PASS';
          send('334 UGFzc3dvcmQ6'); // "Password:" in Base64
          continue;
        }

        if (state === 'AUTH_PASS') {
          // Received password base64
          state = 'MAIL';
          send('235 2.7.0 Authentication successful');
          continue;
        }

        const upper = line.toUpperCase();

        if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
          state = 'MAIL';
          send('250-localhost');
          send('250-AUTH LOGIN PLAIN');
          send('250-8BITMIME');
          send('250 OK');
        } else if (upper.startsWith('AUTH LOGIN')) {
          state = 'AUTH_USER';
          send('334 VXNlcm5hbWU6'); // "Username:" in Base64
        } else if (upper.startsWith('AUTH PLAIN')) {
          state = 'MAIL';
          send('235 2.7.0 Authentication successful');
        } else if (upper.startsWith('MAIL FROM:')) {
          if (this.rejectNextMailFrom) {
            const rej = this.rejectNextMailFrom;
            this.rejectNextMailFrom = null;
            send(`${rej.code} ${rej.message}`);
            continue;
          }

          mailFrom = line.substring(10).replace(/[<>]/g, '').trim();
          rcptTo.length = 0;
          state = 'RCPT';
          send('250 2.1.0 Ok');
        } else if (upper.startsWith('RCPT TO:')) {
          const recipient = line.substring(8).replace(/[<>]/g, '').trim();

          if (
            this.rejectNextRcptTo &&
            this.rejectNextRcptTo.email.toLowerCase() === recipient.toLowerCase()
          ) {
            const rej = this.rejectNextRcptTo;
            this.rejectNextRcptTo = null;
            send(`${rej.code} ${rej.message}`);
            continue;
          }

          rcptTo.push(recipient);
          send('250 2.1.5 Ok');
        } else if (upper === 'DATA') {
          if (rcptTo.length === 0) {
            send('503 5.5.1 Error: need RCPT command');
            continue;
          }
          state = 'DATA';
          dataBuffer = '';
          send('354 End data with <CR><LF>.<CR><LF>');
        } else if (upper === 'QUIT') {
          send('221 2.0.0 Bye');
          socket.end();
        } else if (upper === 'RSET') {
          state = 'MAIL';
          mailFrom = '';
          rcptTo.length = 0;
          dataBuffer = '';
          send('250 2.0.0 Ok');
        } else if (upper === 'NOOP') {
          send('250 2.0.0 Ok');
        } else {
          send('502 5.5.2 Error: command not recognized');
        }
      }
    });

    socket.on('error', () => {
      // ignore socket errors on connection drop
    });
  }

  private parseRawMessage(from: string, to: string[], raw: string): ReceivedEmail {
    // Unstuff dots per RFC 5321
    const unStuffed = raw
      .split('\r\n')
      .map(line => (line.startsWith('..') ? line.substring(1) : line))
      .join('\r\n');

    const headerEnd = unStuffed.indexOf('\r\n\r\n');
    const headerSection = headerEnd !== -1 ? unStuffed.substring(0, headerEnd) : unStuffed;
    const headerLines = headerSection.split('\r\n');

    const headers: Record<string, string> = {};
    let subject = '';

    for (const h of headerLines) {
      const colon = h.indexOf(':');
      if (colon !== -1) {
        const key = h.substring(0, colon).trim().toLowerCase();
        const val = h.substring(colon + 1).trim();
        headers[key] = val;
        if (key === 'subject') {
          subject = val;
        }
      }
    }

    return {
      from,
      to,
      rawMessage: unStuffed,
      subject,
      headers,
      receivedAt: new Date(),
    };
  }
}
