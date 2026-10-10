import { createHash } from 'node:crypto';
import { AccountError } from '../../shared/account/index.ts';
import type { Database, PublicModerationSubject } from '../database/index.ts';
import { CommunityMediaFiles } from '../community-media/index.ts';
import { publicModerationBinding } from './binding.ts';

export interface OperatorPreview {
  type: string;
  bytes: Uint8Array;
}
/** Only the protected local CLI constructs this service. No account/community HTTP route. */
export class PublicModerationOperator {
  private readonly files: CommunityMediaFiles;
  constructor(privateDatabase: Database, directory: string) {
    this.database = privateDatabase;
    this.files = new CommunityMediaFiles(directory);
  }
  private readonly database: Database;
  list(after: string | null) {
    return this.database.publicModeration.operatorPage(after);
  }
  async preview(id: string): Promise<OperatorPreview> {
    const current = await this.database.publicModeration.operatorCandidate(id);
    if (!current) throw new AccountError(404, 'Contestação indisponível.');
    const subject = current.subject;
    let preview: OperatorPreview | null;
    if (subject.kind === 'post-media')
      preview = await this.mediaPreview(subject);
    else
      preview = await (subject.kind === 'avatar' ||
      subject.kind === 'profile-banner'
        ? this.database.publicProfiles.moderationCandidate(subject)
        : this.database.communities.moderationCandidate(subject));
    if (
      !preview ||
      !(await this.database.publicModeration.operatorCandidate(id))
    )
      throw new AccountError(409, 'Candidato substituído ou expirado.');
    return preview;
  }
  private async mediaPreview(
    subject: PublicModerationSubject,
  ): Promise<OperatorPreview | null> {
    const current =
      await this.database.communityMedia.moderationCandidate(subject);
    if (!current) return null;
    const bytes = await this.files.read(
      current.id,
      'result',
      current.result.bytes,
    );
    if (
      bytes.length !== current.result.bytes ||
      createHash('sha256').update(bytes).digest('hex') !== current.resultHash
    )
      throw new Error('Candidato público divergente.');
    const thumbnail = await this.files.digest(
      current.id,
      'thumbnail',
      current.result.thumbnailBytes,
    );
    if (thumbnail !== current.thumbnailHash)
      throw new Error('Miniatura divergente.');
    return { type: current.result.type, bytes };
  }
  review(input: {
    id: string;
    verdict: 'allow' | 'reject';
    reason: string;
    confirmsPermitted: boolean;
  }) {
    return this.database.publicModeration.operatorReview(
      input,
      publicModerationBinding(this.database),
    );
  }
}
