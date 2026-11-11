import { installedApplication } from '../application-origin/index.ts';
import { encode } from '../../shared/account/index.ts';
import { timedLoad, timedLoadSync } from '../chat-sync-diagnostics/index.ts';
import type { LoadTrace } from '../chat-sync-diagnostics/index.ts';

export interface NativeVideoPort {
  begin(input: { id: string; mime: string; bytes: number }): Promise<void>;
  append(input: { id: string; offset: number; bytes: string }): Promise<void>;
  show(input: { id: string }): Promise<void>;
  status(input: { id: string }): Promise<'open' | 'closed' | 'failed'>;
  close(input: { id: string }): Promise<void>;
  presented(input: { id: string; signal: AbortSignal }): Promise<{
    state: 'native-draw' | 'video-frame' | 'unavailable' | 'timeout';
    elapsedMs: number;
  }>;
}
export interface NativeVideoInput {
  bytes: Uint8Array<ArrayBuffer>;
  mime: string;
  current: () => boolean;
  signal?: AbortSignal | undefined;
  diagnostic?: LoadTrace | undefined;
}
let installed: NativeVideoPort | null = null;
export function installNativeVideo(port: NativeVideoPort): void {
  if (!installedApplication() || installed)
    throw new Error('Native video is unavailable.');
  installed = port;
}

/** One chat video presentation. Owns cancellation until native dismissal;
 * the caller's bytes are wiped after acknowledged transfer and on any failure. */
export class NativeVideoPlayback {
  private active: AbortController | null = null;
  private readonly port: () => NativeVideoPort | null;
  constructor(port: () => NativeVideoPort | null = () => installed) {
    this.port = port;
  }
  close(): void {
    this.active?.abort();
  }
  async play(input: NativeVideoInput): Promise<boolean> {
    const port = this.port();
    if (!port) return false;
    if (this.active) {
      input.bytes.fill(0);
      throw new Error('Close the current video first.');
    }
    if (!input.bytes.length || input.bytes.length > 10_000_000) {
      input.bytes.fill(0);
      throw new Error('Invalid video size.');
    }
    const controller = new AbortController();
    this.active = controller;
    const signal = playbackSignal(controller, input.signal);
    const id = crypto.randomUUID();
    const guard = () => {
      signal.throwIfAborted();
      if (!input.current())
        throw new DOMException('Video closed.', 'AbortError');
    };
    try {
      guard();
      await timedLoad(input.diagnostic, 'native-begin', () =>
        port.begin({ id, mime: input.mime, bytes: input.bytes.length }),
      );
      await transfer({ input, port, id, guard });
      guard();
      await timedLoad(input.diagnostic, 'native-show', () => port.show({ id }));
      guard();
      await reportFrame({ input, port, id, signal });
      return await waitForDismissal({ port, id, signal, guard });
    } catch (error: unknown) {
      if (signal.aborted || !input.current()) {
        input.diagnostic?.point('cancelled', { loadOutcome: 'cancelled' });
        return true;
      }
      input.diagnostic?.point('failed', { loadOutcome: 'failed' });
      throw error;
    } finally {
      input.bytes.fill(0);
      try {
        await port.close({ id });
      } finally {
        this.active = null;
      }
    }
  }
}
function playbackSignal(
  controller: AbortController,
  row?: AbortSignal,
): AbortSignal {
  return row ? AbortSignal.any([controller.signal, row]) : controller.signal;
}
async function waitForDismissal({
  port,
  id,
  signal,
  guard,
}: {
  port: NativeVideoPort;
  id: string;
  signal: AbortSignal;
  guard: () => void;
}): Promise<boolean> {
  for (;;) {
    guard();
    const status = await port.status({ id });
    guard();
    if (status !== 'open') return status === 'closed';
    await wait(signal);
  }
}
async function transfer({
  input,
  port,
  id,
  guard,
}: {
  input: NativeVideoInput;
  port: NativeVideoPort;
  id: string;
  guard: () => void;
}): Promise<void> {
  const bytes = input.bytes;
  input.diagnostic?.point('native-transfer', {
    loadTransferPlannedBytes: bytes.length,
    loadTransferPlannedBlocks: Math.ceil(bytes.length / 65536),
    loadTransferBytes: 0,
    loadTransferBlocks: 0,
  });
  try {
    for (let offset = 0; offset < bytes.length; offset += 65536) {
      guard();
      const part = bytes.subarray(offset, offset + 65536);
      const encoded = timedLoadSync(
        input.diagnostic,
        'native-payload-encode',
        () => encode(part),
      );
      await timedLoad(input.diagnostic, 'native-append', () =>
        port.append({ id, offset, bytes: encoded }),
      );
      guard();
      input.diagnostic?.point('native-transfer', {
        loadTransferBytes: offset + part.length,
        loadTransferBlocks: Math.floor(offset / 65536) + 1,
      });
    }
  } finally {
    bytes.fill(0);
  }
}
async function reportFrame({
  input,
  port,
  id,
  signal,
}: {
  input: NativeVideoInput;
  port: NativeVideoPort;
  id: string;
  signal: AbortSignal;
}): Promise<void> {
  if (!input.diagnostic) return;
  try {
    const frame = await port.presented({ id, signal });
    const ready = frame.state === 'video-frame';
    input.diagnostic.point('native-frame', {
      loadStageMs: frame.elapsedMs,
      loadPresentation: ready ? 'video-frame' : 'unavailable',
    });
    input.diagnostic.point('complete', {
      loadOutcome: ready
        ? 'complete'
        : frame.state === 'timeout'
          ? 'timeout'
          : 'unavailable',
    });
  } catch {
    input.diagnostic.point('complete', {
      loadOutcome: signal.aborted ? 'cancelled' : 'unavailable',
    });
  }
}
function wait(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, 250);
    signal.addEventListener('abort', done, { once: true });
    if (signal.aborted) done();
  });
}
