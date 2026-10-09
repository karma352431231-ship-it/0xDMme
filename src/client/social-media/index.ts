import { prepareAttachment } from '../attachments/index.ts';
import type { AttachmentSelection } from '../attachments/index.ts';
import { prepareGif } from '../../shared/gif-inspection/index.ts';
import { safeFilename } from '../../shared/attachments/index.ts';
import type { SocialMedia } from '../../shared/social-media/index.ts';
export async function prepareSocialImage(
  file: File,
): Promise<{ selection: AttachmentSelection; media: SocialMedia }> {
  if (file.type !== 'image/gif' && !/\.gif$/iu.test(file.name)) {
    const selection = await prepareAttachment(file, false);
    if (!selection.image) {
      selection.bytes.fill(0);
      throw new Error('Use uma imagem PNG, JPEG ou WebP compatível nesta DM.');
    }
    return { selection, media: 'photo' };
  }
  if (!file.size || file.size > 3_000_000)
    throw new Error('GIF deve ter até 3 MB.');
  const original = new Uint8Array(await file.arrayBuffer());
  try {
    prepareGif(original).fill(0);
    return {
      media: 'gif',
      selection: {
        bytes: original,
        thumbnail: null,
        type: 'image/gif',
        name: safeFilename(file.name),
        image: true,
      },
    };
  } catch (error: unknown) {
    original.fill(0);
    throw error;
  }
}
