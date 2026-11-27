import { t, translatedError } from '../../shared/i18n/index.ts';
// SPDX-License-Identifier: GPL-3.0-only
import { base64, keys, object } from '../../shared/account/index.ts';
import {
  communityMediaPartBytes,
  communityMediaState,
} from '../../shared/community-media/index.ts';
import type { CommunityMediaState } from '../../shared/community-media/index.ts';
import { dropFilesInto } from '../file-drop/index.ts';
import { showToast } from '../toast/index.ts';
import { uploadRing } from '../upload-progress/index.ts';
import type { UploadRing } from '../upload-progress/index.ts';
import { ChosenUploads } from './chosen-uploads.ts';
import { fitMediaSelection, validateMediaSelection } from './selection.ts';
import { request } from './upload.ts';
import type { CommunityMediaAccess } from './upload.ts';

export {
  fitMediaSelection,
  selectedMediaKind,
  validateMediaSelection,
} from './selection.ts';
export { ChosenUploads } from './chosen-uploads.ts';
export type { CommunityMediaAccess } from './upload.ts';

const clipIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m20 11-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7"/></svg>';
/** One thumbnail per chosen file, each with its own remove button. */
function renderPreviews(
  host: HTMLElement,
  files: readonly File[],
  remove: (index: number) => void,
): () => void {
  const urls: string[] = [];
  host.replaceChildren(
    ...files.map((file, index) => {
      const tile = document.createElement('div'),
        url = URL.createObjectURL(file),
        close = document.createElement('button');
      urls.push(url);
      tile.className = 'media-picker-tile';
      const preview = file.type.startsWith('video/')
        ? Object.assign(document.createElement('video'), {
            src: url,
            muted: true,
            preload: 'metadata',
          })
        : Object.assign(document.createElement('img'), { src: url, alt: '' });
      preview.setAttribute('aria-label', file.name);
      close.type = 'button';
      close.className = 'media-picker-remove';
      close.textContent = t('×');
      close.setAttribute('aria-label', t('Remove {0}', [file.name]));
      close.title = t('Remove');
      close.addEventListener('click', () => remove(index));
      tile.append(preview, close);
      return tile;
    }),
  );
  host.hidden = files.length === 0;
  return () => {
    for (const url of urls) URL.revokeObjectURL(url);
  };
}
/**
 * Photos, GIFs or a video for a post or reply: the clip button, a thumbnail
 * per chosen file with its own X, and a drop zone on the whole form. New picks
 * add to the choice; limit refusals appear as a notice at the bottom.
 */
export function mediaEditor(
  container: HTMLElement,
  ids: string[],
  access: CommunityMediaAccess,
  controls?: HTMLElement,
): () => Promise<string[]> {
  const field = document.createElement('div');
  field.className = 'media-picker';
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.hidden = true;
  input.accept =
    'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/quicktime,video/webm';
  const pick = document.createElement('button');
  pick.type = 'button';
  pick.className = 'media-picker-button';
  pick.innerHTML = clipIcon;
  pick.setAttribute('aria-label', t('Attach photos, GIFs or video'));
  pick.title = t('Up to 10 photos, 3 GIFs or 1 video');
  const previews = document.createElement('div');
  previews.className = 'media-picker-previews';
  previews.hidden = true;
  const status = document.createElement('small');
  status.setAttribute('role', 'status');
  const remove = document.createElement('input');
  remove.type = 'checkbox';
  const removeLabel = document.createElement('label');
  removeLabel.append(
    remove,
    document.createTextNode(t('Remove current media')),
  );
  field.append(input, pick, status);
  if (ids.length) container.append(removeLabel);
  container.append(previews);
  (controls ?? container).append(field);
  dropFilesInto(container, input);
  pick.addEventListener('click', () => {
    input.click();
  });
  let chosen: File[] = [],
    release = (): void => undefined;
  const progress = new Map<File, number | null>(),
    rings = new Map<File, UploadRing>();
  const shown = (): boolean => access.valid() && field.isConnected;
  const paint = (): void => {
    for (const [index, file] of chosen.entries()) {
      const value = progress.get(file),
        tile = previews.children[index] as HTMLElement | undefined;
      if (value === undefined || !tile) continue;
      let ring = rings.get(file);
      if (!ring || !tile.contains(ring.element)) {
        ring = uploadRing();
        rings.set(file, ring);
        tile.append(ring.element);
      }
      ring.set(value);
    }
  };
  const uploads = new ChosenUploads(access, {
    progress: (file, value) => {
      progress.set(file, value);
      if (shown()) paint();
    },
    failed: (file, error) => {
      progress.delete(file);
      rings.get(file)?.element.remove();
      rings.delete(file);
      if (shown()) status.textContent = uploadError(error);
    },
  });
  const show = (): void => {
    release();
    uploads.update(chosen);
    for (const file of [...progress.keys(), ...rings.keys()])
      if (!chosen.includes(file)) {
        progress.delete(file);
        rings.delete(file);
      }
    release = renderPreviews(previews, chosen, (index) => {
      chosen = chosen.filter((_, position) => position !== index);
      show();
    });
    paint();
  };
  access.signal.addEventListener('abort', () => release(), { once: true });
  input.addEventListener('change', () => {
    const fitted = fitMediaSelection(chosen, Array.from(input.files ?? []));
    input.value = '';
    status.textContent = '';
    try {
      validateMediaSelection(fitted.files);
      chosen = fitted.files;
      show();
      if (fitted.left === 'mixed')
        showToast(
          t(
            'Some files were left out: a post takes photos, GIFs or 1 video, without mixing.',
          ),
        );
      else if (fitted.left === 'limit')
        showToast(
          t('Some files were left out: up to 10 photos, 3 GIFs or 1 video.'),
        );
    } catch (error: unknown) {
      showToast(
        error instanceof Error
          ? translatedError(error.message)
          : t('Invalid selection.'),
      );
    }
  });
  return async () => {
    if (remove.checked) return [];
    if (!chosen.length) return ids;
    try {
      const result = await uploads.ids(chosen);
      status.textContent = '';
      return result;
    } catch (error: unknown) {
      if (shown()) status.textContent = uploadError(error);
      throw error;
    }
  };
}
function uploadError(error: unknown): string {
  return error instanceof Error
    ? translatedError(error.message)
    : t('Media upload unavailable. Try again.');
}
export function restrictedMedia(
  container: HTMLElement,
  ids: string[],
  access: CommunityMediaAccess,
): () => void {
  const urls: string[] = [];
  let stopped = false;
  const stop = () => {
    stopped = true;
    for (const url of urls) URL.revokeObjectURL(url);
  };
  access.signal.addEventListener('abort', stop, { once: true });
  for (const id of ids) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = t('View my prepared media (restricted)');
    container.append(button);
    button.addEventListener('click', () => {
      button.disabled = true;
      void preview(id)
        .catch((e: unknown) => {
          if (!stopped)
            button.textContent =
              e instanceof Error
                ? translatedError(e.message)
                : t('Preview unavailable.');
        })
        .finally(() => {
          button.disabled = false;
        });
    });
    async function preview(media: string): Promise<void> {
      const state = communityMediaState(
        await request(access, 'media-status', { media }),
      );
      if (!state.result) throw new Error('File still being prepared.');
      const blob = await download(access, media, state);
      if (stopped || !access.valid()) return;
      const url = URL.createObjectURL(blob);
      urls.push(url);
      const node =
        state.result.kind === 'video'
          ? document.createElement('video')
          : document.createElement('img');
      node.className = 'community-media-preview';
      if (node instanceof HTMLVideoElement) {
        node.controls = true;
        node.preload = 'metadata';
      } else node.alt = t('Prepared media restricted to the author');
      node.src = url;
      button.replaceWith(node);
    }
  }
  return stop;
}
async function download(
  access: CommunityMediaAccess,
  id: string,
  state: CommunityMediaState,
): Promise<Blob> {
  const result = state.result!;
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  for (
    let index = 0;
    index < Math.ceil(result.bytes / communityMediaPartBytes);
    index++
  ) {
    const data = object(
      await request(access, 'media-get', {
        media: id,
        index,
        thumbnail: false,
      }),
    );
    keys(data, ['bytes']);
    const bytes = base64(data['bytes'], communityMediaPartBytes);
    if (
      bytes.length !==
      Math.min(
        communityMediaPartBytes,
        result.bytes - index * communityMediaPartBytes,
      )
    )
      throw new Error('Media incomplete.');
    chunks.push(Uint8Array.from(bytes));
  }
  return new Blob(chunks, { type: result.type });
}
