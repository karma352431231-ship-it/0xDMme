import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import type { WebAsset } from '../../src/server/web-host/index.ts';

/** Loopback fixture-only UI; it never touches account databases or cookies. */
export async function fixtureCacheMaintenance(
  assets: Map<string, WebAsset>,
): Promise<void> {
  const result = await build({
    entryPoints: ['tests/fixtures/cache-maintenance.ts'],
    bundle: true,
    platform: 'browser',
    format: 'esm',
    minify: true,
    write: false,
  });
  const script = result.outputFiles[0]?.contents;
  if (!script) throw new Error('Fixture maintenance asset is missing.');
  const hash = createHash('sha256').update(script).digest('hex').slice(0, 16);
  const path = `/fixture-cache-maintenance-${hash}.js`;
  assets.set(path, { content: script, type: 'text/javascript; charset=utf-8' });
  assets.set('/fixture-maintenance.html', {
    type: 'text/html; charset=utf-8',
    content: new TextEncoder().encode(`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>0xDMme synthetic fixture maintenance</title>
<script type="module" src="${path}"></script></head>
<body><main><h1>Synthetic fixture installation cache</h1>
<p>This tool unregisters this test origin's root worker and clears only
hash-talk-shell resource caches. It does not access account storage or cookies.</p>
<button id="clear-fixture-cache" type="button">Clear fixture installation cache</button>
<p id="fixture-cache-result" role="status">Ready for test-cache maintenance.</p>
<a href="/#perfil">Open current fixture</a></main></body></html>`),
  });
}
