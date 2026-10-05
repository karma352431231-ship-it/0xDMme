import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VoiceConnection } from '../src/client/calls/index.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

await test('cancelar durante a permissão do microfone interrompe o áudio concedido depois, sem abrir conexão', async (t) => {
  function replace(target: object, name: string, value: unknown) {
    const previous = Object.getOwnPropertyDescriptor(target, name);
    Object.defineProperty(target, name, { value, configurable: true });
    t.after(() => {
      if (previous) Object.defineProperty(target, name, previous);
      else Reflect.deleteProperty(target, name);
    });
  }
  replace(globalThis, 'document', {
    createElement: () => ({
      setAttribute: () => {},
      pause: () => {},
      remove: () => {},
    }),
  });
  let connections = 0;
  replace(
    globalThis,
    'RTCPeerConnection',
    class {
      constructor() {
        connections++;
      }
    },
  );
  const { promise, resolve } = deferred<MediaStream>();
  replace(navigator, 'mediaDevices', {
    getUserMedia: (constraints: MediaStreamConstraints) => {
      assert.equal(constraints.video, false);
      assert.ok(constraints.audio);
      return promise;
    },
  });
  const rtc = new VoiceConnection({
    changed: () => {},
    failed: () => assert.fail('cancelamento local não é falha externa'),
    autoplay: () => {},
  });
  const acquiring = rtc.acquire();
  rtc.close();
  let stopped = 0;
  // Only the browser stream's stop contract is involved in a late grant.
  resolve({
    getTracks: () => [{ stop: () => stopped++ }],
  } as unknown as MediaStream);
  await assert.rejects(acquiring, /cancelada/u);
  assert.equal(stopped, 1);
  assert.equal(connections, 0);
  assert.equal(rtc.state, 'idle');
});

await test('bloqueio de autoplay depois do encerramento não altera a chamada seguinte', async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const { promise, reject } = deferred<void>();
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => ({
        setAttribute: () => {},
        play: () => promise,
        pause: () => {},
        remove: () => {},
      }),
    },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  let blocked = false;
  const rtc = new VoiceConnection({
    changed: () => {},
    failed: () => {},
    autoplay: () => {
      blocked = true;
    },
  });
  const playing = rtc.play();
  rtc.close();
  reject(new Error('Autoplay recusado depois da saída.'));
  await playing;
  assert.equal(blocked, false);
});
