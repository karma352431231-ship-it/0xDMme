import { AccountError } from '../account/index.ts';
import { animatedAttachmentContent } from '../attachments/index.ts';
import type { AttachmentContent } from '../attachments/index.ts';
import { imageShape } from '../image-inspection/index.ts';
import { prepareGif } from '../gif-inspection/index.ts';
import { validateVoice } from '../voice/index.ts';
export type SocialMedia = 'photo' | 'gif' | 'voice';
export function socialMedia(value: unknown): SocialMedia {
  if (value !== 'photo' && value !== 'gif' && value !== 'voice')
    throw new AccountError(400, 'Use photos, GIFs or voice in this DM.');
  return value;
}
export function socialAttachment(
  input: unknown,
  declared: SocialMedia,
): AttachmentContent {
  const content = animatedAttachmentContent(input);
  if (declared === 'voice') {
    if (!content.voice)
      throw new Error('Voice message has no authenticated descriptor.');
    return content;
  }
  if (!content.image || content.voice) throw new Error('Invalid DM image.');
  if (
    declared === 'gif' &&
    (content.type !== 'image/gif' || content.thumbnail !== null)
  )
    throw new Error('Invalid DM GIF.');
  if (
    declared === 'photo' &&
    !['image/png', 'image/jpeg', 'image/webp'].includes(content.type)
  )
    throw new Error('Invalid DM photo.');
  return content;
}
/** Chat originals may retain metadata; format, size and allocation bounds remain mandatory. */
export function checkSocialBytes(
  content: AttachmentContent,
  declared: SocialMedia,
  bytes: Uint8Array<ArrayBuffer>,
): void {
  if (bytes.length !== content.file.ref.bytes)
    throw new Error('Media size mismatch.');
  if (declared === 'voice') {
    if (!content.voice) throw new Error('Invalid voice message.');
    validateVoice(bytes, content.voice);
    return;
  }
  if (declared === 'gif') {
    prepareGif(bytes).fill(0);
    return;
  }
  if (imageShape(bytes).type !== content.type)
    throw new Error('Invalid received photo.');
}
