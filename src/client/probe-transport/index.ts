import { maxResponseBytes } from '../../shared/crypto-probe/index.ts';

/** Limite vale também durante a leitura do corpo, antes de JSON/WASM. */
export async function boundedResponse(response: Response): Promise<string> {
  if (!response.ok || !response.body)
    throw new Error('Resposta do ensaio rejeitada.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let body = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return body + decoder.decode();
      bytes += chunk.value.length;
      if (bytes > maxResponseBytes) {
        await reader.cancel();
        throw new Error('Resposta excede o orçamento do ensaio.');
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}
