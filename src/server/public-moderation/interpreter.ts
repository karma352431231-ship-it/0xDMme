import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { Readable } from 'node:stream';
import { keys, object } from '../../shared/account/index.ts';

interface Interpreter {
  child: ChildProcessWithoutNullStreams;
  lines: AsyncIterator<string>;
  closed: Promise<void>;
}
async function* outputLines(output: Readable): AsyncGenerator<string> {
  let line = '';
  for await (const chunk of output) {
    if (!(chunk instanceof Uint8Array))
      throw new Error('Invalid inference output.');
    line += Buffer.from(chunk).toString('utf8');
    if (Buffer.byteLength(line) > 4096)
      throw new Error('Inference output exceeds budget.');
    let end = line.indexOf('\n');
    while (end !== -1) {
      yield line.slice(0, end);
      line = line.slice(end + 1);
      end = line.indexOf('\n');
    }
  }
  if (line) throw new Error('Incomplete inference output.');
}
async function response(worker: Interpreter): Promise<Record<string, unknown>> {
  const line = await worker.lines.next();
  if (line.done) throw new Error('Inference process stopped.');
  return object(JSON.parse(line.value));
}
async function terminate(worker: Interpreter): Promise<void> {
  worker.child.kill('SIGKILL');
  worker.child.stdin.destroy();
  worker.child.stdout.destroy();
  await worker.closed;
}
export class ModerationInterpreter {
  private readonly command: {
    executable: string;
    args: string[];
    model: string;
  };
  private worker: Interpreter | null = null;
  private readonly stop = new AbortController();
  private busy = false;
  private next = 1;
  constructor(command: { executable: string; args: string[]; model: string }) {
    this.command = command;
  }
  private async initialize(signal: AbortSignal): Promise<Interpreter> {
    if (this.worker) return this.worker;
    signal.throwIfAborted();
    const child = spawn(this.command.executable, this.command.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { PATH: '/usr/bin:/bin', LANG: 'C', PYTHONNOUSERSITE: '1' },
    });
    child.stderr.resume();
    const closed = new Promise<void>((resolve) =>
      child.once('close', () => resolve()),
    );
    const worker = { child, closed, lines: outputLines(child.stdout) };
    this.worker = worker;
    this.next = 1;
    child.on('error', () => child.kill('SIGKILL'));
    child.stdin.on('error', () => child.kill('SIGKILL'));
    const abort = () => child.kill('SIGKILL');
    signal.addEventListener('abort', abort, { once: true });
    try {
      const ready = await response(worker);
      keys(ready, ['ready', 'model']);
      if (ready['ready'] !== true || ready['model'] !== this.command.model)
        throw new Error('Inference model differs.');
      signal.throwIfAborted();
      return worker;
    } finally {
      signal.removeEventListener('abort', abort);
    }
  }
  private async withWorker<T>(
    signal: AbortSignal,
    operation: (worker: Interpreter) => Promise<T>,
  ): Promise<T> {
    if (this.busy) throw new Error('Inference is already in progress.');
    this.busy = true;
    const lifetime = AbortSignal.any([
      signal,
      this.stop.signal,
      AbortSignal.timeout(90_000),
    ]);
    let worker: Interpreter | null = null;
    const abort = () => worker?.child.kill('SIGKILL');
    try {
      worker = await this.initialize(lifetime);
      lifetime.addEventListener('abort', abort, { once: true });
      lifetime.throwIfAborted();
      const result = await operation(worker);
      lifetime.throwIfAborted();
      return result;
    } catch {
      if (this.worker) await terminate(this.worker);
      this.worker = null;
      throw new Error('Análise pública indisponível.');
    } finally {
      lifetime.removeEventListener('abort', abort);
      this.busy = false;
    }
  }
  async ready(signal: AbortSignal): Promise<void> {
    await this.withWorker(signal, () => Promise.resolve());
  }
  evaluate(
    payload: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<Record<string, unknown>> {
    return this.withWorker(signal, async (worker) => {
      const request = JSON.stringify({ ...payload, id: this.next });
      if (Buffer.byteLength(request) > 50_499_999)
        throw new Error('Inference request exceeds budget.');
      await new Promise<void>((resolve, reject) =>
        worker.child.stdin.write(request + '\n', (error) =>
          error ? reject(error) : resolve(),
        ),
      );
      const result = await response(worker);
      keys(result, ['id', 'verdicts']);
      if (result['id'] !== this.next)
        throw new Error('Stale inference response.');
      this.next++;
      return result;
    });
  }

  async close(): Promise<void> {
    this.stop.abort();
    if (this.worker) await terminate(this.worker);
    this.worker = null;
  }
}
