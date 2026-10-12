import type { Database } from '../database/index.ts';
import type { PoseModerationConfiguration } from './configuration.ts';
import { PoseFrameDetector } from './pose-detector.ts';
import { PublicModerationScanner } from './scanner.ts';

export async function configuredPoseRunner(options: {
  db: Database;
  directory: string;
  configuration: PoseModerationConfiguration | null;
}): Promise<{
  scanner: PublicModerationScanner;
  close: () => Promise<void>;
} | null> {
  const { db, directory, configuration } = options;
  if (!configuration) return null;
  const detector = new PoseFrameDetector({
    python: configuration.python,
    directory: configuration.directory,
    model: configuration.model,
  });
  try {
    await detector.initialize(AbortSignal.timeout(30_000));
    return {
      scanner: new PublicModerationScanner({
        directory,
        runtime: configuration.runtime,
        detector,
        candidates: {
          avatar: (job) =>
            job.kind === 'community-photo'
              ? db.communities.moderationCandidate(job)
              : db.publicProfiles.moderationCandidate(job),
          media: (job) => db.communityMedia.moderationCandidate(job),
        },
      }),
      close: () => detector.close(),
    };
  } catch (error: unknown) {
    await detector.close();
    throw error;
  }
}
