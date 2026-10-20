import { AccountError, keys, object, uuid } from '../account/index.ts';
import { canonical, fingerprint, sealedSecret } from '../devices/index.ts';
import type { SealedSecret } from '../devices/index.ts';
import { integer } from '../vault/index.ts';

export const ringMs = 60_000;
export const leaseMs = 20_000;
export const pollMs = 5_000;
export type MediaState = 'idle' | 'connecting' | 'connected' | 'disconnected';
export interface CallView {
  id: string;
  peer: string;
  caller: boolean;
  peerDevice: string | null;
  peerDirectory: string;
  phase: 'ringing' | 'connecting' | 'active';
  deadline: number | null;
  authorizedFor: number;
  sequence: number;
  signal: SealedSecret | null;
  invitation?: SealedSecret | null;
}
export interface CallSnapshot {
  invitation?: boolean;
  configured: boolean;
  enabled: boolean;
  revision: number;
  call: CallView | null;
}
export interface CallDescription {
  id: string;
  from: string;
  fromDevice: string;
  to: string;
  toDevice: string;
  fromDirectory: string;
  toDirectory: string;
  sequence: number;
  type: 'offer' | 'answer' | 'invite';
  sdp: string;
  signature: string;
}
export function callContext(id: string, device: string): unknown[] {
  return ['0xdmme-voice-call', 1, id, device];
}
export function descriptionBody(
  value: Omit<CallDescription, 'signature'>,
): string {
  return canonical(['0xdmme-voice-description', 1, value]);
}
export function mediaState(value: unknown): MediaState {
  if (
    !['idle', 'connecting', 'connected', 'disconnected'].includes(String(value))
  )
    throw new AccountError(400, 'Invalid call state.');
  return value as MediaState;
}
export function callDescription(input: unknown): CallDescription {
  const d = object(input);
  keys(d, [
    'id',
    'from',
    'fromDevice',
    'to',
    'toDevice',
    'fromDirectory',
    'toDirectory',
    'sequence',
    'type',
    'sdp',
    'signature',
  ]);
  if (!['offer', 'answer', 'invite'].includes(String(d['type'])))
    throw new AccountError(400, 'Invalid negotiation.');
  if (typeof d['signature'] !== 'string' || d['signature'].length > 128)
    throw new AccountError(400, 'Invalid signature.');
  return {
    id: uuid(d['id']),
    from: uuid(d['from']),
    fromDevice: uuid(d['fromDevice']),
    to: uuid(d['to']),
    toDevice: uuid(d['toDevice']),
    fromDirectory: fingerprint(d['fromDirectory']),
    toDirectory: fingerprint(d['toDirectory']),
    sequence: integer(d['sequence'], Number.MAX_SAFE_INTEGER),
    type: d['type'] as CallDescription['type'],
    sdp: d['type'] === 'invite' ? invitationSdp(d) : relaySdp(d['sdp']),
    signature: d['signature'],
  };
}
function invitationSdp(d: Record<string, unknown>): string {
  if (d['sdp'] !== '' || d['sequence'] !== 0)
    throw new AccountError(400, 'Invalid call invitation.');
  return '';
}
/** Remove ICE related addresses before sharing; reject all non-relay candidates. */
export function relaySdp(input: unknown): string {
  if (
    typeof input !== 'string' ||
    input.length > 6000 ||
    /[^\x20-\x7e\r\n]/u.test(input)
  )
    throw new AccountError(400, 'Invalid audio description.');
  const lines = input.trim().split(/\r?\n/u);
  const media = lines.filter((s) => s.startsWith('m='));
  if (
    media.length !== 1 ||
    !/^m=audio \d+ UDP\/TLS\/RTP\/SAVPF /u.test(media[0] ?? '')
  )
    throw new AccountError(400, 'Only WebRTC audio is allowed.');
  if (
    !lines.some((s) =>
      /^a=fingerprint:sha-256 (?:[A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$/u.test(s),
    )
  )
    throw new AccountError(400, 'Media fingerprint missing.');
  if (!lines.some((s) => s.startsWith('a=candidate:')))
    throw new AccountError(400, 'TURN did not provide a relay candidate.');
  return lines.map(safeSdpLine).filter(Boolean).join('\r\n') + '\r\n';
}
function safeSdpLine(line: string): string {
  if (line.startsWith('a=candidate:')) return relayCandidate(line);
  if (line.startsWith('o=')) {
    if (!/^o=\S+ \d+ \d+ IN IP[46] \S+$/u.test(line))
      throw new AccountError(400, 'Invalid media origin.');
    return line.replace(/IN IP[46] \S+$/u, 'IN IP4 0.0.0.0');
  }
  if (line.startsWith('c=')) return 'c=IN IP4 0.0.0.0';
  if (line.startsWith('a=rtcp:'))
    return line.replace(/ IN IP[46] \S+$/u, ' IN IP4 0.0.0.0');
  // Browser-specific identifiers never need network addresses or application links.
  if (/^(?:a=remote-candidates:|a=ice-options:.*trickle|u=|e=|p=)/u.test(line))
    return line.startsWith('a=ice-options:')
      ? 'a=ice-options:renomination'
      : '';
  return line;
}
export function relayCandidate(line: string): string {
  const parts = line.trim().split(/\s+/u);
  if (parts.length < 8 || parts[6] !== 'typ' || parts[7] !== 'relay')
    throw new AccountError(400, 'Non-relay candidate rejected.');
  if (!['udp', 'tcp'].includes(String(parts[2]).toLowerCase()))
    throw new AccountError(400, 'Invalid ICE transport.');
  if (!/^[0-9a-fA-F:.]+$/u.test(parts[4] ?? ''))
    throw new AccountError(400, 'Invalid relay address.');
  for (let i = 8; i < parts.length; i += 2) {
    if (parts[i] === 'raddr') parts[i + 1] = '0.0.0.0';
    if (parts[i] === 'rport') parts[i + 1] = '0';
  }
  return parts.join(' ');
}
export function callSnapshot(input: unknown): CallSnapshot {
  const d = object(input);
  keys(d, [
    'configured',
    'enabled',
    'revision',
    'call',
    ...(Object.hasOwn(d, 'invitation') ? ['invitation'] : []),
  ]);
  if (Object.hasOwn(d, 'invitation') && d['invitation'] !== true)
    throw new AccountError(400, 'Invalid call capability.');
  if (typeof d['configured'] !== 'boolean' || typeof d['enabled'] !== 'boolean')
    throw new AccountError(400, 'Invalid call preference.');
  return {
    ...(d['invitation'] === true ? { invitation: true } : {}),
    configured: d['configured'],
    enabled: d['enabled'],
    revision: integer(d['revision'], Number.MAX_SAFE_INTEGER),
    call: d['call'] === null ? null : callView(d['call']),
  };
}
function callView(input: unknown): CallView {
  const d = object(input);
  keys(d, [
    'id',
    'peer',
    'caller',
    'peerDevice',
    'peerDirectory',
    'phase',
    'deadline',
    'authorizedFor',
    'sequence',
    'signal',
    ...(Object.hasOwn(d, 'invitation') ? ['invitation'] : []),
  ]);
  if (
    typeof d['caller'] !== 'boolean' ||
    !['ringing', 'connecting', 'active'].includes(String(d['phase']))
  )
    throw new AccountError(400, 'Invalid call.');
  return {
    id: uuid(d['id']),
    peer: uuid(d['peer']),
    caller: d['caller'],
    peerDevice: d['peerDevice'] === null ? null : uuid(d['peerDevice']),
    peerDirectory: fingerprint(d['peerDirectory']),
    phase: d['phase'] as CallView['phase'],
    deadline:
      d['deadline'] === null
        ? null
        : integer(d['deadline'], Number.MAX_SAFE_INTEGER),
    authorizedFor: integer(d['authorizedFor'], leaseMs),
    sequence: integer(d['sequence'], Number.MAX_SAFE_INTEGER),
    signal: d['signal'] === null ? null : sealedSecret(d['signal']),
    ...(Object.hasOwn(d, 'invitation')
      ? {
          invitation:
            d['invitation'] === null ? null : sealedSecret(d['invitation']),
        }
      : {}),
  };
}
