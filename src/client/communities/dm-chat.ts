import { messageTime } from '../message-presentation/index.ts';
import { t } from '../../shared/i18n/index.ts';
import type { PublicProfile } from '../../shared/public-profile/index.ts';
import type { SocialRelation } from '../../shared/social-dm/index.ts';
import { chatCollapse, chatComposer, chatIcon } from '../chat-ui/index.ts';
import { emojiText } from '../emoji/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import { showExternalVideos } from '../external-video/index.ts';
import { gifUrls, showGifText } from '../gif-search/index.ts';
import { paintDmAvatar } from './dm-peer-photo.ts';
import { pingChipMarkup } from '../ping/index.ts';
import { communityElement as el } from './elements.ts';

/** Parts of a public @ conversation, laid out exactly as the private chat. */
export interface DmView {
  panel: HTMLElement;
  avatar: HTMLButtonElement;
  title: HTMLElement;
  state: HTMLElement;
  options: HTMLElement;
  gate: HTMLElement;
  older: HTMLButtonElement;
  history: HTMLElement;
  request: HTMLElement;
  form: HTMLElement;
  text: HTMLTextAreaElement;
}

function part<T extends HTMLElement>(root: HTMLElement, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error('Conversa pelo @ incompleta.');
  return node;
}

/** Authored markup only; handles and messages are written as text later. */
export function dmConversationView(host: HTMLElement): DmView {
  const panel = el('article', '', 'card chat-panel social-dm-panel');
  panel.innerHTML = t('html.bac5e10aced2', [
    chatIcon('back'),
    chatIcon('more'),
    chatCollapse(),
    chatComposer('public'),
  ]);
  host.replaceChildren(panel);
  part(panel, '[data-dm-gate]').insertAdjacentHTML(
    'beforebegin',
    pingChipMarkup('alert', t('dm.support-never-asks-seed'), 'warn'),
  );
  return {
    panel,
    avatar: part(panel, '[data-dm-avatar]'),
    title: part(panel, '[data-dm-peer]'),
    state: part(panel, '[data-dm-state]'),
    options: part(panel, '[data-dm-options]'),
    gate: part(panel, '[data-dm-gate]'),
    older: part(panel, '[data-dm-older]'),
    history: part(panel, '[data-dm-history]'),
    request: part(panel, '[data-dm-request]'),
    form: part(panel, '[data-public-compose]'),
    text: part(panel, '[data-public-text]'),
  };
}

/** The list of @ conversations in the same chat frame. */
export function dmListView(host: HTMLElement): HTMLElement {
  const panel = el('article', '', 'card chat-panel social-dm-panel');
  panel.innerHTML = t('html.73d7b945254a', [chatCollapse()]);
  host.replaceChildren(panel);
  return part(panel, '[data-dm-list]');
}

export function paintDmPeer(
  view: DmView,
  input: { profile: PublicProfile; state: string; signal: AbortSignal },
): void {
  const { profile } = input;
  view.title.textContent = `@${profile.handle}`;
  view.state.textContent = input.state;
  paintDmAvatar(view.avatar, profile, input.signal);
}

/** Header subtitle, as the private chat shows presence. */
export function dmStateLabel(
  value: SocialRelation | null,
  own: string | null,
  local: boolean,
): string {
  if (local) return t('Cópia neste aparelho');
  if (!value || value.state === 'none') return t('Sem conversa ainda');
  if (value.blocked) return t('Bloqueada');
  if (value.state === 'pending')
    return value.requester === own
      ? t('Aguardando aceite')
      : t('Pedido de conversa');
  if (value.state === 'rejected') return t('Pedido recusado');
  return t('Mensagem pública pelo @');
}

export type DmRequestAction = 'request' | 'accept' | 'reject';
/**
 * What replaces the composer while there is no approved conversation; null
 * means the composer is shown. The text and actions follow the relation.
 */
export function dmRequestState(input: {
  value: SocialRelation | null;
  own: string | null;
  local: boolean;
  canRequest: boolean;
  handle: string;
}): { text: string; actions: DmRequestAction[] } | null {
  const { value, handle } = input;
  if (input.local)
    return {
      text: t('Cópia local. Conecte para sincronizar e enviar mensagens.'),
      actions: [],
    };
  if (input.canRequest)
    return {
      text: t('Peça para conversar com @{0}. A pessoa precisa aceitar.', [
        handle,
      ]),
      actions: ['request'],
    };
  if (value?.state === 'pending' && value.requester === input.own)
    return {
      text: t('Pedido enviado. Aguardando @{0} aceitar.', [handle]),
      actions: [],
    };
  if (value?.state === 'pending')
    return {
      text: t('@{0} quer conversar com você.', [handle]),
      actions: ['accept', 'reject'],
    };
  if (!value?.canSend)
    return {
      text: t('Esta conversa está recusada, bloqueada ou indisponível.'),
      actions: [],
    };
  return null;
}

/** A message bubble; attachments are filled by the media renderer. */
export function dmBubble(
  item: {
    id: string;
    kind: 'text' | 'attachment';
    text: string;
    sentAt?: number;
    edited?: boolean;
  },
  input: {
    own: boolean;
    handle: string;
    privacy: ExternalMediaConsent;
    signal: AbortSignal;
  },
): { row: HTMLElement; stop: () => void } {
  const row = el(
    'article',
    '',
    input.own ? 'chat-message own' : 'chat-message',
  );
  row.dataset['message'] = item.id;
  row.setAttribute(
    'aria-label',
    input.own
      ? t('Mensagem enviada por você')
      : t('Mensagem recebida de @{0}', [input.handle]),
  );
  const time = messageTime(item.sentAt),
    meta = el('small', '', 'message-meta');
  if (time) meta.append(time);
  if (item.edited) meta.append(el('span', t('Editada')));
  row.append(meta);
  if (item.kind !== 'text') return { row, stop: () => undefined };
  const text = el('p');
  const gif = gifUrls(item.text).length;
  const stops = [
    gif
      ? showGifText(text, item.text, {
          renderText: emojiText,
          privacy: input.privacy,
          signal: input.signal,
        })
      : (emojiText(text, item.text), () => undefined),
  ];
  row.prepend(text);
  stops.push(
    showExternalVideos(row, item.text, {
      privacy: input.privacy,
      signal: input.signal,
    }),
  );
  return {
    row,
    stop: () => {
      for (const stop of stops) stop();
    },
  };
}
