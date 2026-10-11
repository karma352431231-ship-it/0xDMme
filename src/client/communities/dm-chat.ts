import type { PublicProfile } from '../../shared/public-profile/index.ts';
import type { SocialRelation } from '../../shared/social-dm/index.ts';
import { paintAvatar } from '../appearance/index.ts';
import { chatCollapse, chatComposer, chatIcon } from '../chat-ui/index.ts';
import { emojiText } from '../emoji/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import { showExternalVideos } from '../external-video/index.ts';
import { gifMessageUrl, showExternalGif } from '../gif-search/index.ts';
import { showPublicAvatar } from '../public-media/index.ts';
import { communityElement as el } from './elements.ts';

/** Parts of a public @ conversation, laid out exactly as the private chat. */
export interface DmView {
  panel: HTMLElement;
  avatar: HTMLElement;
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
  panel.innerHTML = `<section class="chat-conversation">
    <header class="chat-header"><a class="chat-icon chat-mobile-back" href="#comunidades?view=dms" aria-label="Voltar às mensagens pelo @">${chatIcon('back')}</a><span data-dm-avatar class="chat-peer-avatar" aria-hidden="true">@</span><div class="chat-peer"><h3 data-dm-peer></h3><p data-dm-state></p></div><details class="chat-options"><summary class="chat-icon" aria-label="Opções da conversa" title="Opções da conversa">${chatIcon('more')}</summary><div class="chat-popover" data-dm-options></div></details>${chatCollapse()}</header>
    <div class="chat-thread"><p data-dm-gate class="chat-gate" role="status"></p><button data-dm-older class="chat-older" type="button" hidden>Mensagens anteriores</button><div data-dm-history class="chat-history" tabindex="0" aria-label="Mensagens da conversa"></div></div>
    <div data-dm-request class="dm-request" hidden></div>
    ${chatComposer('public')}
  </section>`;
  host.replaceChildren(panel);
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
  panel.innerHTML = `<section class="chat-conversation"><header class="chat-header"><div class="chat-peer"><h3>Mensagens pelo @</h3><p>Conversas com perfis públicos</p></div>${chatCollapse()}</header><div class="chat-thread"><div data-dm-list class="dm-list"></div></div></section>`;
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
  view.avatar.replaceChildren();
  paintAvatar(view.avatar, { label: profile.handle, seed: profile.id });
  if (profile.avatar)
    showPublicAvatar(view.avatar, {
      kind: 'avatar',
      target: profile.id,
      reference: profile.avatar,
      signal: input.signal,
    });
}

/** Header subtitle, as the private chat shows presence. */
export function dmStateLabel(
  value: SocialRelation | null,
  own: string | null,
  local: boolean,
): string {
  if (local) return 'Cópia neste aparelho';
  if (!value || value.state === 'none') return 'Sem conversa ainda';
  if (value.blocked) return 'Bloqueada';
  if (value.state === 'pending')
    return value.requester === own ? 'Aguardando aceite' : 'Pedido de conversa';
  if (value.state === 'rejected') return 'Pedido recusado';
  return 'Mensagem pública pelo @';
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
      text: 'Cópia local. Conecte para sincronizar e enviar mensagens.',
      actions: [],
    };
  if (input.canRequest)
    return {
      text: `Peça para conversar com @${handle}. A pessoa precisa aceitar.`,
      actions: ['request'],
    };
  if (value?.state === 'pending' && value.requester === input.own)
    return {
      text: `Pedido enviado. Aguardando @${handle} aceitar.`,
      actions: [],
    };
  if (value?.state === 'pending')
    return {
      text: `@${handle} quer conversar com você.`,
      actions: ['accept', 'reject'],
    };
  if (!value?.canSend)
    return {
      text: 'Esta conversa está recusada, bloqueada ou indisponível.',
      actions: [],
    };
  return null;
}

/** A message bubble; attachments are filled by the media renderer. */
export function dmBubble(
  item: { id: string; kind: 'text' | 'attachment'; text: string },
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
      ? 'Mensagem enviada por você'
      : `Mensagem recebida de @${input.handle}`,
  );
  if (item.kind !== 'text') return { row, stop: () => undefined };
  const text = el('p');
  const gif = gifMessageUrl(item.text);
  const stops = [
    gif
      ? showExternalGif(text, gif, {
          privacy: input.privacy,
          signal: input.signal,
        })
      : (emojiText(text, item.text), () => undefined),
  ];
  row.append(text);
  if (!gif)
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
