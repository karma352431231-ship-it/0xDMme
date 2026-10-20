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

await test('cancellation during microphone permission stops audio granted later without opening a connection', async (t) => {
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
  await assert.rejects(acquiring, /cancelled/u);
  assert.equal(stopped, 1);
  assert.equal(connections, 0);
  assert.equal(rtc.state, 'idle');
});

await test('autoplay rejection after shutdown cannot alter the next call', async (t) => {
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

function captureFixture(t: import('node:test').TestContext, fail = false) {
  const saved: (() => void)[] = [];
  function replace(target: object, key: string, value: unknown) {
    const previous = Object.getOwnPropertyDescriptor(target, key);
    Object.defineProperty(target, key, { value, configurable: true });
    saved.push(() => {
      if (previous) Object.defineProperty(target, key, previous);
      else Reflect.deleteProperty(target, key);
    });
  }
  t.after(() => saved.reverse().forEach((restore) => restore()));
  let stopped = 0,
    closed = false,
    paused = 0,
    acquisitions = 0,
    detachments = 0;
  const track = {
    kind: 'audio',
    enabled: true,
    addEventListener() {},
    stop() {
      stopped++;
    },
  };
  const sender = {
    track: track as typeof track | null,
    replaceTrack(next: typeof track | null) {
      detachments++;
      if (fail) return Promise.reject(new Error('synthetic detach failure'));
      this.track = next;
      return Promise.resolve();
    },
  };
  class Peer extends EventTarget {
    addTrack() {}
    getSenders() {
      return [sender];
    }
    close() {
      closed = true;
    }
  }
  replace(globalThis, 'RTCPeerConnection', Peer);
  replace(globalThis, 'document', {
    createElement: () => ({
      setAttribute() {},
      play: () => Promise.resolve(),
      pause() {
        paused++;
      },
      remove() {},
    }),
  });
  replace(navigator, 'mediaDevices', {
    getUserMedia: () => {
      acquisitions++;
      return Promise.resolve({
        getTracks: () => [track],
        getAudioTracks: () => [track],
      });
    },
  });
  const rtc = new VoiceConnection({
    changed() {},
    failed: () =>
      assert.fail('local stop must not become an external capture failure'),
    autoplay() {},
  });
  t.after(() => rtc.close());
  return {
    rtc,
    track,
    sender,
    state: () => ({ stopped, closed, paused, acquisitions, detachments }),
  };
}
await test('explicit capture stop releases microphone and sender while keeping reception; mute cannot reopen it', async (t) => {
  const f = captureFixture(t);
  await f.rtc.acquire();
  f.rtc.create({});
  f.rtc.mute();
  assert.equal(f.track.enabled, false);
  await f.rtc.stopCaptureForInspection();
  assert.equal(f.rtc.captureStopped, true);
  assert.equal(f.rtc.muted, true);
  assert.equal(f.sender.track, null);
  assert.deepEqual(f.state(), {
    stopped: 1,
    closed: false,
    paused: 0,
    acquisitions: 1,
    detachments: 1,
  });
  f.rtc.mute();
  await f.rtc.stopCaptureForInspection();
  assert.equal(f.rtc.muted, true);
  assert.equal(f.state().acquisitions, 1);
  assert.equal(f.state().detachments, 1);
});
await test('failed sender detachment preserves stopped capture instead of silently reopening the microphone', async (t) => {
  const f = captureFixture(t, true);
  await f.rtc.acquire();
  f.rtc.create({});
  await assert.rejects(
    f.rtc.stopCaptureForInspection(),
    /synthetic detach failure/u,
  );
  assert.equal(f.rtc.captureStopped, true);
  assert.equal(f.rtc.muted, true);
  assert.equal(f.state().stopped, 1);
  assert.equal(f.state().acquisitions, 1);
  assert.equal(f.state().closed, false);
});

await test('unresponsive native sender release times out with capture still closed', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = captureFixture(t);
  await f.rtc.acquire();
  f.rtc.create({});
  t.mock.method(f.sender, 'replaceTrack', () => new Promise<void>(() => {}));
  const rejected = assert.rejects(
    f.rtc.stopCaptureForInspection(),
    /timed out/u,
  );
  t.mock.timers.tick(1500);
  await rejected;
  assert.equal(f.rtc.captureStopped, true);
  assert.equal(f.state().stopped, 1);
  assert.equal(f.state().closed, false);
});
