import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';

const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
const dirty =
  execFileSync('git', ['status', '--porcelain'], {
    encoding: 'utf8',
  }).trim() !== '';

await build({
  entryPoints: ['src/tools/chat-diagnostics/index.ts'],
  outfile: 'build/chat-lag-console.js',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2023',
  charset: 'utf8',
  define: {
    CHAT_DIAGNOSTIC_COMMIT: JSON.stringify(revision),
    CHAT_DIAGNOSTIC_DIRTY: JSON.stringify(dirty),
  },
});
process.stdout.write('Console meter prepared at build/chat-lag-console.js.\n');
