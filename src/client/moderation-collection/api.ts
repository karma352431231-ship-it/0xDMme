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
  round_expired: t(
    'A rodada expirou. As imagens temporárias foram descartadas.',
  ),
  round_completed: t('O envio desta rodada já foi concluído.'),
  round_empty: t('Marque pelo menos uma imagem antes de concluir.'),
  round_full: t(
    'A rodada chegou ao limite. As imagens já enviadas continuam preservadas.',
  ),
  conflicting_reference: t(
    'Esta imagem já foi enviada com outra marcação. Use “Corrigir” no caso salvo.',
  ),
  invalid_image: t('O arquivo não corresponde a uma imagem PNG, JPEG ou WebP.'),
};
function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Resposta inválida da coleta.');
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
    throw new Error('Caso inválido recebido da coleta.');
  const reference = entry['reference'];
  if (reference !== 'allow' && reference !== 'reject')
    throw new Error('Marcação inválida recebida da coleta.');
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
    throw new Error('Rodada inválida recebida da coleta.');
  const completedAt = data['completedAt'];
  if (completedAt !== null && typeof completedAt !== 'number')
    throw new Error('Estado inválido recebido da coleta.');
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
        'A imagem salva diverge do envio. A fila foi preservada.',
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
