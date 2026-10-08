import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  notifyMessageControls,
  observeMessageControls,
} from '../src/client/message-controls/index.ts';

await test(
  'controle invalida a própria página uma vez e outras abas recebem o aviso sem eco cancelar a mutação local',
  { timeout: 2000 },
  async (t) => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: new EventTarget(),
    });
    const cleanup: (() => void)[] = [];
    t.after(() => {
      for (const close of cleanup.reverse()) close();
      Reflect.deleteProperty(globalThis, 'window');
    });
    let local = 0;
    const stop = observeMessageControls(() => {
      local++;
    });
    cleanup.push(stop);
    const other = new BroadcastChannel('0xdmme-message-controls');
    cleanup.push(() => other.close());
    const remote = new Promise<unknown>((resolve) => {
      other.addEventListener(
        'message',
        (event) => {
          resolve(event.data as unknown);
        },
        { once: true },
      );
    });
    notifyMessageControls();
    assert.equal(local, 1);
    assert.equal(await remote, 'changed');
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(
      local,
      1,
      'O eco da própria página cancelaria a exclusão em andamento.',
    );
    const incoming = new Promise<void>((resolve) => {
      window.addEventListener('0xdmme-test-control', () => resolve(), {
        once: true,
      });
    });
    stop();
    const stopAgain = observeMessageControls(() => {
      local++;
      window.dispatchEvent(new Event('0xdmme-test-control'));
    });
    cleanup.push(stopAgain);
    other.postMessage('changed');
    await incoming;
    assert.equal(local, 2);
  },
);
