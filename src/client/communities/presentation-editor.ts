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
    prepare: (work: () => Promise<void>) => Promise<void>;
    save: (payload: Record<string, unknown>) => Promise<void>;
  },
) {
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
  function disableImages(busy: boolean): void {
    section
      .querySelectorAll<HTMLButtonElement>('.community-image-slot button')
      .forEach((button) => {
        button.disabled = busy;
      });
    confirm.disabled = busy;
  }
  function prepare(work: () => Promise<void>): Promise<void> {
    return access.prepare(async () => {
      disableImages(true);
      try {
        await work();
      } finally {
        if (!disposed) disableImages(false);
      }
    });
  }
  const slots = [
    mountImageSlot(section, {
      slot: 'banner',
      current: banner,
      pickLabel: t('Change banner'),
      access: { signal: access.signal, run: prepare },
      change: (value) => {
        banner = value;
        changed = true;
      },
    }),
    mountImageSlot(section, {
      slot: 'photo',
      current: photo,
      pickLabel: t('Change photo'),
      access: { signal: access.signal, run: prepare },
      change: (value) => {
        photo = value;
        changed = true;
      },
    }),
  ];
  const name = field(section, t('Name'), {
      maximum: 100,
      value: state.community.name,
    }),
    description = field(section, t('Description'), {
      maximum: 1000,
      multiline: true,
      value: state.community.description,
    }),
    rules = field(section, t('Rules'), {
      maximum: 4000,
      multiline: true,
      value: state.community.rules,
    });
  section.addEventListener('input', () => {
    changed = true;
  });
  section.append(el('p', t('community.publication.preview')));
  const wire = (value: PendingPublicAvatar | null) =>
    value ? { type: value.type, bytes: encode(value.bytes) } : null;
  const confirm = el('button', t('Confirm changes'), 'primary');
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
  return {
    dirty: () => changed,
    retainDraft: (next: CommunityState | null) =>
      changed &&
      next?.community.id === state.community.id &&
      next.role === state.role &&
      !next.community.archived,
    accept: (next: CommunityState) => {
      Object.assign(state, next);
      photo = next.pendingPhoto;
      banner = next.pendingBanner ?? null;
      changed = false;
      name.value = next.community.name;
      description.value = next.community.description;
      rules.value = next.community.rules;
      slots[0]!.update(banner);
      slots[1]!.update(photo);
    },
    dispose,
  };
}
