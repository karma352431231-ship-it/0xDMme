// SPDX-License-Identifier: GPL-3.0-only
import type {
  EvaluationCase,
  EvaluationReference,
} from '../../shared/moderation-evaluation/index.ts';

async function boundedBody(response: Response, maximum: number): Promise<Blob> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Resposta ausente.');
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done)
        return new Blob(chunks, {
          type: response.headers.get('Content-Type') ?? '',
        });
      size += next.value.length;
      if (size > maximum) throw new Error('Resposta excedida.');
      chunks.push(next.value.slice());
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}
function responseFailure(status: number): Error {
  const messages: Record<number, string> = {
    401: 'Acesso inválido. Reabra o endereço privado fornecido.',
    410: 'Esta rodada expirou.',
    507: 'A galeria está cheia. Exporte e apague a rodada antes de enviar mais imagens.',
  };
  return new Error(
    messages[status] ??
      'A operação falhou. Confira a imagem ou a disponibilidade do ambiente.',
  );
}
export class EvaluationApi {
  private token: string;
  constructor(token: string) {
    this.token = token;
  }
  acceptAccess(token: string): void {
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new Error('Acesso ausente. Reabra o endereço privado fornecido.');
    this.token = token;
  }

  private async request(
    path: string,
    init: RequestInit = {},
    timeout = 45_000,
  ): Promise<Response> {
    if (!/^[a-f0-9]{64}$/.test(this.token))
      throw new Error('Acesso ausente. Reabra o endereço privado fornecido.');
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${this.token}`);
    const deadline = AbortSignal.timeout(timeout);
    const response = await fetch(path, {
      ...init,
      headers,
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      signal: init.signal ? AbortSignal.any([init.signal, deadline]) : deadline,
    });
    if (!response.ok) throw responseFailure(response.status);
    return response;
  }
  async json(path: string, init: RequestInit = {}): Promise<unknown> {
    const body = await boundedBody(await this.request(path, init), 512 * 1024);
    return JSON.parse(await body.text()) as unknown;
  }
  async image(
    entry: EvaluationCase,
    kind: 'image' | 'preview',
    signal: AbortSignal,
  ): Promise<Blob> {
    const size = kind === 'image' ? entry.bytes : entry.previewBytes;
    const hash = kind === 'image' ? entry.imageHash : entry.previewHash;
    const mime = kind === 'image' ? entry.mime : 'image/png';
    const response = await this.request(`/api/cases/${entry.id}/${kind}`, {
      signal,
    });
    const body = await boundedBody(response, size);
    if (body.size !== size || body.type !== mime)
      throw new Error('Imagem divergente do caso.');
    const digest = await crypto.subtle.digest(
      'SHA-256',
      await body.arrayBuffer(),
    );
    const actual = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    if (actual !== hash) throw new Error('Hash da imagem divergente do caso.');
    return body;
  }
  annotate(
    entry: EvaluationCase,
    reference: EvaluationReference,
  ): Promise<unknown> {
    return this.json(`/api/cases/${entry.id}/reference`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference }),
    });
  }
  async archive(): Promise<Blob> {
    const body = await boundedBody(
      await this.request('/api/export', {}, 150_000),
      513 * 1024 * 1024,
    );
    if (body.type !== 'application/zip')
      throw new Error('Exportação inválida.');
    return body;
  }
}
