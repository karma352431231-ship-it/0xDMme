import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import {
  inspectCallAudio,
  observeCallOutput,
} from '../src/client/calls/audio-diagnostics.ts';

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
function fixture(t: TestContext) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'MediaStream');
  const track = {
    kind: 'audio',
    enabled: true,
    muted: false,
    readyState: 'live',
    label: 'PRIVATE_MICROPHONE',
    id: 'PRIVATE_TRACK',
    getSettings: () => ({
      deviceId: 'PRIVATE_DEVICE',
      groupId: 'PRIVATE_GROUP',
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 48000,
      channelCount: 1,
    }),
  };
  class Stream {
    getAudioTracks() {
      return [track];
    }
  }
  Object.defineProperty(globalThis, 'MediaStream', {
    configurable: true,
    value: Stream,
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'MediaStream', previous);
    else Reflect.deleteProperty(globalThis, 'MediaStream');
  });
  let reads = 0,
    closed = false;
  const pc = {
    connectionState: 'connected',
    getStats: () => {
      reads++;
      return Promise.resolve(
        new Map([
          [
            'PRIVATE_STATS',
            {
              type: 'inbound-rtp',
              kind: 'audio',
              id: 'PRIVATE_STATS',
              trackIdentifier: 'PRIVATE_TRACK',
              packetsReceived: reads * 50,
              packetsLost: 2,
              concealedSamples: reads * 10,
              jitter: 0.03,
              jitterBufferDelay: reads * 0.4,
              jitterBufferEmittedCount: reads * 50,
              audioLevel: 0.9,
              totalAudioEnergy: 123,
              arbitrary: 'PRIVATE_CONTENT',
            },
          ],
          [
            'PRIVATE_CANDIDATE',
            {
              type: 'local-candidate',
              address: 'PRIVATE_ADDRESS',
              port: 12345,
              username: 'PRIVATE_CREDENTIAL',
            },
          ],
          [
            'PRIVATE_OUTBOUND',
            { type: 'outbound-rtp', kind: 'audio', packetsSent: reads * 48 },
          ],
        ]) as unknown as RTCStatsReport,
      );
    },
    getSenders: () => [{ track }],
    getReceivers: () => [{ track }],
  } as unknown as RTCPeerConnection;
  const audio = {
    paused: false,
    muted: false,
    volume: 1,
    readyState: 4,
    srcObject: new Stream(),
  } as unknown as HTMLAudioElement;
  const source = {
    pc,
    audio,
    microphone: new Stream() as unknown as MediaStream,
    guard: () => {
      if (closed) throw new Error('ended');
    },
  };
  const release = observeCallOutput(pc, audio);
  t.after(release);
  return {
    source,
    reads: () => reads,
    end: () => {
      closed = true;
      release();
    },
  };
}
async function finish(t: TestContext) {
  await flush();
  t.mock.timers.tick(500);
  await flush();
}
await test('audio report whitelists local settings/counters, keeps unsupported metrics null and excludes private/raw data', async (t) => {
  const f = fixture(t),
    work = inspectCallAudio(f.source);
  await finish(t);
  const report = await work,
    serialized = JSON.stringify(report);
  assert.doesNotMatch(
    serialized,
    /PRIVATE_|audioLevel|totalAudioEnergy|address|credential|trackIdentifier|deviceId|groupId/u,
  );
  assert.equal(report.before.rtp.inbound[0]?.['packetsReceived'], 50);
  assert.equal(report.after.rtp.inbound[0]?.['packetsReceived'], 100);
  assert.equal(report.after.rtp.inbound[0]?.['concealmentEvents'], null);
  assert.equal(report.after.capture.tracks[0]?.echoCancellation, true);
  assert.deepEqual(report.after.inventory, {
    complete: true,
    activeConnections: 1,
    playingOutputs: 1,
  });
  assert.equal(report.after.senders, 1);
  assert.equal(report.after.receivers, 1);
});
await test('ending during inspection prevents a later read and discards the report', async (t) => {
  const f = fixture(t),
    work = inspectCallAudio(f.source);
  const rejected = assert.rejects(work, /ended/u);
  await flush();
  f.end();
  t.mock.timers.tick(500);
  await rejected;
  assert.equal(f.reads(), 1);
});
await test('getStats deadline does not start multiple unresolved native requests', async (t) => {
  const f = fixture(t);
  let release!: (value: RTCStatsReport) => void;
  const mocked = t.mock.method(
    f.source.pc,
    'getStats',
    () =>
      new Promise<RTCStatsReport>((resolve) => {
        release = resolve;
      }),
  );
  const first = assert.rejects(inspectCallAudio(f.source), /timed out/u);
  const second = assert.rejects(inspectCallAudio(f.source), /timed out/u);
  t.mock.timers.tick(1200);
  await Promise.all([first, second]);
  assert.equal(mocked.mock.callCount(), 1);
  release(new Map() as RTCStatsReport);
  await flush();
});
await test('bounded output inventory marks overflow as incomplete rather than hiding extra connections', async (t) => {
  const f = fixture(t),
    releases: (() => void)[] = [];
  for (let i = 0; i < 4; i++)
    releases.push(
      observeCallOutput(
        { connectionState: 'connected' } as RTCPeerConnection,
        f.source.audio,
      ),
    );
  t.after(() => releases.forEach((release) => release()));
  const work = inspectCallAudio(f.source);
  await finish(t);
  const report = await work;
  assert.deepEqual(report.after.inventory, {
    complete: false,
    activeConnections: 5,
    playingOutputs: null,
  });
  for (const release of releases) {
    release();
    release();
  }
});

await test('oversized native reports are explicitly incomplete with bounded streams and serialization', async (t) => {
  const f = fixture(t);
  const rows = new Map(
    Array.from({ length: 600 }, (_, i) => [
      String(i),
      {
        type: 'inbound-rtp',
        kind: 'audio',
        packetsReceived: 42,
        id: 'PRIVATE_STATS',
      },
    ]),
  );
  t.mock.method(f.source.pc, 'getStats', () =>
    Promise.resolve(rows as unknown as RTCStatsReport),
  );
  const work = inspectCallAudio(f.source);
  await finish(t);
  const report = await work;
  assert.equal(report.after.rtp.complete, false);
  assert.equal(report.after.rtp.inbound.length, 4);
  assert.equal(report.after.rtp.inboundCount, 512);
  assert.ok(JSON.stringify(report).length < 16384);
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE_STATS/u);
});
