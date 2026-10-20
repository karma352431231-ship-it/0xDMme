import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { build } from 'esbuild';
import type { watchRankingUpdates } from '../src/client/communities/ranking-live.ts';
const bundle = await build({
  stdin: {
    contents:
      "export {watchRankingUpdates} from './src/client/communities/ranking-live.ts';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'rankingLive',
  platform: 'browser',
  plugins: [
    {
      name: 'stream-boundary',
      setup(builder) {
        builder.onResolve({ filter: /ranking-live-connection\.ts$/ }, () => ({
          path: 'connection',
          namespace: 'fixture',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
          contents:
            'export class RankingConnection { constructor(changed) { connect(changed); } close() { disconnect(); } }',
        }));
      },
    },
  ],
});
await test('ranking views share one stream, coalesce busy updates and suspend off-screen work', async () => {
  const document = Object.assign(new EventTarget(), {
    visibilityState: 'visible',
    body: {},
  });
  const window = new EventTarget();
  const callbacks: (() => void)[] = [];
  let closed = 0;
  const context: Record<string, unknown> = {
    document,
    window,
    connect: (changed: () => void) => callbacks.push(changed),
    disconnect: () => {
      closed++;
    },
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
  };
  runInNewContext(bundle.outputFiles[0]!.text, context);
  const watch = (
    context['rankingLive'] as {
      watchRankingUpdates: typeof watchRankingUpdates;
    }
  ).watchRankingUpdates;
  const lifetime = new AbortController();
  let reads = 0,
    hiddenReads = 0;
  let finish = () => {};
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  watch({
    signal: lifetime.signal,
    visible: () => true,
    refresh: () => {
      reads++;
      return reads === 1 ? pending : Promise.resolve();
    },
  });
  watch({
    signal: lifetime.signal,
    visible: () => false,
    refresh: () => {
      hiddenReads++;
      return Promise.resolve();
    },
  });
  assert.equal(callbacks.length, 1);
  callbacks[0]!();
  callbacks[0]!();
  callbacks[0]!();
  assert.equal(reads, 1);
  finish();
  await setImmediate();
  assert.equal(reads, 2);
  assert.equal(hiddenReads, 0);
  document.visibilityState = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(closed, 1);
  document.visibilityState = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(callbacks.length, 2);
  lifetime.abort();
  assert.equal(closed, 2);
});
