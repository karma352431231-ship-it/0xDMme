import { t, translatedError } from '../../shared/i18n/index.ts';
import { encode } from '../../shared/account/index.ts';
import {
  communityMeta,
  communityPolicy,
  communityState,
} from '../../shared/communities/index.ts';
import type { CommunityState } from '../../shared/communities/index.ts';
import type { PendingPublicAvatar } from '../../shared/public-avatar/index.ts';
import { communityElement as el } from './elements.ts';
import { mountImageSlot } from './image-slots.ts';

type Meta = { name: string; description: string; rules: string };

/**
 * Create a community with an optional banner and photo. The server creates the
 * community first; chosen images then go through the same confirmed
 * presentation request (and app review) as editing an existing community.
 * A retry after an image failure reuses the created community.
 */
export function mountCommunityCreation(
  host: HTMLElement,
  options: {
    signal: AbortSignal;
    run: (work: () => Promise<void>) => Promise<void>;
    fields: (container: HTMLElement) => () => Meta;
    request: (
      operation: string,
      data: Record<string, unknown>,
    ) => Promise<unknown>;
    current: () => boolean;
    open: (id: string) => void;
  },
): void {
  const card = el('article', '', 'card community-card community-create');
  host.append(card);
  const head = el('header', '', 'community-create-head');
  head.append(
    el('h2', t('Criar comunidade')),
    el(
      'p',
      t(
        'Comunidades são públicas e gratuitas. Qualquer perfil público autorizado pode participar sem precisar seguir.',
      ),
    ),
  );
  card.append(head);
  const images: {
    photo: PendingPublicAvatar | null;
    banner: PendingPublicAvatar | null;
  } = { photo: null, banner: null };
  const media = el('section', '', 'community-create-media');
  media.setAttribute('aria-label', t('community.create.images'));
  card.append(media);
  const slots = (['banner', 'photo'] as const).map((slot) =>
    mountImageSlot(media, {
      slot,
      current: null,
      pickLabel:
        slot === 'photo'
          ? t('community.create.add-photo')
          : t('community.create.add-banner'),
      access: options,
      change: (value) => {
        images[slot] = value;
      },
    }),
  );
  card.append(
    el('p', t('community.create.images-hint'), 'community-create-hint'),
  );
  const form = el('div', '', 'community-create-fields');
  card.append(form);
  const meta = options.fields(form);
  const notice = el('aside', '', 'community-create-notice');
  notice.append(
    el('h3', t('Aviso sobre conteúdo público')),
    el('p', t(communityPolicy)),
  );
  card.append(notice);
  const id = crypto.randomUUID();
  let created: CommunityState | null = null;
  const status = el('p', '', 'community-create-status');
  status.setAttribute('role', 'status');
  const submit = el(
    'button',
    t('Criar comunidade'),
    'primary community-create-submit',
  );
  submit.type = 'button';
  submit.addEventListener('click', () => {
    void options.run(async () => {
      status.textContent = '';
      created ??= communityState(
        await options.request('create', { id, meta: meta() }),
      );
      if (!options.current()) return;
      const failure = await applyImages(
        created,
        meta(),
        images,
        options.request,
      );
      if (!options.current()) return;
      if (failure === null) options.open(created.community.id);
      else
        status.textContent = t('{0} {1}', [
          t('community.create.images-failed'),
          failure,
        ]);
    });
  });
  card.append(status, submit);
  // Previews live as long as the page that shows them.
  options.signal.addEventListener(
    'abort',
    () => slots.forEach((slot) => slot.dispose()),
    { once: true },
  );
}

/** Returns null when nothing failed, else the translated reason the images were refused. */
async function applyImages(
  state: CommunityState,
  meta: Meta,
  images: {
    photo: PendingPublicAvatar | null;
    banner: PendingPublicAvatar | null;
  },
  request: (
    operation: string,
    data: Record<string, unknown>,
  ) => Promise<unknown>,
): Promise<string | null> {
  if (!images.photo && !images.banner) return null;
  const wire = (value: PendingPublicAvatar | null) =>
    value ? { type: value.type, bytes: encode(value.bytes) } : null;
  try {
    await request('presentation', {
      id: state.community.id,
      revision: state.community.revision,
      meta: communityMeta(meta),
      photo: wire(images.photo),
      banner: wire(images.banner),
    });
    return null;
  } catch (error: unknown) {
    return error instanceof Error
      ? translatedError(error.message)
      : t('Comunidade indisponível.');
  }
}
