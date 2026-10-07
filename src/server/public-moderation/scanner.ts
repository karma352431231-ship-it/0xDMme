import { createHash } from 'node:crypto';
import { AccountError, boundedText } from '../../shared/account/index.ts';
import { fingerprint } from '../../shared/devices/index.ts';
import { publicModerationPolicy } from '../../shared/public-moderation/index.ts';
import type { PendingPublicAvatar } from '../../shared/public-avatar/index.ts';
import type {
  PublicModerationClaim,
  PublicModerationEvaluation,
  PublicModerationMediaCandidate,
} from '../database/index.ts';
import {
  CommunityMediaFiles,
  verifyMediaBudget,
} from '../community-media/index.ts';
import type { MediaRuntime } from '../community-media/index.ts';
import { classifyPreparedFrames } from './frames.ts';
import type { PublicFrameDetector, PreparedFrameInput } from './frames.ts';
import type { PublicModerationRunner } from './worker.ts';

export interface ModerationCandidates {
  avatar(job: PublicModerationClaim): Promise<PendingPublicAvatar | null>;
  media(
    job: PublicModerationClaim,
  ): Promise<PublicModerationMediaCandidate | null>;
}
/** Decodes the whole prepared sequence plus its thumbnail; it does not select or accept a detector. */
export class PublicModerationScanner implements PublicModerationRunner {
  readonly model: { hash: string; runtime: string };
  private readonly candidates: ModerationCandidates;
  private readonly files: CommunityMediaFiles;
  private readonly runtime: MediaRuntime;
  private readonly detector: PublicFrameDetector;
  constructor(options: {
    candidates: ModerationCandidates;
    directory: string;
    runtime: MediaRuntime;
    detector: PublicFrameDetector;
  }) {
    this.candidates = options.candidates;
    this.files = new CommunityMediaFiles(options.directory);
    this.runtime = options.runtime;
    this.detector = options.detector;
    this.model = {
      hash: fingerprint(options.detector.model.hash),
      runtime: boundedText(options.detector.model.runtime, 120),
    };
  }
  async evaluate(
    job: PublicModerationClaim,
    signal: AbortSignal,
  ): Promise<PublicModerationEvaluation> {
    if (
      job.policy !== publicModerationPolicy ||
      job.modelHash !== this.model.hash ||
      job.runtime !== this.model.runtime
    )
      throw new Error('Modelo/política da análise divergente.');
    await verifyMediaBudget(this.runtime);
    signal.throwIfAborted();
    const inputs =
      job.kind === 'post-media'
        ? await this.mediaInputs(job)
        : await this.avatarInputs(job);
    let frames = 0,
      verdict: PublicModerationEvaluation['verdict'] = 'allow';
    for (const input of inputs) {
      const result = await classifyPreparedFrames({
        runtime: this.runtime,
        input,
        detector: this.detector,
        signal,
      });
      frames += result.frames;
      if (result.verdict === 'reject') verdict = 'reject';
      else if (result.verdict === 'hold' && verdict !== 'reject')
        verdict = 'hold';
    }
    // The byte owner's binding is checked again when committing. No SQL transaction spans inference.
    signal.throwIfAborted();
    return {
      contentHash: job.contentHash,
      modelHash: this.model.hash,
      frames,
      expectedFrames: frames,
      verdict,
    };
  }
  private async avatarInputs(
    job: PublicModerationClaim,
  ): Promise<PreparedFrameInput[]> {
    const avatar = await this.candidates.avatar(job);
    if (
      !avatar ||
      createHash('sha256').update(avatar.bytes).digest('hex') !==
        job.contentHash
    )
      throw new AccountError(409, 'Foto substituída ou expirada.');
    return [{ ...avatar, maximumFrames: 1 }];
  }
  private async mediaInputs(
    job: PublicModerationClaim,
  ): Promise<PreparedFrameInput[]> {
    const candidate = await this.candidates.media(job);
    if (!candidate)
      throw new AccountError(409, 'Mídia substituída ou expirada.');
    const result = await this.files.read(
        candidate.id,
        'result',
        candidate.result.bytes,
      ),
      thumbnail = await this.files.read(
        candidate.id,
        'thumbnail',
        candidate.result.thumbnailBytes,
      );
    requireHash(result, candidate.resultHash);
    requireHash(thumbnail, candidate.thumbnailHash);
    const type = candidate.result.type;
    if (
      type !== 'image/png' &&
      type !== 'image/jpeg' &&
      type !== 'image/gif' &&
      type !== 'video/mp4'
    )
      throw new Error('Mídia preparada inválida.');
    return [
      {
        bytes: result,
        type,
        maximumFrames:
          candidate.result.kind === 'photo'
            ? 1
            : candidate.result.kind === 'gif'
              ? 400
              : 1803,
      },
      { bytes: thumbnail, type: 'image/png', maximumFrames: 1 },
    ];
  }
}
function requireHash(bytes: Uint8Array, expected: string): void {
  if (createHash('sha256').update(bytes).digest('hex') !== expected)
    throw new Error('Mídia preparada divergente.');
}
