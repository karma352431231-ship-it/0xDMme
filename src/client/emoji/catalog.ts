export type EmojiRow = readonly [
  emoji: string,
  name: string,
  keywords: string,
  group: number,
  artwork: string | null,
];
export const emojiCategories = [
  'Rostos e emoções',
  'Pessoas e corpo',
  'Animais e natureza',
  'Comida e bebida',
  'Viagens e lugares',
  'Atividades',
  'Objetos',
  'Símbolos',
  'Bandeiras',
] as const;
export const emojiPageSize = 72;
const skinTones = /[\u{1F3FB}-\u{1F3FF}]/gu;

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036F\uFE0F]/gu, '')
    .toLocaleLowerCase('pt-BR');
}
export class EmojiCatalog {
  readonly rows: readonly EmojiRow[];
  private readonly searchText: ReadonlyMap<EmojiRow, string>;
  private readonly lookup: ReadonlyMap<string, EmojiRow>;
  private readonly toned: ReadonlySet<string>;
  constructor(rows: readonly EmojiRow[]) {
    this.rows = rows;
    this.searchText = new Map(
      rows.map((r) => [r, normalize(`${r[0]} ${r[1]} ${r[2]}`)]),
    );
    this.lookup = new Map(
      rows.map((row) => [row[0].replaceAll('\uFE0F', ''), row]),
    );
    this.toned = new Set(
      rows
        .filter((row) => /[\u{1F3FB}-\u{1F3FF}]/u.test(row[0]))
        .map((row) => row[0].replace(skinTones, '')),
    );
  }
  find(emoji: string): EmojiRow | undefined {
    return this.lookup.get(emoji.replaceAll('\uFE0F', ''));
  }
  search(options: {
    query: string;
    category: string;
    tone: string;
    offset: number;
    recent: readonly string[];
  }): { entries: readonly EmojiRow[]; total: number } {
    const terms = normalize(options.query.trim().slice(0, 128))
      .split(/\s+/u)
      .filter(Boolean);
    const recent = new Map(
      options.recent.slice(0, 32).map((emoji, i) => [emoji, i]),
    );
    const source =
      options.category === 'recent'
        ? [...recent.keys()].map(
            (emoji) =>
              this.find(emoji) ?? ([emoji, emoji, '', -1, null] as EmojiRow),
          )
        : this.rows;
    const result = source.filter(
      (row) =>
        this.inCategory(row, options.category, recent) &&
        this.inTone(row[0], options.tone) &&
        terms.every((term) => this.text(row).includes(term)),
    );
    if (options.category === 'recent')
      result.sort(
        (a, b) => (recent.get(a[0]) ?? 32) - (recent.get(b[0]) ?? 32),
      );
    const offset = Math.max(
      0,
      Math.min(this.rows.length, Math.floor(options.offset) || 0),
    );
    return {
      entries: result.slice(offset, offset + emojiPageSize),
      total: result.length,
    };
  }
  private text(row: EmojiRow): string {
    return this.searchText.get(row) ?? normalize(`${row[0]} ${row[1]}`);
  }
  private inCategory(
    row: EmojiRow,
    category: string,
    recent: ReadonlyMap<string, number>,
  ): boolean {
    if (category === 'recent') return recent.has(row[0]);
    return category === 'all' || String(row[3]) === category;
  }
  private inTone(emoji: string, tone: string): boolean {
    if (tone === 'all') return true;
    const modifiers = emoji.match(skinTones) ?? [];
    if (tone === 'none') return modifiers.length === 0;
    if (!modifiers.length) return !this.toned.has(emoji);
    return (
      modifiers.length > 0 && modifiers.every((modifier) => modifier === tone)
    );
  }
}
export function insertEmoji(
  text: string,
  start: number,
  end: number,
  emoji: string,
): { text: string; caret: number } {
  start = Math.max(0, Math.min(text.length, start));
  end = Math.max(start, Math.min(text.length, end));
  return {
    text: text.slice(0, start) + emoji + text.slice(end),
    caret: start + emoji.length,
  };
}
