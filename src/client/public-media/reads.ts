// SPDX-License-Identifier: GPL-3.0-only
interface QueuedRead {
  start: () => void;
  cancel: () => void;
}
let active = 0;
const pending: QueuedRead[] = [];
/** One page can contain 24 posts with four files each. Queue their anonymous reads without accumulating bodies. */
export function withPublicRead(
  signal: AbortSignal,
  work: () => Promise<Blob>,
): Promise<Blob> {
  signal.throwIfAborted();
  if (pending.length >= 128)
    return Promise.reject(new Error('Leituras públicas ocupadas.'));
  return new Promise((resolve, reject) => {
    const job: QueuedRead = {
      start() {
        signal.removeEventListener('abort', job.cancel);
        active++;
        void (async () => {
          try {
            resolve(await work());
          } catch (error: unknown) {
            reject(
              error instanceof Error
                ? error
                : new Error('Leitura pública indisponível.'),
            );
          } finally {
            active--;
            const next = pending.shift();
            if (next) next.start();
          }
        })();
      },
      cancel() {
        const index = pending.indexOf(job);
        if (index !== -1) pending.splice(index, 1);
        signal.removeEventListener('abort', job.cancel);
        reject(new DOMException('Leitura pública cancelada.', 'AbortError'));
      },
    };
    if (active < 4) job.start();
    else {
      pending.push(job);
      signal.addEventListener('abort', job.cancel, { once: true });
    }
  });
}
