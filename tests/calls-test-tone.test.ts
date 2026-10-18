import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { VoiceConnection } from '../src/client/calls/rtc.ts';
import { sendCallTestTone } from '../src/client/calls/test-tone.ts';
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
function fixture(t: TestContext) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const original = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  const samples: [number, number][] = [];
  let played = 0,
    closed = 0,
    stopped = 0,
    localOutput = 0;
  const input = {
    kind: 'audio',
    addEventListener() {},
    enabled: true,
    readyState: 'live',
    stop: () => assert.fail('test must not stop original capture'),
  };
  const tone = {
    kind: 'audio',
    readyState: 'live',
    stop: () => {
      stopped++;
    },
  };
  const oscillator = {
    frequency: { value: 0 },
    onended: null as null | (() => void),
    connect: () => {},
    disconnect: () => {},
    start: () => {
      played++;
    },
    stop: () => {},
  };
  const gain = {
    gain: {
      value: 0,
      setValueAtTime: (v: number, at: number) => samples.push([v, at]),
      linearRampToValueAtTime: (v: number, at: number) => samples.push([v, at]),
    },
    connect: (target: unknown) => {
      if (target === 'SPEAKER') localOutput++;
    },
    disconnect() {},
  };
  class Context {
    currentTime = 0;
    destination = 'SPEAKER';
    createMediaStreamDestination() {
      return {
        channelCount: 2,
        stream: { getTracks: () => [tone], getAudioTracks: () => [tone] },
      };
    }
    createOscillator() {
      return oscillator;
    }
    createGain() {
      return gain;
    }
    resume() {
      return Promise.resolve();
    }
    close() {
      closed++;
      return Promise.resolve();
    }
  }
  Object.defineProperty(globalThis, 'AudioContext', {
    configurable: true,
    value: Context,
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'AudioContext', original);
    else Reflect.deleteProperty(globalThis, 'AudioContext');
  });
  const replacements: unknown[] = [];
  const sender = {
    track: input,
    replaceTrack: (next: unknown) => {
      replacements.push(next);
      return Promise.resolve();
    },
  } as unknown as RTCRtpSender;
  return {
    input,
    tone,
    sender,
    samples,
    replacements,
    ended: () => oscillator.onended?.(),
    state: () => ({ played, closed, stopped, localOutput }),
  };
}
await test('known cue sends exactly one quiet pulse without speaker playback, then restores the original capture', async (t) => {
  const f = fixture(t),
    abort = new AbortController(),
    work = sendCallTestTone(f.sender, abort.signal);
  await flush();
  assert.deepEqual(f.replacements, [f.tone]);
  const audible = f.samples.filter(([v]) => v > 0);
  assert.equal(audible.length, 2);
  assert.ok(audible.every(([v]) => v <= 0.05));
  assert.equal(f.samples.at(-1)?.[0], 0);
  assert.equal(f.samples.at(-1)?.[1], 0.5);
  f.ended();
  await work;
  assert.deepEqual(f.replacements, [f.tone, f.input]);
  assert.deepEqual(f.state(), {
    played: 1,
    closed: 1,
    stopped: 1,
    localOutput: 0,
  });
});
await test('cancellation restores the same muted track and closes every synthetic resource', async (t) => {
  const f = fixture(t),
    abort = new AbortController(),
    work = sendCallTestTone(f.sender, abort.signal);
  const rejected = assert.rejects(work, { name: 'AbortError' });
  await flush();
  f.input.enabled = false;
  abort.abort();
  await rejected;
  assert.equal(f.replacements.at(-1), f.input);
  assert.equal(f.input.enabled, false);
  assert.equal(f.state().closed, 1);
  assert.equal(f.state().stopped, 1);
});
await test('ended microphone is never reopened or reattached after cancellation', async (t) => {
  const f = fixture(t),
    abort = new AbortController(),
    work = sendCallTestTone(f.sender, abort.signal);
  const rejected = assert.rejects(work, { name: 'AbortError' });
  await flush();
  f.input.readyState = 'ended';
  abort.abort();
  await rejected;
  assert.equal(f.replacements.at(-1), null);
  assert.equal(f.state().closed, 1);
});
await test('missing tone completion reaches its deadline and restores capture', async (t) => {
  const f = fixture(t),
    work = sendCallTestTone(f.sender, new AbortController().signal);
  const rejected = assert.rejects(work, /timed out/u);
  await flush();
  t.mock.timers.tick(1500);
  await rejected;
  assert.equal(f.replacements.at(-1), f.input);
  assert.equal(f.state().closed, 1);
});

function connectionFixture(t: TestContext, f: ReturnType<typeof fixture>) {
  function replace(target: object, key: string, value: unknown) {
    const previous = Object.getOwnPropertyDescriptor(target, key);
    Object.defineProperty(target, key, { configurable: true, value });
    t.after(() => {
      if (previous) Object.defineProperty(target, key, previous);
      else Reflect.deleteProperty(target, key);
    });
  }
  replace(globalThis, 'document', {
    createElement: () => ({ setAttribute() {}, pause() {}, remove() {} }),
  });
  replace(
    globalThis,
    'RTCPeerConnection',
    class extends EventTarget {
      addTrack() {}
      getSenders() {
        return [f.sender];
      }
      close() {}
    },
  );
  replace(navigator, 'mediaDevices', {
    getUserMedia: () =>
      Promise.resolve({
        getTracks: () => [f.input],
        getAudioTracks: () => [f.input],
      }),
  });
  t.mock.method(f.input, 'stop', () => {
    f.input.readyState = 'ended';
  });
  let failures = 0;
  const rtc = new VoiceConnection({
    changed() {},
    autoplay() {},
    failed: () => {
      failures++;
    },
  });
  t.after(() => rtc.close());
  return { rtc, failures: () => failures };
}
await test('muting cancels the cue but cannot hide a subsequent sender restoration failure', async (t) => {
  const f = fixture(t),
    c = connectionFixture(t, f);
  await c.rtc.acquire();
  c.rtc.create({});
  const work = c.rtc.sendTestTone();
  const rejected = assert.rejects(work, /synthetic restoration failure/u);
  await flush();
  t.mock.method(f.sender, 'replaceTrack', () =>
    Promise.reject(new Error('synthetic restoration failure')),
  );
  c.rtc.mute();
  await rejected;
  assert.equal(c.failures(), 1);
  assert.equal(f.input.enabled, false);
  assert.equal(f.state().closed, 1);
});
