declare const ATTACHMENT_WORKER_URL: string;
let queued = 0;
let tail: Promise<unknown> = Promise.resolve();
class WorkerUnavailable extends Error {}
/** A worker can fail while fetching/starting, before it can report a file
 * error. One fresh worker retries that local-only operation; uploads are never
 * repeated here. A reported processing error or timeout is not retried. */
async function workWithStartupRetry<T>(input: unknown): Promise<T> {
  try {
    return await runWorker<T>(input);
  } catch (error: unknown) {
    if (!(error instanceof WorkerUnavailable)) throw error;
    return runWorker<T>(input);
  }
}
/** Bounded serial jobs, each worker terminated to release keys/WASM/decoder memory. */
export function attachmentWork<T>(input: unknown): Promise<T> {
  if (queued >= 4)
    return Promise.reject(new Error('Processing attachments. Please wait.'));
  queued++;
  const result = tail.then(() => workWithStartupRetry<T>(input));
  tail = result.then(
    () => {},
    () => {},
  );
  return result.finally(() => {
    queued--;
  });
}
function runWorker<T>(input: unknown): Promise<T> {
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
      worker?.terminate();
      if (error) reject(error);
      else resolve(result as T);
    }
    try {
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
