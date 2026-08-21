/// <reference types="vite/client" />
import type { DesktopBridge } from '@ai-quality/contracts';

declare global {
  interface Window {
    readonly desktop?: DesktopBridge;
  }
}
