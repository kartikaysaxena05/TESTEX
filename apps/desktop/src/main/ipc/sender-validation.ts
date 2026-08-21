import type { IpcMainInvokeEvent } from 'electron';
import { APP_PROTOCOL_SCHEME, APP_RENDERER_HOST } from '../protocol.js';
import { isValidDevelopmentUrl } from '../paths.js';

/**
 * Validate that an IPC request originates strictly from the authorized, top-level application renderer.
 * Reject untrusted origins, unexpected subframes, and remote/file protocols.
 */
export function isTrustedIpcSender(event: IpcMainInvokeEvent): boolean {
  if (!event) {
    return false;
  }

  // 1. Frame validation: IPC is strictly restricted to the top-level frame
  if (event.senderFrame) {
    if (event.senderFrame.parent !== null) {
      console.warn('[IPC Security] Blocked IPC invocation from nested subframe.');
      return false;
    }
  }

  const senderUrlString =
    event.senderFrame?.url ||
    (typeof event.sender?.getURL === 'function' ? event.sender.getURL() : undefined);

  if (!senderUrlString) {
    return false;
  }

  try {
    const parsed = new URL(senderUrlString);

    // Production Custom Protocol validation
    if (parsed.protocol === `${APP_PROTOCOL_SCHEME}:` && parsed.host === APP_RENDERER_HOST) {
      return true;
    }

    // Development Loopback Vite Server validation
    const devUrl = process.env['AI_QUALITY_RENDERER_DEV_URL'];
    if (devUrl && isValidDevelopmentUrl(devUrl)) {
      const devParsed = new URL(devUrl);
      if (parsed.origin === devParsed.origin) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}
