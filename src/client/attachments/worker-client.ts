declare const ATTACHMENT_WORKER_URL: string;
let queued = 0;
let tail: Promise<unknown> = Promise.resolve();
class WorkerUnavailable extends Error {}
/** A worker can fail while fetching/starting, before it can report a file
 * error. One fresh worker retries that local-only operation; uploads are never
 * repeated here. A reported processing error or timeout is not retried. */
async function workWithStartupRetry<T>(
  input: unknown,
  signal?: AbortSignal,
): Promise<T> {
  try {
    return await runWorker<T>(input, signal);
  } catch (error: unknown) {
    if (!(error instanceof WorkerUnavailable)) throw error;
    return runWorker<T>(input, signal);
  }
}
/** Bounded serial jobs, each worker terminated to release keys/WASM/decoder memory. */
export function attachmentWork<T>(
  input: unknown,
  signal?: AbortSignal,
): Promise<T> {
  if (queued >= 4)
    return Promise.reject(new Error('Processing attachments. Please wait.'));
  queued++;
  const result = tail.then(() => {
    signal?.throwIfAborted();
    return workWithStartupRetry<T>(input, signal);
  });
  tail = result.then(
    () => {},
    () => {},
  );
  return result.finally(() => {
    queued--;
  });
}
function runWorker<T>(input: unknown, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    let worker: Worker | null = null,
      finished = false;
    const timer = setTimeout(
      () => finish(new Error('Attachment processing timed out.')),
      30000,
    );
    function finish(error: Error | null, result?: T) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      worker?.terminate();
      if (error) reject(error);
      else resolve(result as T);
    }
    function abort() {
      finish(new DOMException('Local processing cancelled.', 'AbortError'));
    }
    if (signal?.aborted) {
      abort();
      return;
    }
    try {
      signal?.addEventListener('abort', abort, { once: true });
      worker = new Worker(ATTACHMENT_WORKER_URL, { type: 'module' });
      worker.onmessage = (event: MessageEvent<{ error?: string; result: T }>) =>
        finish(
          event.data.error ? new Error(event.data.error) : null,
          event.data.result,
        );
      worker.onerror = () =>
        finish(
          new WorkerUnavailable('Local attachment processing unavailable.'),
        );
      worker.postMessage(input);
    } catch {
      finish(new Error('Could not start local attachment processing.'));
    }
  });
}
