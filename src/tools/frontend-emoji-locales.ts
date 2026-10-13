import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { AppLanguage } from '../shared/i18n/index.ts';

const pinned = [
  [
    'en',
    'annotations',
    'f22083cb86dffb63a643d5bacb5d9899f82d2fa5d388ad4f3aed72184acef505',
  ],
  [
    'en',
    'annotationsDerived',
    '15c9457afa703a32dcc78d54626418a91e820fe0ddd67b7d491c4c4d9f5846ab',
  ],
  [
    'zh',
    'annotations',
    '8d2dfe9bf41894bd17c9c1a1906a31bf0ccc06204bf4b77c2ab2b0d8f79a5fdf',
  ],
  [
    'zh',
    'annotationsDerived',
    '1ff96249af6fc69067f2dfabc26b450786a93d8048f2764ecfad53fd64953f92',
  ],
] as const;

type AnnotationMap = Record<string, unknown>;
export type EmojiAnnotations = Record<AppLanguage, AnnotationMap>;

function record(value: unknown): AnnotationMap {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Invalid emoji annotations.');
  return value as AnnotationMap;
}

function strings(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.some((item: unknown) => typeof item !== 'string')
  )
    throw new Error('Invalid emoji annotation text.');
  return value as string[];
}

/** Original CLDR 48.2.3 bytes, under the already adopted Unicode-3.0 license. */
export async function emojiAnnotations(
  root: string,
): Promise<EmojiAnnotations> {
  const maps: EmojiAnnotations = { en: {}, 'zh-CN': {} };
  for (const [language, field, expected] of pinned) {
    const bytes = await readFile(
      resolve(root, `vendor/emoji/${field}-${language}.json`),
    );
    if (
      bytes.length > 1024 * 1024 ||
      createHash('sha256').update(bytes).digest('hex') !== expected
    )
      throw new Error('Emoji annotation integrity mismatch.');
    const data = record(record(JSON.parse(bytes.toString()) as unknown)[field]);
    if (record(data['identity'])['language'] !== language)
      throw new Error('Emoji annotation language mismatch.');
    Object.assign(
      maps[language === 'zh' ? 'zh-CN' : 'en'],
      record(data['annotations']),
    );
  }
  return maps;
}

const newChineseNames = new Map([
  ['cracking face', '裂开的脸'],
  ['leftwards thumb sign', '向左的拇指'],
  ['rightwards thumb sign', '向右的拇指'],
  ['monarch butterfly', '帝王蝶'],
  ['pickle', '腌黄瓜'],
  ['lighthouse', '灯塔'],
  ['meteor', '流星'],
  ['eraser', '橡皮擦'],
  ['net with handle', '带柄网'],
]);
const chineseTones = new Map([
  ['light skin tone', '浅肤色'],
  ['medium-light skin tone', '中浅肤色'],
  ['medium skin tone', '中等肤色'],
  ['medium-dark skin tone', '中深肤色'],
  ['dark skin tone', '深肤色'],
]);

function chineseFallback(fallback: string): string {
  const [name, tone] = fallback.split(': ');
  const translated = newChineseNames.get(name ?? '');
  if (!translated) throw new Error(`Missing Chinese emoji name: ${fallback}`);
  if (!tone) return translated;
  const translatedTone = chineseTones.get(tone);
  if (!translatedTone) throw new Error('Missing Chinese emoji skin tone.');
  return `${translated}：${translatedTone}`;
}

export function emojiNames(input: {
  annotations: AnnotationMap;
  language: AppLanguage;
  emoji: string;
  fallback: string;
}): [string, string] {
  const { annotations, language, emoji, fallback } = input;
  const annotation =
    annotations[emoji] ?? annotations[emoji.replaceAll('\uFE0F', '')];
  if (!annotation) {
    const name = language === 'en' ? fallback : chineseFallback(fallback);
    return [name, `${name} ${fallback}`];
  }
  const row = record(annotation);
  const name = strings(row['tts'])[0];
  if (!name) throw new Error('Missing localized emoji name.');
  return [name, `${strings(row['default']).join(' ')} ${fallback}`];
}
