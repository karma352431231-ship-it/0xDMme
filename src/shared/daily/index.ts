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
    throw new AccountError(400, 'Relação de mensagem inválida.');
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
      throw new AccountError(400, 'Preferência inválida.');
  return {
    online: d['online'] as boolean,
    lastSeen: d['lastSeen'] as boolean,
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
    throw new AccountError(400, 'Configuração inválida.');
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
    throw new AccountError(400, 'Endpoint inválido.');
  const u = pushEndpoint(d['endpoint']);
  if (
    typeof k['p256dh'] !== 'string' ||
    !/^[A-Za-z0-9_-]{87}$/u.test(k['p256dh']) ||
    typeof k['auth'] !== 'string' ||
    !/^[A-Za-z0-9_-]{22}$/u.test(k['auth'])
  )
    throw new AccountError(400, 'Chaves de inscrição inválidas.');
  return { endpoint: u.href, keys: { p256dh: k['p256dh'], auth: k['auth'] } };
}
function pushEndpoint(value: string): URL {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw new AccountError(400, 'Endpoint inválido.');
  }
  if (
    !pushVendor(u.hostname) ||
    u.protocol !== 'https:' ||
    u.port ||
    u.username ||
    u.password ||
    u.hash
  )
    throw new AccountError(400, 'Serviço push não suportado.');
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
  body: 'Há nova atividade. Abra o app para sincronizar.',
} as const;

export interface DailyText {
  text: string;
  reply: string | null;
  forwarded: boolean;
}
const prefix = '\u001e0xdmme:1:';
export function encodeDailyText(value: DailyText): string {
  if (new TextEncoder().encode(value.text).length > 16000)
    throw new Error('Escreva até 16 KB de texto.');
  return (
    prefix +
    JSON.stringify({
      text: value.text,
      reply: value.reply === null ? null : uuid(value.reply),
      forwarded: value.forwarded,
    })
  );
}
export function decodeDailyText(value: string): DailyText {
  if (!value.startsWith(prefix))
    return { text: value, reply: null, forwarded: false };
  const d = object(JSON.parse(value.slice(prefix.length)) as unknown);
  keys(d, ['text', 'reply', 'forwarded']);
  if (
    typeof d['text'] !== 'string' ||
    typeof d['forwarded'] !== 'boolean' ||
    new TextEncoder().encode(d['text']).length > 16000
  )
    throw new Error('Conteúdo diário inválido.');
  return {
    text: d['text'],
    reply: d['reply'] === null ? null : uuid(d['reply']),
    forwarded: d['forwarded'],
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
