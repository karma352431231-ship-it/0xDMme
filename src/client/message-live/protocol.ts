import { isLiveChangeCategory } from '../../shared/live-changes/index.ts';
import type { LiveChangeCategory } from '../../shared/live-changes/index.ts';

export type LiveControlEvent =
  | 'ready'
  | 'changed'
  | 'call'
  | 'removed'
  | 'authorization'
  | 'invalidated'
  | 'revoked'
  | 'ended';
export type LiveEvent = LiveControlEvent | LiveChangeCategory;
export type LiveUpdate = 'probe' | 'refresh';

export function isLiveEvent(value: string): value is LiveEvent {
  return (
    isLiveChangeCategory(value) ||
    [
      'ready',
      'changed',
      'call',
      'removed',
      'authorization',
      'invalidated',
      'revoked',
      'ended',
    ].includes(value)
  );
}

export class WakeupFrames {
  private readonly decoder = new TextDecoder('utf-8', { fatal: true });
  private buffer = '';
  accept(bytes: Uint8Array): LiveEvent[] {
    if (bytes.length > 4096)
      throw new Error('Update notice exceeds the limit.');
    this.buffer += this.decoder.decode(bytes, { stream: true });
    const frames = this.buffer.split('\n\n');
    this.buffer = frames.pop() ?? '';
    if (this.buffer.length > 128) throw new Error('Update notice incomplete.');
    return frames.flatMap((frame) => {
      if (frame === ': heartbeat') return [];
      const match = /^event: ([a-z-]+)\ndata: \{\}$/u.exec(frame);
      const event = match?.[1];
      if (!event || !isLiveEvent(event))
        throw new Error('Invalid update notice.');
      return [event];
    });
  }
}

export type LivePhase =
  'paused' | 'connecting' | 'connected' | 'unavailable' | 'authorization';
export interface LiveSnapshot {
  phase: LivePhase;
  activity: number | null;
}
export function liveCurrent(snapshot: LiveSnapshot): boolean {
  if (snapshot.phase !== 'connected' || snapshot.activity === null)
    return false;
  const age = Date.now() - snapshot.activity;
  return age >= 0 && age < 15000;
}
export function terminalLiveEvent(event: LiveEvent): boolean {
  return ['invalidated', 'revoked', 'ended'].includes(event);
}
