export type LiveEvent =
  | 'ready'
  | 'changed'
  | 'call'
  | 'removed'
  | 'authorization'
  | 'invalidated'
  | 'revoked'
  | 'ended';
export type LiveUpdate = 'probe' | 'refresh';

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
      const match =
        /^event: (ready|changed|call|removed|authorization|invalidated|revoked|ended)\ndata: \{\}$/u.exec(
          frame,
        );
      if (!match) throw new Error('Invalid update notice.');
      return [match[1] as LiveEvent];
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
