import { prepareAttachment } from '../attachments/index.ts';
import type { AttachmentSelection } from '../attachments/index.ts';
import { prepareGif } from '../../shared/gif-inspection/index.ts';
import { safeFilename } from '../../shared/attachments/index.ts';
import type { SocialMedia } from '../../shared/social-media/index.ts';
export async function prepareSocialImage(
  file: File,
): Promise<{ selection: AttachmentSelection; media: SocialMedia }> {
  if (file.type !== 'image/gif' && !/\.gif$/iu.test(file.name))
    return { selection: await prepareAttachment(file, true), media: 'photo' };
  if (!file.size || file.size > 3_000_000)
    throw new Error('GIF deve ter até 3 MB.');
  const original = new Uint8Array(await file.arrayBuffer());
  try {
    return {
      media: 'gif',
      selection: {
        bytes: prepareGif(original),
        thumbnail: null,
        type: 'image/gif',
        name: safeFilename(file.name),
        image: true,
      },
    };
  } finally {
    original.fill(0);
  }
}
