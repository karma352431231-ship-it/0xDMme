/** Explicit local inspection only. Never return raw stats, identifiers or audio. */
type Source = {
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  microphone: MediaStream;
  guard: () => void;
};
const inventory = new Map<RTCPeerConnection, HTMLAudioElement>();
let untracked = 0;
const pending = new WeakMap<RTCPeerConnection, Promise<RTCStatsReport>>();
const inboundFields = [
  'packetsReceived',
  'packetsLost',
  'jitter',
  'concealedSamples',
  'silentConcealedSamples',
  'concealmentEvents',
  'jitterBufferDelay',
  'jitterBufferEmittedCount',
  'insertedSamplesForDeceleration',
  'removedSamplesForAcceleration',
  'totalSamplesReceived',
] as const;

/** Keep at most four own live resources; overflow is explicitly incomplete. */
export function observeCallOutput(
  pc: RTCPeerConnection,
  audio: HTMLAudioElement,
) {
  const tracked = inventory.size < 4;
  if (tracked) inventory.set(pc, audio);
  else untracked++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (tracked) inventory.delete(pc);
    else untracked--;
  };
}
function outputInventory() {
  const rows = [...inventory].filter(([pc]) => pc.connectionState !== 'closed');
  return {
    complete: untracked === 0,
    activeConnections: rows.length + untracked,
    playingOutputs: untracked
      ? null
      : rows.filter(([, audio]) => !audio.paused && audio.srcObject !== null)
          .length,
  };
}
function number(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    Math.abs(value) <= Number.MAX_SAFE_INTEGER
    ? value
    : null;
}
function boolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}
function echo(value: unknown): boolean | string | null {
  if (value === 'all' || value === 'remote-only') return value;
  return boolean(value);
}
function capture(source: Source) {
  const tracks = source.microphone.getAudioTracks();
  return {
    trackCount: tracks.length,
    tracks: tracks.slice(0, 4).map((track) => {
      const settings = track.getSettings();
      return {
        enabled: track.enabled,
        sourceMuted: track.muted,
        live: track.readyState === 'live',
        echoCancellation: echo(settings.echoCancellation),
        noiseSuppression: boolean(settings.noiseSuppression),
        autoGainControl: boolean(settings.autoGainControl),
        channelCount: number(settings.channelCount),
        sampleRate: number(settings.sampleRate),
      };
    }),
  };
}
function statsRows(report: RTCStatsReport) {
  const inbound: Record<string, number | null>[] = [],
    outbound: (number | null)[] = [];
  let scanned = 0,
    inboundCount = 0,
    outboundCount = 0;
  for (const raw of report.values()) {
    if (++scanned > 512) break;
    const row = raw as Record<string, unknown>;
    if ((row['kind'] ?? row['mediaType']) !== 'audio') continue;
    if (row['type'] === 'inbound-rtp') {
      inboundCount++;
      if (inbound.length < 4)
        inbound.push(
          Object.fromEntries(
            inboundFields.map((field) => [field, number(row[field])]),
          ),
        );
    }
    if (row['type'] === 'outbound-rtp') {
      outboundCount++;
      if (outbound.length < 4) outbound.push(number(row['packetsSent']));
    }
  }
  return {
    complete: scanned <= 512 && Math.max(inboundCount, outboundCount) <= 4,
    inboundCount,
    outboundCount,
    inbound,
    outboundPacketsSent: outbound,
  };
}
async function boundedStats(pc: RTCPeerConnection): Promise<RTCStatsReport> {
  let work = pending.get(pc);
  if (!work) {
    work = pc.getStats().finally(() => pending.delete(pc));
    pending.set(pc, work);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('Audio inspection timed out.')),
      1200,
    );
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
async function sample(source: Source) {
  source.guard();
  const rows = statsRows(await boundedStats(source.pc));
  source.guard();
  const stream = source.audio.srcObject;
  return {
    inventory: outputInventory(),
    capture: capture(source),
    output: {
      paused: source.audio.paused,
      muted: source.audio.muted,
      volume: source.audio.volume,
      readyState: source.audio.readyState,
      trackCount:
        stream instanceof MediaStream ? stream.getAudioTracks().length : 0,
    },
    senders: source.pc
      .getSenders()
      .filter((sender) => sender.track?.kind === 'audio').length,
    receivers: source.pc
      .getReceivers()
      .filter((receiver) => receiver.track.kind === 'audio').length,
    rtp: rows,
  };
}
/** Two snapshots, one half-second apart. No storage, network request or recording. */
export async function inspectCallAudio(source: Source) {
  const started = performance.now();
  const before = await sample(source);
  await new Promise<void>((resolve) => setTimeout(resolve, 500));
  const after = await sample(source);
  return {
    protocol: '0xdmme-call-audio-1',
    elapsedMs: Math.round(performance.now() - started),
    before,
    after,
  };
}
