import { spawn } from 'node:child_process';
import http from 'node:http';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

const DEV_PORT = 5173;
const DEV_URL = `http://127.0.0.1:${DEV_PORT}`;

/**
 * Poll Vite server until it is ready.
 */
function waitForVite(url, maxRetries = 40, interval = 250) {
  return new Promise((resolvePromise, rejectPromise) => {
    let retries = 0;

    const check = () => {
      http
        .get(url, res => {
          if (res.statusCode && res.statusCode < 400) {
            resolvePromise();
          } else if (retries < maxRetries) {
            retries++;
            setTimeout(check, interval);
          } else {
            rejectPromise(new Error(`Vite server at ${url} returned status ${res.statusCode}`));
          }
        })
        .on('error', () => {
          if (retries < maxRetries) {
            retries++;
            setTimeout(check, interval);
          } else {
            rejectPromise(new Error(`Vite server at ${url} failed to start in time.`));
          }
        });
    };

    check();
  });
}

async function main() {
  console.log('[Dev] Compiling main process and sandboxed preload...');

  // 1. Compile main process
  const tscProcess = spawn('npx', ['tsc', '-b'], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: true,
  });

  await new Promise((resolveTsc, rejectTsc) => {
    tscProcess.on('exit', code => {
      if (code === 0) resolveTsc();
      else rejectTsc(new Error(`TypeScript build failed with code ${code}`));
    });
  });

  // 2. Bundle preload script
  const preloadProcess = spawn('node', ['scripts/build-preload.js'], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: true,
  });

  await new Promise((resolvePreload, rejectPreload) => {
    preloadProcess.on('exit', code => {
      if (code === 0) resolvePreload();
      else rejectPreload(new Error(`Preload bundle failed with code ${code}`));
    });
  });

  // 3. Start Vite
  console.log('[Dev] Starting Vite renderer development server...');
  const viteProcess = spawn('npx', ['vite'], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: true,
  });

  // Cleanup handler
  const cleanup = () => {
    if (!viteProcess.killed) {
      viteProcess.kill('SIGTERM');
    }
  };

  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
  });
  process.on('exit', cleanup);

  try {
    await waitForVite(DEV_URL);
    console.log(`[Dev] Vite is ready at ${DEV_URL}. Launching Electron...`);

    const electronProcess = spawn('npx', ['electron', '.'], {
      cwd: projectRoot,
      env: {
        ...process.env,
        AI_QUALITY_RENDERER_DEV_URL: DEV_URL,
      },
      stdio: 'inherit',
      shell: true,
    });

    electronProcess.on('exit', code => {
      console.log(`[Dev] Electron exited with code ${code}.`);
      cleanup();
      process.exit(code ?? 0);
    });
  } catch (error) {
    console.error('[Dev] Error launching development environment:', error);
    cleanup();
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[Dev] Fatal error:', err);
  process.exit(1);
});
