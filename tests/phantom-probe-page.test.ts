import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { setImmediate } from 'node:timers/promises';
import { build } from 'esbuild';
import {
  beginProbe,
  readProbe,
  ready,
  receiveProbe,
  probeLifetime,
} from '../src/client/phantom-native/index.ts';

await ready();
// Use the real protocol through a controlled clock. Browser initialization
// under the real CSP is separately exercised in the actual browser.
const built = await build({
  entryPoints: ['src/client/phantom-native/probe.ts'],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  plugins: [
    {
      name: 'controlled-protocol-clock',
      setup(builder) {
        builder.onResolve({ filter: /^\.\/index\.ts$/ }, () => ({
          path: 'protocol',
          namespace: 'fixture',
        }));
        builder.onLoad({ filter: /^protocol$/, namespace: 'fixture' }, () => ({
          contents:
            'export const { beginProbe, readProbe, ready, receiveProbe, probeLifetime } = fixtureProtocol;',
          loader: 'js',
        }));
      },
    },
  ],
});
const source = built.outputFiles[0]?.text ?? '';
if (!source) throw new Error('Fixture ausente.');
const origin = 'https://0xdmme.app';
const storageKey = '0xdmme:phantom-native-probe:v1';

class Control extends EventTarget {
  disabled = true;
  hidden = true;
  href = '';
  textContent = '';
  removeAttribute(name: string): void {
    if (name === 'href') this.href = '';
  }
}
async function page(
  options: {
    storage?: Map<string, string>;
    blocked?: boolean;
    query?: string;
    now?: number;
  } = {},
) {
  let now = options.now ?? Date.now();
  let sequence = 0;
  const storage = options.storage ?? new Map<string, string>();
  const controls = {
    start: new Control(),
    cancel: new Control(),
    launch: new Control(),
    status: new Control(),
  };
  const timers = new Map<number, () => void>();
  const navigations: { link: string; stored: boolean }[] = [];
  const cleaned: string[] = [];
  const window = Object.assign(new EventTarget(), {
    setTimeout(callback: () => void) {
      timers.set(++sequence, callback);
      return sequence;
    },
    clearTimeout(id: number) {
      timers.delete(id);
    },
  });
  const document = Object.assign(new EventTarget(), {
    querySelector(selector: string) {
      const name = selector.slice(12, -1) as keyof typeof controls;
      return controls[name];
    },
  });
  function guard(): void {
    if (options.blocked) throw new Error('synthetic-storage-blocked');
  }
  runInNewContext(source, {
    fixtureProtocol: {
      ready,
      probeLifetime,
      beginProbe: (value: string) => beginProbe(value, now),
      readProbe: (value: unknown) => readProbe(value, now),
      receiveProbe: (
        value: unknown,
        params: URLSearchParams,
        valueOrigin: string,
      ) => receiveProbe(value, params, valueOrigin, now),
    },
    document,
    window,
    URLSearchParams,
    Date: { now: () => now },
    history: {
      replaceState: (_state: unknown, _title: string, path: string) =>
        cleaned.push(path),
    },
    location: {
      origin,
      search: options.query ?? '',
      assign: (link: string) =>
        navigations.push({ link, stored: storage.has(storageKey) }),
    },
    localStorage: {
      getItem(key: string) {
        guard();
        return storage.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        guard();
        storage.set(key, value);
      },
      removeItem(key: string) {
        guard();
        storage.delete(key);
      },
    },
  });
  await setImmediate();
  return {
    controls,
    storage,
    timers,
    navigations,
    cleaned,
    window,
    advance: (duration: number) => {
      now += duration;
    },
  };
}

await test('prova grava canal antes de abrir a wallet e cancelar apaga o registro', async () => {
  const view = await page();
  assert.deepEqual(view.cleaned, ['/phantom-probe.html']);
  assert.equal(view.controls.start.disabled, false);
  view.controls.start.dispatchEvent(new Event('click'));
  assert.equal(view.navigations.length, 1);
  assert.equal(view.navigations[0]?.stored, true);
  assert.equal(
    new URL(view.navigations[0]?.link ?? '').pathname,
    '/ul/v1/connect',
  );
  assert.equal(view.timers.size, 1);
  view.controls.cancel.dispatchEvent(new Event('click'));
  assert.equal(view.storage.size, 0);
  assert.equal(view.timers.size, 0);
  assert.equal(view.controls.launch.href, '');
  const late = await page({
    storage: view.storage,
    query: '?state=synthetic&phase=connect',
  });
  assert.equal(late.storage.size, 0);
  assert.equal(late.controls.launch.hidden, true);
  assert.match(late.controls.status.textContent, /Prova não concluída/u);
});

await test('retomar a página rearma prazo original e expiração apaga o canal', async () => {
  const view = await page();
  view.controls.start.dispatchEvent(new Event('click'));
  view.window.dispatchEvent(new Event('pagehide'));
  assert.equal(view.timers.size, 0);
  view.advance(1000);
  view.window.dispatchEvent(new Event('focus'));
  assert.equal(view.timers.size, 1);
  view.advance(probeLifetime);
  view.window.dispatchEvent(new Event('pageshow'));
  assert.equal(view.timers.size, 0);
  assert.equal(view.storage.size, 0);
  assert.equal(view.controls.launch.hidden, true);
  assert.match(view.controls.status.textContent, /Prova expirada/u);
});

await test('registro expirado ao abrir é removido sem navegar para a wallet', async () => {
  const now = Date.now();
  const state = beginProbe(origin, now - probeLifetime).state;
  const view = await page({
    storage: new Map([[storageKey, JSON.stringify(state)]]),
    now,
  });
  assert.equal(view.storage.size, 0);
  assert.equal(view.navigations.length, 0);
  assert.equal(view.controls.launch.hidden, true);
});

await test('armazenamento bloqueado falha antes de iniciar conexão', async () => {
  const view = await page({ blocked: true });
  assert.equal(view.controls.start.disabled, true);
  assert.equal(view.controls.launch.hidden, true);
  assert.equal(view.navigations.length, 0);
  assert.match(view.controls.status.textContent, /Prova não concluída/u);
});
