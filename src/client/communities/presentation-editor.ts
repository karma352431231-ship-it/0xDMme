import { t } from '../../shared/i18n/index.ts';
import { encode } from '../../shared/account/index.ts';
import { communityMeta } from '../../shared/communities/index.ts';
import type { CommunityState } from '../../shared/communities/index.ts';
import type { PendingPublicAvatar } from '../../shared/public-avatar/index.ts';
import { communityElement as el, communityField as field } from './elements.ts';
import { mountImageSlot } from './image-slots.ts';

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
  const slots = [
    mountImageSlot(section, {
      slot: 'banner',
      current: banner,
      pickLabel: t('Trocar banner'),
      access,
      change: (value) => {
        banner = value;
        changed = true;
      },
    }),
    mountImageSlot(section, {
      slot: 'photo',
      current: photo,
      pickLabel: t('Trocar foto'),
      access,
      change: (value) => {
        photo = value;
        changed = true;
      },
    }),
  ];
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
    slots.forEach((slot) => slot.dispose());
    access.signal.removeEventListener('abort', dispose);
  };
  access.signal.addEventListener('abort', dispose, { once: true });
  return { dirty: () => changed, dispose };
}
