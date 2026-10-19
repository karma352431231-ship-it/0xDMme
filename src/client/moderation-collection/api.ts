import { t } from '../../shared/i18n/index.ts';
// SPDX-License-Identifier: GPL-3.0-only
export type Reference = 'allow' | 'reject';
export interface ImageCase {
  id: string;
  ordinal: number;
  imageHash: string;
  bytes: number;
  mime: string;
  reference: Reference;
}
export interface Collection {
  roundId: string;
  expiresAt: number;
  completedAt: number | null;
  cases: ImageCase[];
}
const messages: Record<string, string> = {
  round_expired: t('The round expired. Temporary images were discarded.'),
  round_completed: t("This round's upload is already complete."),
  round_empty: t('Annotate at least one image before finishing.'),
  round_full: t(
    'The round reached its limit. Images already uploaded are preserved.',
  ),
  conflicting_reference: t(
    'This image was already uploaded with a different annotation. Use “Correct” on the saved case.',
  ),
  invalid_image: t('The file is not a PNG, JPEG or WebP image.'),
};
function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid collection response.');
  return value as Record<string, unknown>;
}
function imageCase(value: unknown): ImageCase {
  const entry = record(value);
  if (
    typeof entry['id'] !== 'string' ||
    typeof entry['imageHash'] !== 'string' ||
    typeof entry['mime'] !== 'string' ||
    typeof entry['bytes'] !== 'number' ||
    typeof entry['ordinal'] !== 'number'
  )
    throw new Error('Invalid case received from collection.');
  const reference = entry['reference'];
  if (reference !== 'allow' && reference !== 'reject')
    throw new Error('Invalid annotation received from collection.');
  return {
    id: entry['id'],
    imageHash: entry['imageHash'],
    mime: entry['mime'],
    bytes: entry['bytes'],
    ordinal: entry['ordinal'],
    reference,
  };
}
function collection(value: unknown): Collection {
  const data = record(value);
  if (
    data['schema'] !== '0xdmme-image-collection-v1' ||
    typeof data['roundId'] !== 'string' ||
    typeof data['expiresAt'] !== 'number' ||
    !Array.isArray(data['cases'])
  )
    throw new Error('Invalid round received from collection.');
  const completedAt = data['completedAt'];
  if (completedAt !== null && typeof completedAt !== 'number')
    throw new Error('Invalid state received from collection.');
  const cases: unknown[] = data['cases'];
  return {
    roundId: data['roundId'],
    expiresAt: data['expiresAt'],
    completedAt,
    cases: cases.map(imageCase),
  };
}
export class CollectionApi {
  private token: string;
  constructor(token: string) {
    this.token = token;
  }
  acceptAccess(token: string): void {
    this.token = token;
  }
  private async response(
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${this.token}`);
    const response = await fetch(path, {
      ...init,
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const value: unknown = await response.json();
      const code = record(value)['error'];
      throw new Error(
        typeof code === 'string' && messages[code]
          ? messages[code]
          : 'Não foi possível salvar. Reabra o link privado e tente novamente.',
      );
    }
    return response;
  }
  async snapshot(): Promise<Collection> {
    const value: unknown = await (await this.response('/api/cases')).json();
    return collection(value);
  }
  async save(file: File, reference: Reference): Promise<ImageCase> {
    const value: unknown = await (
      await this.response('/api/cases', {
        method: 'POST',
        headers: {
          'Content-Type': file.type,
          'X-Collection-Reference': reference,
        },
        body: file,
      })
    ).json();
    const saved = imageCase(value);
    const digest = await crypto.subtle.digest(
      'SHA-256',
      await file.arrayBuffer(),
    );
    const hash = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    if (saved.imageHash !== hash || saved.reference !== reference)
      throw new Error(
        'The saved image differs from the upload. The queue was preserved.',
      );
    return saved;
  }
  async annotate(id: string, reference: Reference): Promise<void> {
    await this.response(`/api/cases/${encodeURIComponent(id)}/reference`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference }),
    });
  }
  async image(id: string): Promise<Blob> {
    return (
      await this.response(`/api/cases/${encodeURIComponent(id)}/image`)
    ).blob();
  }
  async complete(): Promise<Collection> {
    const value: unknown = await (
      await this.response('/api/complete', { method: 'POST' })
    ).json();
    return collection(value);
  }
}
