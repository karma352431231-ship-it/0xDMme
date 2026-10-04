import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { EmojiRow } from '../client/emoji/index.ts';

const digest =
  'd7a2c1166a29ac85606f146f0ebf025606cc1ba0e597c6ef38cf0c691968b80a';
export const emojiAsset = `emoji-${digest.slice(0, 16)}.json.gz`;

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Dados de emoji inválidos.');
  return value as Record<string, unknown>;
}
function annotationMap(value: unknown, field: string): Record<string, unknown> {
  return record(record(record(value)[field])['annotations']);
}
function strings(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.some((v: unknown) => typeof v !== 'string')
  )
    throw new Error('Anotação de emoji inválida.');
  return value as string[];
}
function translatedName(fallback: string): string {
  const names = new Map([
    ['cracking face', 'rosto rachando'],
    ['leftwards thumb sign', 'polegar apontando para esquerda'],
    ['rightwards thumb sign', 'polegar apontando para direita'],
    ['monarch butterfly', 'borboleta monarca'],
    ['pickle', 'picles'],
    ['lighthouse', 'farol'],
    ['meteor', 'meteoro'],
    ['eraser', 'borracha'],
    ['net with handle', 'rede com cabo'],
  ]);
  const tones = new Map([
    ['light skin tone', 'pele clara'],
    ['medium-light skin tone', 'pele morena clara'],
    ['medium skin tone', 'pele morena'],
    ['medium-dark skin tone', 'pele morena escura'],
    ['dark skin tone', 'pele escura'],
  ]);
  const [name, tone] = fallback.split(': ');
  const translated = names.get(name ?? '') ?? name ?? fallback;
  return tone ? `${translated}: ${tones.get(tone) ?? tone}` : translated;
}
function names(
  data: Record<string, unknown>,
  emoji: string,
  fallback: string,
): [string, string] {
  const annotation = data[emoji] ?? data[emoji.replaceAll('\uFE0F', '')];
  if (!annotation) return [translatedName(fallback), fallback];
  const row = record(annotation);
  return [
    strings(row['tts'])[0] ?? fallback,
    strings(row['default']).join(' '),
  ];
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
function catalog(pack: Record<string, unknown>): EmojiRow[] {
  if (typeof pack['emojiTest'] !== 'string')
    throw new Error('Catálogo ausente.');
  const annotations = {
    ...annotationMap(pack['annotations'], 'annotations'),
    ...annotationMap(pack['derived'], 'annotationsDerived'),
  };
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
    const [name, keywords] = names(annotations, emoji, match[3]);
    rows.push([
      emoji,
      name,
      `${keywords} ${match[3]}`,
      group,
      graphicsKey(emoji, svg),
    ]);
  }
  if (rows.length !== 3963 || rows.filter((row) => !row[4]).length !== 19)
    throw new Error('Repertório de emojis alterado sem revisão.');
  return rows;
}

/** One offline, pinned pack is both runtime artwork and corresponding original data. */
export async function frontendEmoji(
  root: string,
): Promise<{ content: Uint8Array; catalog: EmojiRow[] }> {
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
  return { content, catalog: catalog(pack) };
}
