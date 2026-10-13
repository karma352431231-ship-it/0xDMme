import { t } from '../../shared/i18n/index.ts';
import { encode } from '../../shared/account/index.ts';
import { communityMeta } from '../../shared/communities/index.ts';
import type { CommunityState } from '../../shared/communities/index.ts';
import type { PendingPublicAvatar } from '../../shared/public-avatar/index.ts';
import { preparePhoto } from '../attachment-images/index.ts';
import { communityElement as el, communityField as field } from './elements.ts';

/** Image selection only prepares local bytes; one confirmed request commits the presentation. */
export function communityPresentationEditor(
  host: HTMLElement,
  state: CommunityState,
  access: {
    signal: AbortSignal;
    run: (work: () => Promise<void>) => Promise<void>;
    save: (payload: Record<string, unknown>) => Promise<void>;
  },
): { dirty: () => boolean; dispose: () => void } {
  const urls = new Set<string>();
  let photo = state.pendingPhoto,
    banner = state.pendingBanner ?? null,
    changed = false,
    disposed = false;
  const section = el(
    'section',
    '',
    'community-presentation-editor community-card',
  );
  host.append(section);
  const pick = (
    slot: 'photo' | 'banner',
    current: PendingPublicAvatar | null,
  ) => {
    let currentUrl: string | null = null;
    const slotNode = el(
      'div',
      '',
      `community-image-slot community-image-slot-${slot}`,
    );
    section.append(slotNode);
    const button = el(
        'button',
        '',
        `community-image-pick community-image-${slot}`,
      ),
      image = el('img'),
      hint = el(
        'span',
        slot === 'photo' ? t('Trocar foto') : t('Trocar banner'),
      );
    button.type = 'button';
    button.setAttribute('aria-label', hint.textContent ?? '');
    button.append(image, hint);
    slotNode.append(button);
    const paint = (value: PendingPublicAvatar | null) => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
        urls.delete(currentUrl);
        currentUrl = null;
      }
      image.hidden = !value;
      if (value) {
        image.src = URL.createObjectURL(
          new Blob([value.bytes], { type: value.type }),
        );
        currentUrl = image.src;
        urls.add(image.src);
      } else image.removeAttribute('src');
    };
    paint(current);
    const input = el('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.hidden = true;
    slotNode.append(input);
    button.addEventListener('click', () => input.click());
    const set = (value: PendingPublicAvatar | null) => {
      if (slot === 'photo') photo = value;
      else banner = value;
      changed = true;
      remove.hidden = !value;
      paint(value);
    };
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.value = '';
      if (file)
        void access.run(async () => {
          const prepared = await preparePhoto(file);
          if (!access.signal.aborted && !disposed)
            set({
              type: prepared.type === 'image/png' ? 'image/png' : 'image/jpeg',
              bytes: prepared.bytes,
            });
        });
    });
    const remove = el('button', t('×'), 'community-image-remove');
    remove.type = 'button';
    remove.setAttribute(
      'aria-label',
      slot === 'photo' ? t('Remover foto') : t('Remover banner'),
    );
    remove.title = slot === 'photo' ? t('Remover foto') : t('Remover banner');
    remove.hidden = !current;
    remove.addEventListener('click', () => set(null));
    slotNode.append(remove);
  };
  pick('banner', banner);
  pick('photo', photo);
  const name = field(section, t('Nome'), {
      maximum: 100,
      value: state.community.name,
    }),
    description = field(section, t('Descrição'), {
      maximum: 1000,
      multiline: true,
      value: state.community.description,
    }),
    rules = field(section, t('Regras'), {
      maximum: 4000,
      multiline: true,
      value: state.community.rules,
    });
  section.addEventListener('input', () => {
    changed = true;
  });
  section.append(
    el(
      'p',
      t(
        'As alterações ficam como prévia neste aparelho até confirmar. Imagens confirmadas passam pela análise do app.',
      ),
    ),
  );
  const wire = (value: PendingPublicAvatar | null) =>
    value ? { type: value.type, bytes: encode(value.bytes) } : null;
  const confirm = el('button', t('Confirmar alterações'), 'primary');
  confirm.type = 'button';
  confirm.addEventListener('click', () => {
    void access.run(async () => {
      if (access.signal.aborted || disposed) return;
      const meta = communityMeta({
        name: name.value,
        description: description.value,
        rules: rules.value,
      });
      await access.save({
        id: state.community.id,
        revision: state.community.revision,
        meta,
        photo: wire(photo),
        banner: wire(banner),
      });
      changed = false;
    });
  });
  section.append(confirm);
  const dispose = () => {
    disposed = true;
    urls.forEach((url) => URL.revokeObjectURL(url));
    urls.clear();
    access.signal.removeEventListener('abort', dispose);
  };
  access.signal.addEventListener('abort', dispose, { once: true });
  return { dirty: () => changed, dispose };
}
