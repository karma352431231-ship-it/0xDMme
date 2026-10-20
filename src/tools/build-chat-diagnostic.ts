import { build } from 'esbuild';

await build({
  entryPoints: ['src/tools/chat-diagnostics/index.ts'],
  outfile: 'build/chat-lag-console.js',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2023',
  charset: 'utf8',
});
process.stdout.write('Console meter prepared at build/chat-lag-console.js.\n');
