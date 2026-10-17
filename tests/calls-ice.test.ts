import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VoiceConnection } from '../src/client/calls/index.ts';

const relay =
  'a=candidate:1 1 udp 1 203.0.113.10 49160 typ relay raddr 0.0.0.0 rport 0';
const description =
  [
    'v=0',
    'o=- 1 1 IN IP4 0.0.0.0',
    's=-',
    't=0 0',
    'm=audio 9 UDP/TLS/RTP/SAVPF 111',
    'c=IN IP4 0.0.0.0',
    'a=fingerprint:sha-256 ' + Array(32).fill('AB').join(':'),
    'a=rtcp-mux',
  ].join('\r\n') + '\r\n';

await test('ICE restart waits for this offer relay even while the browser still reports prior gathering completion', async (t) => {
  const saved = new Map<object, Map<string, PropertyDescriptor | undefined>>();
  function replace(target: object, name: string, value: unknown) {
    let properties = saved.get(target);
    if (!properties) {
      properties = new Map();
      saved.set(target, properties);
    }
    properties.set(name, Object.getOwnPropertyDescriptor(target, name));
    Object.defineProperty(target, name, { configurable: true, value });
  }
  const timers: ReturnType<typeof setTimeout>[] = [];
  t.after(() => {
    for (const timer of timers) clearTimeout(timer);
    for (const [target, properties] of saved)
      for (const [name, value] of properties) {
        if (value) Object.defineProperty(target, name, value);
        else Reflect.deleteProperty(target, name);
      }
  });
  replace(globalThis, 'document', {
    createElement: () => ({ setAttribute() {}, pause() {}, remove() {} }),
  });
  const track = { addEventListener() {}, stop() {} };
  replace(navigator, 'mediaDevices', {
    getUserMedia: () =>
      Promise.resolve({
        getTracks: () => [track],
        getAudioTracks: () => [track],
      }),
  });
  let restarts = 0,
    offers = 0,
    closed = false;
  class Peer extends EventTarget {
    iceGatheringState = 'new';
    localDescription = { type: 'offer', sdp: description + relay + '\r\n' };
    addTrack() {}
    restartIce() {
      restarts++;
    }
    createOffer() {
      offers++;
      return Promise.resolve({
        type: 'offer',
        sdp: description + `a=ice-ufrag:offer${offers}\r\n`,
      });
    }
    setLocalDescription(value: { type: string; sdp: string }) {
      this.localDescription = value;
      timers.push(
        setTimeout(() => {
          this.iceGatheringState = 'gathering';
        }, 5),
      );
      timers.push(
        setTimeout(() => {
          this.localDescription.sdp += relay + '\r\n';
          this.iceGatheringState = 'complete';
        }, 25),
      );
      return Promise.resolve();
    }
    close() {
      closed = true;
    }
  }
  replace(globalThis, 'RTCPeerConnection', Peer);
  const rtc = new VoiceConnection({
    changed() {},
    failed() {
      assert.fail('Unexpected media failure');
    },
    autoplay() {},
  });
  try {
    await rtc.acquire();
    rtc.create({ iceTransportPolicy: 'relay' });
    const first = await rtc.offer();
    assert.match(first, /a=ice-ufrag:offer1/u);
    const restarted = await rtc.offer(true);
    assert.match(restarted, /a=ice-ufrag:offer2/u);
    assert.match(restarted, / typ relay/u);
    assert.equal(restarts, 1);
    assert.equal(offers, 2);
  } finally {
    rtc.close();
  }
  assert.equal(closed, true);
});
