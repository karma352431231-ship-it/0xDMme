import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { EmojiRow } from '../client/emoji/index.ts';
import type { AppLanguage } from '../shared/i18n/index.ts';
import { emojiAnnotations, emojiNames } from './frontend-emoji-locales.ts';
import type { EmojiAnnotations } from './frontend-emoji-locales.ts';

const digest =
  'd7a2c1166a29ac85606f146f0ebf025606cc1ba0e597c6ef38cf0c691968b80a';
export const emojiAsset = `emoji-${digest.slice(0, 16)}.json.gz`;

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Dados de emoji inválidos.');
  return value as Record<string, unknown>;
}
function graphicsKey(
  emoji: string,
  svg: Record<string, unknown>,
): string | null {
  const full = [...emoji]
    .map((cp) => cp.codePointAt(0)?.toString(16))
    .join('-');
  const key = full
    .split('-')
    .filter((cp) => cp !== 'fe0f')
    .join('-');
  if (typeof svg[full] === 'string') return full;
  return typeof svg[key] === 'string' ? key : null;
}
function catalog(
  pack: Record<string, unknown>,
  localized: {
    annotations: EmojiAnnotations;
    language: AppLanguage;
  },
): EmojiRow[] {
  if (typeof pack['emojiTest'] !== 'string')
    throw new Error('Catálogo ausente.');
  const svg = record(pack['svg']);
  const rows: EmojiRow[] = [];
  const groups = [
    'Smileys & Emotion',
    'People & Body',
    'Animals & Nature',
    'Food & Drink',
    'Travel & Places',
    'Activities',
    'Objects',
    'Symbols',
    'Flags',
  ];
  let group = -1;
  for (const line of pack['emojiTest'].split('\n')) {
    if (line.startsWith('# group:'))
      group = groups.indexOf(line.slice(9).trim());
    const match =
      /^([0-9A-F ]+)\s*; fully-qualified\s*# (\S+) E[\d.]+ (.+)$/u.exec(line);
    if (!match?.[2] || !match[3]) continue;
    const emoji = match[2];
    const [name, keywords] = emojiNames({
      annotations: localized.annotations[localized.language],
      language: localized.language,
      emoji,
      fallback: match[3],
    });
    rows.push([emoji, name, keywords, group, graphicsKey(emoji, svg)]);
  }
  if (rows.length !== 3963 || rows.filter((row) => !row[4]).length !== 19)
    throw new Error('Repertório de emojis alterado sem revisão.');
  return rows;
}

/** One offline, pinned pack is both runtime artwork and corresponding original data. */
export async function frontendEmoji(
  root: string,
): Promise<{ content: Uint8Array; catalog: Record<AppLanguage, EmojiRow[]> }> {
  const path = resolve(root, 'vendor/emoji/assets.json.gz');
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 2 * 1024 * 1024)
    throw new Error('Pacote de emojis inválido.');
  const content = await readFile(path);
  if (createHash('sha256').update(content).digest('hex') !== digest)
    throw new Error('Pacote de emojis alterado sem revisão.');
  const pack = record(
    JSON.parse(
      gunzipSync(content, { maxOutputLength: 12 * 1024 * 1024 }).toString(),
    ) as unknown,
  );
  if (pack['version'] !== 1 || Object.keys(record(pack['svg'])).length !== 4009)
    throw new Error('Desenhos de emojis ausentes.');
  const annotations = await emojiAnnotations(root);
  return {
    content,
    catalog: {
      en: catalog(pack, { annotations, language: 'en' }),
      'zh-CN': catalog(pack, { annotations, language: 'zh-CN' }),
    },
  };
}
