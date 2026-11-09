import { AccountError, keys, object, uuid } from '../account/index.ts';
import { fingerprint } from '../devices/index.ts';
import { integer } from '../vault/index.ts';

export interface MessageRelation {
  id: string;
  hash: string;
  author: string;
  type: 'edit' | 'reaction';
}
export function messageRelation(input: unknown): MessageRelation {
  const d = object(input);
  keys(d, ['id', 'hash', 'author', 'type']);
  if (d['type'] !== 'edit' && d['type'] !== 'reaction')
    throw new AccountError(400, 'Invalid message relationship.');
  return {
    id: uuid(d['id']),
    hash: fingerprint(d['hash']),
    author: uuid(d['author']),
    type: d['type'],
  };
}
export function optionalRelation(input: unknown): {
  relation?: MessageRelation;
} {
  return input === undefined ? {} : { relation: messageRelation(input) };
}
export function relationKeys(input: Record<string, unknown>): string[] {
  return Object.hasOwn(input, 'relation') ? ['relation'] : [];
}
export interface DailyPreferences {
  online: boolean;
  lastSeen: boolean;
  readReceipts: boolean;
}
export const privateDefaults: DailyPreferences = {
  online: false,
  lastSeen: false,
  readReceipts: false,
};
export function dailyPreferences(input: unknown): DailyPreferences {
  const d = object(input);
  keys(d, ['online', 'lastSeen', 'readReceipts']);
  for (const k of Object.keys(privateDefaults))
    if (typeof d[k] !== 'boolean')
      throw new AccountError(400, 'Invalid preference.');
  return {
    online: d['online'] as boolean,
    // Kept in the wire format for old clients; last access is no longer shared.
    lastSeen: false,
    readReceipts: d['readReceipts'] as boolean,
  };
}
export interface ConversationSettings {
  mutedUntil: number;
  archived: boolean;
  pinned: boolean;
}
export function conversationSettings(input: unknown): ConversationSettings {
  const d = object(input);
  keys(d, ['mutedUntil', 'archived', 'pinned']);
  if (typeof d['archived'] !== 'boolean' || typeof d['pinned'] !== 'boolean')
    throw new AccountError(400, 'Invalid configuration.');
  return {
    mutedUntil: integer(d['mutedUntil'], Number.MAX_SAFE_INTEGER),
    archived: d['archived'],
    pinned: d['pinned'],
  };
}
/** Concurrent copies retain silence/archive until an explicit new user choice joins their heads. */
export function mergeConversationSettings(
  values: readonly ConversationSettings[],
): ConversationSettings {
  return values.reduce(
    (merged, value) => ({
      mutedUntil: Math.max(merged.mutedUntil, value.mutedUntil),
      archived: merged.archived || value.archived,
      pinned: merged.pinned || value.pinned,
    }),
    { mutedUntil: 0, archived: false, pinned: false },
  );
}
export interface PushRegistration {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}
/** Fixed vendor origins prevent user-selected relays and requests to private hosts. */
export function pushRegistration(input: unknown): PushRegistration {
  const d = object(input),
    k = object(d['keys']);
  keys(d, ['endpoint', 'keys']);
  keys(k, ['p256dh', 'auth']);
  if (typeof d['endpoint'] !== 'string' || d['endpoint'].length > 2048)
    throw new AccountError(400, 'Invalid endpoint.');
  const u = pushEndpoint(d['endpoint']);
  if (
    typeof k['p256dh'] !== 'string' ||
    !/^[A-Za-z0-9_-]{87}$/u.test(k['p256dh']) ||
    typeof k['auth'] !== 'string' ||
    !/^[A-Za-z0-9_-]{22}$/u.test(k['auth'])
  )
    throw new AccountError(400, 'Invalid subscription keys.');
  return { endpoint: u.href, keys: { p256dh: k['p256dh'], auth: k['auth'] } };
}
function pushEndpoint(value: string): URL {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw new AccountError(400, 'Invalid endpoint.');
  }
  if (
    !pushVendor(u.hostname) ||
    u.protocol !== 'https:' ||
    u.port ||
    u.username ||
    u.password ||
    u.hash
  )
    throw new AccountError(400, 'Push service not supported.');
  return u;
}
function pushVendor(hostname: string): boolean {
  return (
    hostname === 'fcm.googleapis.com' ||
    hostname === 'updates.push.services.mozilla.com' ||
    hostname === 'web.push.apple.com' ||
    /^[a-z0-9-]+\.notify\.windows\.com$/u.test(hostname)
  );
}
export const genericNotification = {
  title: '0xDMme',
  body: 'New activity. Open the app to sync.',
} as const;

export interface PushPreferences {
  messages: boolean;
  calls: boolean;
  showCalls: boolean;
}
export const defaultPushPreferences: PushPreferences = {
  messages: true,
  calls: true,
  showCalls: true,
};
export function pushPreferences(input: unknown): PushPreferences {
  const d = object(input);
  keys(d, ['messages', 'calls', 'showCalls']);
  if (
    typeof d['messages'] !== 'boolean' ||
    typeof d['calls'] !== 'boolean' ||
    typeof d['showCalls'] !== 'boolean'
  )
    throw new AccountError(400, 'Invalid push preferences.');
  return {
    messages: d['messages'],
    calls: d['calls'],
    showCalls: d['showCalls'],
  };
}

export interface DailyText {
  text: string;
  reply: string | null;
  forwarded: boolean;
  viewOnce?: {
    hash: string;
    policy: 'mobile' | 'file';
    file?: { name: string; mime: string; bytes: number };
  };
}
function viewOnceTextMetadata(
  input: unknown,
): NonNullable<DailyText['viewOnce']> {
  const value = object(input);
  keys(value, [
    'hash',
    'policy',
    ...(Object.hasOwn(value, 'file') ? ['file'] : []),
  ]);
  const hash = fingerprint(value['hash']);
  if (value['policy'] !== 'mobile' && value['policy'] !== 'file')
    throw new Error('Invalid view-once display.');
  const policy = value['policy'];
  if (!Object.hasOwn(value, 'file')) {
    if (policy !== 'mobile')
      throw new Error('View-once file metadata missing.');
    return { hash, policy };
  }
  return { hash, policy, file: viewOnceFileMetadata(value['file']) };
}
function viewOnceFileMetadata(
  input: unknown,
): NonNullable<NonNullable<DailyText['viewOnce']>['file']> {
  const file = object(input);
  keys(file, ['name', 'mime', 'bytes']);
  if (
    typeof file['name'] !== 'string' ||
    !file['name'] ||
    file['name'].length > 255 ||
    /[\p{Cc}]/u.test(file['name']) ||
    typeof file['mime'] !== 'string' ||
    file['mime'].length > 128
  )
    throw new Error('Invalid view-once file metadata.');
  const bytes = integer(file['bytes'], 10_000_000);
  if (!bytes) throw new Error('Invalid view-once file metadata.');
  return { name: file['name'], mime: file['mime'], bytes };
}
function assertSeparatedContent(
  value: Pick<DailyText, 'text' | 'forwarded' | 'viewOnce'>,
): void {
  if (value.viewOnce && (value.text !== '' || value.forwarded))
    throw new Error('View-once content must be separate from history.');
}
const prefix = '\u001e0xdmme:1:';
export function encodeDailyText(value: DailyText): string {
  assertSeparatedContent(value);
  if (new TextEncoder().encode(value.text).length > 16000)
    throw new Error('Write up to 16 KB of text.');
  return (
    prefix +
    JSON.stringify({
      text: value.text,
      reply: value.reply === null ? null : uuid(value.reply),
      forwarded: value.forwarded,
      ...(value.viewOnce
        ? { viewOnce: viewOnceTextMetadata(value.viewOnce) }
        : {}),
    })
  );
}
export function decodeDailyText(value: string): DailyText {
  if (!value.startsWith(prefix))
    return { text: value, reply: null, forwarded: false };
  const d = object(JSON.parse(value.slice(prefix.length)) as unknown);
  keys(d, [
    'text',
    'reply',
    'forwarded',
    ...(Object.hasOwn(d, 'viewOnce') ? ['viewOnce'] : []),
  ]);
  if (
    typeof d['text'] !== 'string' ||
    typeof d['forwarded'] !== 'boolean' ||
    new TextEncoder().encode(d['text']).length > 16000
  )
    throw new Error('Invalid daily content.');
  const viewOnce = Object.hasOwn(d, 'viewOnce')
    ? viewOnceTextMetadata(d['viewOnce'])
    : undefined;
  assertSeparatedContent({
    text: d['text'],
    forwarded: d['forwarded'],
    ...(viewOnce ? { viewOnce } : {}),
  });
  return {
    text: d['text'],
    reply: d['reply'] === null ? null : uuid(d['reply']),
    forwarded: d['forwarded'],
    ...(viewOnce ? { viewOnce } : {}),
  };
}

// Transport validation uses Unicode structure, independently of the artwork catalog.
// Accept one core/tag/ZWJ sequence, including tones, flags and keycaps, not prose.
const emojiBase =
  '(?![0-9#*]|\\p{Regional_Indicator}|\\p{Emoji_Modifier})[\\p{Emoji}\\p{Extended_Pictographic}][\\uFE0E\\uFE0F]?\\p{Emoji_Modifier}?';
const emojiCore = `(?:${emojiBase}|[0-9#*]\\uFE0F?\\u20E3|\\p{Regional_Indicator}{2})`;
const emojiElement = `(?:${emojiCore}|\\u{1F3F4}[\\u{E0061}-\\u{E007A}]{2,7}\\u{E007F})`;
const emojiSequence = new RegExp(
  `^${emojiElement}(?:\\u200D${emojiElement})*(?![\\s\\S])`,
  'u',
);
export function validReaction(value: string): boolean {
  return (
    value === '' ||
    (new TextEncoder().encode(value).length <= 128 && emojiSequence.test(value))
  );
}
