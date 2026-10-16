import { EditorImagePreview } from '../image-editor-preview/index.ts';
import { t } from '../../shared/i18n/index.ts';
import type { PendingPublicAvatar } from '../../shared/public-avatar/index.ts';
import { preparePhoto } from '../attachment-images/index.ts';
import { bannerCrop, cropImage, squareCrop } from '../image-crop/index.ts';
import { communityElement as el } from './elements.ts';

export type CommunityImageSlot = 'photo' | 'banner';

/**
 * A community photo or banner picker. Choosing a file only prepares local
 * bytes and shows a preview; the caller decides when to send them.
 */
export function mountImageSlot(
  host: HTMLElement,
  options: {
    slot: CommunityImageSlot;
    current: PendingPublicAvatar | null;
    pickLabel: string;
    access: {
      signal: AbortSignal;
      run: (work: () => Promise<void>) => Promise<void>;
    };
    change: (value: PendingPublicAvatar | null) => void;
  },
): {
  update: (value: PendingPublicAvatar | null) => void;
  dispose: () => void;
} {
  const { slot, access } = options;
  let disposed = false;
  const slotNode = el(
    'div',
    '',
    `community-image-slot community-image-slot-${slot}`,
  );
  host.append(slotNode);
  const button = el(
      'button',
      '',
      `community-image-pick community-image-${slot}`,
    ),
    image = el('img'),
    hint = el('span', options.pickLabel);
  button.type = 'button';
  button.setAttribute('aria-label', options.pickLabel);
  button.append(image, hint);
  slotNode.append(button);
  const preview = new EditorImagePreview(image, image);
  const paint = (value: PendingPublicAvatar | null) => preview.show(value);
  const input = el('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/webp';
  input.hidden = true;
  slotNode.append(input);
  const removeLabel =
    slot === 'photo' ? t('Remover foto') : t('Remover banner');
  const remove = el('button', t('×'), 'community-image-remove');
  remove.type = 'button';
  remove.setAttribute('aria-label', removeLabel);
  remove.title = removeLabel;
  remove.hidden = !options.current;
  slotNode.append(remove);
  const set = (value: PendingPublicAvatar | null) => {
    remove.hidden = !value;
    paint(value);
    options.change(value);
  };
  paint(options.current);
  button.addEventListener('click', () => input.click());
  remove.addEventListener('click', () => set(null));
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    void access.run(async () => {
      // The owner frames the picture first; cancel keeps the current one.
      const framed = await cropImage(
        file,
        slot === 'photo' ? squareCrop : bannerCrop,
      );
      if (!framed || access.signal.aborted || disposed) return;
      const prepared = await preparePhoto(framed);
      if (access.signal.aborted || disposed) return;
      set({
        type: prepared.type === 'image/png' ? 'image/png' : 'image/jpeg',
        bytes: prepared.bytes,
      });
    });
  });
  return {
    update: (value) => {
      remove.hidden = !value;
      paint(value);
    },
    dispose: () => {
      disposed = true;
      preview.clear();
    },
  };
}
