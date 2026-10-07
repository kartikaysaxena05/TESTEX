/**
 * @file e2e/ipc/ipc-mock.ts
 * IPC Mocking Utility for Electron Playwright E2E testing.
 *
 * Intercepts IPC messages dispatched from the React UI renderer (via ipcRenderer.invoke)
 * to the Node.js main process (ipcMain.handle) and returns controlled dummy data.
 *
 * Invariants & Capabilities:
 * - Operates directly within Electron's Node.js main process via electronApp.evaluate.
 * - Records all incoming invocations (channel name, arguments, timestamp) for test assertions.
 * - Formats mock responses into DesktopResult<T> envelopes ({ ok: true, data } | { ok: false, error }).
 * - Supports raw data, errors, call history inspection, and default platform mock presets.
 */

import type { ElectronApplication } from '@playwright/test';

export interface RecordedIpcCall {
  readonly channel: string;
  readonly args: unknown;
  readonly timestamp: number;
}

export interface IpcMockOptions {
  readonly isRaw?: boolean;
  readonly isError?: boolean;
}

export class IpcMock {
  constructor(private readonly electronApp: ElectronApplication) {}

  /**
   * Initializes the in-memory IPC registry inside Electron's main process.
   */
  public async initialize(): Promise<void> {
    await this.electronApp.evaluate(({ ipcMain }) => {
      const g = globalThis as unknown as {
        __e2eIpcRegistry?: {
          mocks: Map<string, { data: unknown; isRaw: boolean; isError: boolean }>;
          calls: Array<{ channel: string; args: unknown; timestamp: number }>;
        };
      };

      if (!g.__e2eIpcRegistry) {
        g.__e2eIpcRegistry = {
          mocks: new Map(),
          calls: [],
        };
      }
    });
  }

  /**
   * Intercepts messages on a specific channel and returns dummy data wrapped in DesktopResult.
   *
   * @param channel The IPC channel name (e.g. 'desktop:projects:list' or 'desktop:auth:login')
   * @param data The dummy data payload to return to the React UI
   */
  public async handle<T = unknown>(channel: string, data: T): Promise<void> {
    await this.electronApp.evaluate(
      ({ ipcMain }, { channelName, responseData }) => {
        const g = globalThis as unknown as {
          __e2eIpcRegistry?: {
            mocks: Map<string, { data: unknown; isRaw: boolean; isError: boolean }>;
            calls: Array<{ channel: string; args: unknown; timestamp: number }>;
          };
        };

        if (!g.__e2eIpcRegistry) {
          g.__e2eIpcRegistry = { mocks: new Map(), calls: [] };
        }

        const reg = g.__e2eIpcRegistry;
        reg.mocks.set(channelName, { data: responseData, isRaw: false, isError: false });

        try {
          ipcMain.removeHandler(channelName);
        } catch {
          // ignore if no previous handler
        }

        ipcMain.handle(channelName, async (_event, ...args: unknown[]) => {
          const payload = args.length === 1 ? args[0] : args.length === 0 ? undefined : args;
          reg.calls.push({
            channel: channelName,
            args: payload,
            timestamp: Date.now(),
          });

          const mock = reg.mocks.get(channelName);
          if (!mock) {
            return { ok: true, data: null };
          }

          if (mock.isError) {
            return {
              ok: false,
              error:
                typeof mock.data === 'string'
                  ? { code: 'MOCK_ERROR', message: mock.data }
                  : mock.data,
            };
          }

          if (mock.isRaw) {
            return mock.data;
          }

          // Return as DesktopResult envelope if not already wrapped
          if (mock.data && typeof mock.data === 'object' && 'ok' in mock.data) {
            return mock.data;
          }

          return { ok: true, data: mock.data };
        });
      },
      { channelName: channel, responseData: data },
    );
  }

  /**
   * Intercepts messages and returns raw payload without automatic envelope wrapping.
   */
  public async handleRaw(channel: string, rawData: unknown): Promise<void> {
    await this.electronApp.evaluate(
      ({ ipcMain }, { channelName, responseData }) => {
        const g = globalThis as unknown as {
          __e2eIpcRegistry?: {
            mocks: Map<string, { data: unknown; isRaw: boolean; isError: boolean }>;
            calls: Array<{ channel: string; args: unknown; timestamp: number }>;
          };
        };

        if (!g.__e2eIpcRegistry) {
          g.__e2eIpcRegistry = { mocks: new Map(), calls: [] };
        }

        const reg = g.__e2eIpcRegistry;
        reg.mocks.set(channelName, { data: responseData, isRaw: true, isError: false });

        try {
          ipcMain.removeHandler(channelName);
        } catch {}

        ipcMain.handle(channelName, async (_event, ...args: unknown[]) => {
          const payload = args.length === 1 ? args[0] : args.length === 0 ? undefined : args;
          reg.calls.push({
            channel: channelName,
            args: payload,
            timestamp: Date.now(),
          });
          const mock = reg.mocks.get(channelName);
          return mock ? mock.data : null;
        });
      },
      { channelName: channel, responseData: rawData },
    );
  }

  /**
   * Intercepts messages and returns an error DesktopResult envelope.
   */
  public async handleError(
    channel: string,
    message: string,
    code = 'IPC_MOCK_ERROR',
  ): Promise<void> {
    await this.electronApp.evaluate(
      ({ ipcMain }, { channelName, errMessage, errCode }) => {
        const g = globalThis as unknown as {
          __e2eIpcRegistry?: {
            mocks: Map<string, { data: unknown; isRaw: boolean; isError: boolean }>;
            calls: Array<{ channel: string; args: unknown; timestamp: number }>;
          };
        };

        if (!g.__e2eIpcRegistry) {
          g.__e2eIpcRegistry = { mocks: new Map(), calls: [] };
        }

        const reg = g.__e2eIpcRegistry;
        reg.mocks.set(channelName, {
          data: { code: errCode, message: errMessage, name: errCode },
          isRaw: false,
          isError: true,
        });

        try {
          ipcMain.removeHandler(channelName);
        } catch {}

        ipcMain.handle(channelName, async (_event, ...args: unknown[]) => {
          const payload = args.length === 1 ? args[0] : args.length === 0 ? undefined : args;
          reg.calls.push({
            channel: channelName,
            args: payload,
            timestamp: Date.now(),
          });
          const mock = reg.mocks.get(channelName);
          return {
            ok: false,
            error: mock?.data ?? { code: errCode, message: errMessage },
          };
        });
      },
      { channelName: channel, errMessage: message, errCode: code },
    );
  }

  /**
   * Retrieves all recorded calls matching a channel (or all calls if omitted).
   */
  public async getCalls(channel?: string): Promise<RecordedIpcCall[]> {
    return await this.electronApp.evaluate(
      ({}, channelFilter) => {
        const g = globalThis as unknown as {
          __e2eIpcRegistry?: {
            calls: Array<{ channel: string; args: unknown; timestamp: number }>;
          };
        };
        const all = g.__e2eIpcRegistry?.calls ?? [];
        if (!channelFilter) {
          return all;
        }
        return all.filter(c => c.channel === channelFilter);
      },
      channel,
    );
  }

  /**
   * Retrieves the count of calls intercepted for a specific channel.
   */
  public async getCallCount(channel: string): Promise<number> {
    const calls = await this.getCalls(channel);
    return calls.length;
  }

  /**
   * Retrieves the most recent call recorded for a channel.
   */
  public async getLastCall(channel: string): Promise<RecordedIpcCall | null> {
    const calls = await this.getCalls(channel);
    return calls.length > 0 ? calls[calls.length - 1]! : null;
  }

  /**
   * Clears the recorded call history.
   */
  public async clearCalls(): Promise<void> {
    await this.electronApp.evaluate(() => {
      const g = globalThis as unknown as {
        __e2eIpcRegistry?: {
          calls: Array<{ channel: string; args: unknown; timestamp: number }>;
        };
      };
      if (g.__e2eIpcRegistry) {
        g.__e2eIpcRegistry.calls = [];
      }
    });
  }

  /**
   * Waits until at least one call to the specified channel has been intercepted.
   */
  public async waitForCall(channel: string, timeoutMs = 5000): Promise<RecordedIpcCall> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const last = await this.getLastCall(channel);
      if (last) {
        return last;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out waiting for IPC call on channel: "${channel}" after ${timeoutMs}ms`);
  }

  /**
   * Configures standard default dummy data for common startup and shell channels.
   * Ensures the React application boots cleanly in zero-backend / isolated environments.
   */
  public async setupDefaults(): Promise<void> {
    // Shell Layout Preferences
    await this.handle('desktop:shell-layout:get', {
      isSidebarCollapsed: false,
      activePanel: 'none',
      pinnedSessions: [],
    });

    // User Settings / Preferences
    await this.handle('desktop:settings:get-preferences', {
      theme: 'dark',
      defaultEnvironment: 'development',
    });

    // Projects List (defaults to a sample active project)
    await this.handle('desktop:projects:list', [
      {
        id: 'proj-e2e-sqe',
        name: 'SQE Core Platform',
        key: 'SQE',
        description: 'Core Quality Platform for Autonomous QA',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    // Auth Login (returns authenticated QA engineer context)
    await this.handle('desktop:auth:login', {
      userId: 'usr-e2e-lead-qa',
      displayName: 'Lead QA Engineer',
      email: 'lead.qa@sqe.platform',
      accountStatus: 'ACTIVE',
      emailVerified: true,
      sessionId: 'sess-e2e-sqe-1',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });

    // Diagnostic Health & App Info
    await this.handle('desktop:health:check', {
      status: 'ok',
      uptimeSeconds: 3600,
    });

    await this.handle('desktop:app:get-info', {
      name: 'AI Quality Platform',
      version: '0.1.0',
      platform: process.platform,
      arch: process.arch,
    });
  }
}
