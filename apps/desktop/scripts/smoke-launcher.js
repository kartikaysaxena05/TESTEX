#!/usr/bin/env node

import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const desktopRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const electronApp = resolve(desktopRoot, '../../node_modules/electron/dist/Electron.app');

const command = process.platform === 'darwin' ? 'open' : 'electron';
const args =
  process.platform === 'darwin'
    ? ['-W', '-n', electronApp, '--args', desktopRoot, '--smoke']
    : [desktopRoot, '--smoke'];

const result = spawnSync(command, args, { stdio: 'inherit' });

if (result.error) {
  console.error(`Unable to launch Electron smoke test: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
