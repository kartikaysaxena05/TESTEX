import { build } from 'esbuild';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

async function buildPreload() {
  console.log('[Build] Bundling sandboxed preload script with esbuild...');
  await build({
    entryPoints: [resolve(projectRoot, 'src/preload/index.ts')],
    outfile: resolve(projectRoot, 'dist/preload/index.cjs'),
    bundle: true,
    platform: 'neutral',
    format: 'cjs',
    target: 'es2022',
    external: ['electron'],
    sourcemap: false,
    logLevel: 'info',
  });
  console.log('[Build] Preload bundled successfully: dist/preload/index.cjs');
}

buildPreload().catch(err => {
  console.error('[Build] Preload bundle failed:', err);
  process.exit(1);
});
