import type { AttachmentContent } from '../../shared/attachments/index.ts';
import type { SocialMedia } from '../../shared/social-media/index.ts';
/** Established only after authoritative acceptance (including reconciliation).
 * This client-only value carries no vault authority or delivery/read claim. */
export interface AcceptedDmMedia {
  id: string;
  peer: string;
  media: SocialMedia;
  content: AttachmentContent;
}
export type DmMediaAccepted = (message: AcceptedDmMedia) => void;
