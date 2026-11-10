import { safeFilename } from '../../shared/attachments/index.ts';
import { viewOnceSelectionMime } from '../view-once-media/index.ts';
import type { AttachmentSelection } from '../attachments/index.ts';
export { installProtectedDisplay } from './display.ts';
export type { ProtectedDisplay } from './display.ts';
export { renderViewOnce, formatViewOnceBytes } from './presentation.ts';
export async function prepareViewOnceSelection(
  file: File,
  maximum: number,
): Promise<AttachmentSelection> {
  if (!file.size || file.size > maximum)
    throw new Error('File exceeds this conversation’s limit.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    const mime = viewOnceSelectionMime(bytes, file.name, file.type);
    return {
      name: safeFilename(file.name),
      type: mime,
      image: mime.startsWith('image/'),
      bytes,
      thumbnail: null,
    };
  } catch (error) {
    bytes.fill(0);
    throw error;
  }
}
