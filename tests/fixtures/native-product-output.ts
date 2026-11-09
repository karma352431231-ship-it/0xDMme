const uuid = '[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}';
const identity = new RegExp(`^${uuid}$`, 'u');
const community = new RegExp(
  `^#comunidades\\?id=${uuid}(?:&post=${uuid})?$`,
  'u',
);
const invitation = new RegExp(
  `^https://0xdmme\\.app/#contatos\\?convite=${uuid}\\.[a-f0-9]{64}$`,
  'u',
);
const outputs: ReadonlyMap<string, RegExp> = new Map([
  ['invite-create', invitation],
  ['community-create', community],
  ['community-post', community],
  ['contact-discovery-prepare', /^(?:invite|wallet|contacts)$/u],
  ...[
    'message-send',
    'message-receive',
    'message-edit',
    'message-reply',
    'message-reply-receive',
    'message-read-receipt',
    'attachment-send',
    'attachment-receive',
    'attachment-recover-own',
    'attachment-pick-send',
    'group-send',
    'group-receive',
    'social-voice-receive',
  ].map((name): [string, RegExp] => [name, identity]),
]);

function fields(value: string, keys: string): Record<string, unknown> {
  const raw = JSON.parse(value) as unknown;
  if (
    !raw ||
    typeof raw !== 'object' ||
    Object.keys(raw).sort().join(',') !== keys
  )
    throw new Error('Invalid synthetic native output fields.');
  return raw as Record<string, unknown>;
}

function pinOutput(value: string): string {
  const raw = fields(value, 'initiallyPinned,peer');
  if (
    typeof raw['peer'] !== 'string' ||
    !raw['peer'].startsWith('Synthetic iPhone ') ||
    typeof raw['initiallyPinned'] !== 'boolean'
  )
    throw new Error('Invalid synthetic native setting output.');
  return String(raw['initiallyPinned']);
}

function duration(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > 90
  )
    throw new Error('Invalid synthetic native recording duration.');
  return value;
}

function voiceOutput(value: string): string {
  const raw = fields(value, 'duration,id');
  if (
    typeof raw['id'] !== 'string' ||
    !identity.test(raw['id']) ||
    raw['id'].trim() !== raw['id']
  )
    throw new Error('Invalid synthetic native voice output.');
  return JSON.stringify({ id: raw['id'], duration: duration(raw['duration']) });
}

/** Only synthetic cross-installation metadata may leave a DOM action. Text,
 * decrypted content, cookies, key material and arbitrary URLs are never outputs.
 * The native observer independently validates and privately stores this value.
 */
export function nativeProductOutput(action: string, value: string): string {
  if (action === 'conversation-pin') return pinOutput(value);
  if (action === 'social-voice-send') return voiceOutput(value);
  const pattern = outputs.get(action);
  if (!pattern) return '';
  if (value.length > 1024 || value.trim() !== value || !pattern.test(value))
    throw new Error('Invalid synthetic native action output.');
  return value;
}
