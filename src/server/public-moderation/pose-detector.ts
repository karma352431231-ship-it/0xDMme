import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fingerprint } from '../../shared/devices/index.ts';
import type {
  FrameVerdict,
  PreparedFrameShape,
  PreparedRgbaDetector,
  PreparedRgbaFrame,
} from './frame-contract.ts';
import { ModerationInterpreter } from './interpreter.ts';

function frameVerdict(value: unknown): FrameVerdict {
  if (value === 'allow' || value === 'hold' || value === 'reject') return value;
  throw new Error('Invalid inference verdict.');
}
export class PoseFrameDetector implements PreparedRgbaDetector {
  readonly model: { hash: string; runtime: string };
  private readonly interpreter: ModerationInterpreter;
  constructor(options: {
    python: string;
    directory: string;
    model: { hash: string; runtime: string };
  }) {
    if (![options.python, options.directory].every(isAbsolute))
      throw new Error('Absolute inference paths required.');
    this.model = { ...options.model, hash: fingerprint(options.model.hash) };
    this.interpreter = new ModerationInterpreter({
      executable: options.python,
      args: [
        '-I',
        '-B',
        fileURLToPath(
          new URL(
            '../../../infra/public-moderation/pose_worker.py',
            import.meta.url,
          ),
        ),
        options.directory,
      ],
      model: this.model.hash,
    });
  }
  async classifyPrepared(
    frames: readonly PreparedRgbaFrame[],
    shape: PreparedFrameShape,
    signal: AbortSignal,
  ): Promise<readonly FrameVerdict[]> {
    signal.throwIfAborted();
    if (
      !frames.length ||
      frames.length > 2 ||
      frames.some(
        (frame) =>
          frame.context.length !== 512 * 512 * 4 ||
          frame.native.length !== shape.native.width * shape.native.height * 4,
      )
    )
      throw new Error('Incomplete prepared frame batch.');
    const result = await this.interpreter.evaluate(
      {
        shape,
        frames: frames.map((frame) => ({
          native: Buffer.from(frame.native).toString('base64'),
          context: Buffer.from(frame.context).toString('base64'),
        })),
      },
      signal,
    );
    const verdicts = result['verdicts'];
    if (!Array.isArray(verdicts) || verdicts.length !== frames.length)
      throw new Error('Incomplete inference coverage.');
    const values: unknown[] = verdicts;
    return values.map(frameVerdict);
  }
  close(): Promise<void> {
    return this.interpreter.close();
  }
  initialize(signal: AbortSignal): Promise<void> {
    return this.interpreter.ready(signal);
  }
}
