export { noticeLink, bindNoticeRow } from './notice-link.ts';
import { ActivitySeen } from './seen.ts';
import { mentionRows } from './mentions.ts';
import type { MentionNotification } from '../../shared/mention-notifications/index.ts';
import { publicationTitle, publicationQuote } from './publications.ts';
import { noticeLink, bindNoticeRow } from './notice-link.ts';
import { moderationRows, watchModeration } from './moderation.ts';
import type { ModerationActivity } from './moderation.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import { displayName, paintAvatar, shortAddress } from '../appearance/index.ts';

/**
 * Atividade (docs/UI_PAINEIS_E_TEMAS.md): one place for items the app already
 * receives. Each source keeps its own API, authorization and checks; this module
 * only reads them on demand and calls the same actions as the original screens.
 */
export interface ActivitySources {
  mentions?: () => Promise<readonly MentionNotification[]>;
  markMentionsRead?: (ids: readonly string[]) => Promise<void>;
  moderation?: () => Promise<readonly ModerationActivity[]>;
  markModerationRead?: (ids: readonly string[]) => Promise<void>;
  requests: () => Promise<
    readonly {
      accountId: string;
      name: string;
      address: string;
      ecosystem: string;
    }[]
  >;
  respondRequest: (accountId: string, accept: boolean) => Promise<void>;
  groupInvites: () => Promise<
    readonly { id: string; kind: 'invite' | 'transfer'; actor: string }[]
  >;
  respondGroupInvite: (id: string, accept: boolean) => Promise<void>;
  replies: () => Promise<
    readonly {
      reply: string;
      community: string;
      createdAt: string;
      read?: boolean;
      kind?: 'post' | 'reply';
      /** Author and start of the reply, already filtered by public visibility. */
      preview: {
        author: string | null;
        text: string;
        media: boolean;
        status: 'visible' | 'removed' | 'deleted';
      } | null;
    }[]
  >;
  markRepliesRead: (replies: readonly string[]) => Promise<void>;
  transfers: () => Promise<readonly { id: string; name: string }[]>;
  missedCalls: () => Promise<
    readonly { id: string; peer: string; label: string; at: number }[]
  >;
  clearMissedCalls: () => Promise<void>;
}

type Loaded<T> = { items: readonly T[]; problem: string };

export type ActivityFilter = 'all' | 'requests' | 'replies' | 'mentions';
export type ActivityGroup =
  | 'requests'
  | 'calls'
  | 'invites'
  | 'replies'
  | 'transfers'
  | 'moderation'
  | 'mentions';
const groupOrder: readonly ActivityGroup[] = [
  'requests',
  'calls',
  'invites',
  'replies',
  'mentions',
  'transfers',
  'moderation',
];
/**
 * Tudo shows every group. Pedidos are the items waiting for an answer
 * (conversation, group invite, community transfer); Respostas are community replies.
 */
export function activityGroups(
  filter: ActivityFilter,
): readonly ActivityGroup[] {
  if (filter === 'requests') return ['requests', 'invites', 'transfers'];
  if (filter === 'replies') return ['replies'];
  if (filter === 'mentions') return ['mentions'];
  return groupOrder;
}
type Item<
  K extends
    'requests' | 'groupInvites' | 'replies' | 'transfers' | 'missedCalls',
> = Awaited<ReturnType<ActivitySources[K]>>[number];

interface Snapshot {
  mentions: Loaded<MentionNotification>;
  moderation: Loaded<ModerationActivity>;
  requests: Loaded<Item<'requests'>>;
  invites: Loaded<Item<'groupInvites'>>;
  replies: Loaded<Item<'replies'>>;
  transfers: Loaded<Item<'transfers'>>;
  calls: Loaded<Item<'missedCalls'>>;
}

function empty(): Snapshot {
  return {
    mentions: { items: [], problem: '' },
    moderation: { items: [], problem: '' },
    requests: { items: [], problem: '' },
    invites: { items: [], problem: '' },
    replies: { items: [], problem: '' },
    transfers: { items: [], problem: '' },
    calls: { items: [], problem: '' },
  };
}

async function load<T>(read: () => Promise<readonly T[]>): Promise<Loaded<T>> {
  try {
    return { items: await read(), problem: '' };
  } catch (error: unknown) {
    return {
      items: [],
      problem:
        error instanceof Error ? error.message : 'Não foi possível carregar.',
    };
  }
}

/** The reply itself, or why it cannot be shown. */
export function replyQuote(
  preview: {
    text: string;
    media: boolean;
    status: 'visible' | 'removed' | 'deleted';
  } | null,
): string {
  return publicationQuote(preview, 'reply');
}
function relativeTime(iso: string): string {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(iso)) / 60_000),
  );
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  if (minutes < 1440) return `há ${Math.floor(minutes / 60)} h`;
  return new Date(iso).toLocaleDateString('pt-BR');
}
function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = '',
  className = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

export function startActivity(
  sources: ActivitySources,
  options: { countChanged: (count: number) => void },
) {
  const seen = new ActivitySeen();
  let session: AccountSession | null = null;
  let snapshot = empty();
  let host: HTMLElement | null = null;
  let generation = 0;
  let busy = false;
  let feedback = '';
  let filter: ActivityFilter = 'all';
  let moderationAbort = new AbortController();

  function count(): number {
    const ids = [
      ...snapshot.requests.items.map((item) => 'request:' + item.accountId),
      ...snapshot.invites.items.map((item) => 'invite:' + item.id),
      ...snapshot.transfers.items.map((item) => 'transfer:' + item.id),
      ...snapshot.calls.items.map((item) => 'call:' + item.id),
      ...snapshot.replies.items
        .filter((item) => !item.read)
        .map((item) => 'publication:' + item.reply),
      ...snapshot.moderation.items
        .filter((item) => !item.read)
        .map((item) => 'moderation:' + item.id),
      ...snapshot.mentions.items
        .filter((item) => !item.read)
        .map((item) => 'mention:' + item.id),
    ];
    if (host) {
      seen.view(ids);
      return 0;
    }
    return seen.count(ids);
  }
  async function refresh(): Promise<void> {
    if (!session) return;
    const old = ++generation;
    const [requests, invites, replies, transfers, calls, moderation, mentions] =
      await Promise.all([
        load(sources.requests),
        load(sources.groupInvites),
        load(sources.replies),
        load(sources.transfers),
        load(sources.missedCalls),
        load(sources.moderation ?? (() => Promise.resolve([]))),
        load(sources.mentions ?? (() => Promise.resolve([]))),
      ]);
    if (old !== generation) return;
    snapshot = {
      requests,
      invites,
      replies,
      transfers,
      calls,
      moderation,
      mentions,
    };
    options.countChanged(count());
    render();
  }
  async function refreshPublicNotices(): Promise<void> {
    if (!session) return;
    const old = generation;
    const [moderation, mentions] = await Promise.all([
      load(sources.moderation ?? (() => Promise.resolve([]))),
      load(sources.mentions ?? (() => Promise.resolve([]))),
    ]);
    if (old !== generation) return;
    snapshot.moderation = moderation;
    snapshot.mentions = mentions;
    options.countChanged(count());
    render();
  }
  async function act(work: () => Promise<void>, done: string): Promise<void> {
    if (busy) return;
    busy = true;
    feedback = '';
    render();
    try {
      await work();
      feedback = done;
    } catch (error: unknown) {
      feedback =
        error instanceof Error ? error.message : 'A ação não foi concluída.';
    } finally {
      busy = false;
    }
    await refresh();
    render();
  }
  function button(
    label: string,
    work: () => Promise<void>,
    done: string,
    primary = false,
  ): HTMLButtonElement {
    const node = element('button', label, primary ? 'primary' : '');
    node.type = 'button';
    node.disabled = busy;
    node.addEventListener('click', () => {
      void act(work, done);
    });
    return node;
  }
  function section(
    title: string,
    loaded: Loaded<unknown>,
    rows: HTMLElement[],
    extra?: HTMLElement,
  ): HTMLElement | null {
    if (!rows.length && !loaded.problem) return null;
    const node = element('section', '', 'activity-group');
    const heading = element('h3', title);
    const unread = rows.filter(
      (item) => item.dataset['read'] !== 'true',
    ).length;
    if (unread)
      heading.append(element('span', String(unread), 'activity-count'));
    node.append(heading);
    if (loaded.problem)
      node.append(element('p', loaded.problem, 'activity-problem'));
    const list = element('ul', '', 'activity-list');
    for (const row of rows) list.append(row);
    if (rows.length) node.append(list);
    if (extra) node.append(extra);
    return node;
  }
  function row(input: {
    avatar?: { label: string; seed: string };
    title: string;
    /** Content shown in full contrast between the title and the detail. */
    quote?: string;
    detail: string;
    actions: HTMLElement[];
    read?: boolean;
  }): HTMLLIElement {
    const item = element('li', '', 'activity-row');
    item.dataset['read'] = String(input.read === true);
    if (input.avatar) {
      const avatar = element('span', '', 'conversation-avatar');
      avatar.setAttribute('aria-hidden', 'true');
      paintAvatar(avatar, input.avatar);
      item.append(avatar);
    }
    const copy = element('div', '', 'activity-copy');
    copy.append(element('strong', input.title));
    if (input.quote) copy.append(element('p', input.quote, 'activity-quote'));
    copy.append(element('small', input.detail));
    const actions = element('div', '', 'activity-actions');
    actions.append(...input.actions);
    item.append(copy, actions);
    const notice = input.actions.find(
      (action) => action.dataset['notice'] === 'true',
    );
    if (notice) bindNoticeRow(item, notice);
    return item;
  }
  function link(label: string, href: string): HTMLAnchorElement {
    const node = element('a', label, 'activity-link');
    node.href = href;
    return node;
  }
  function requestRows(): HTMLElement[] {
    return snapshot.requests.items.map((peer) =>
      row({
        avatar: { label: peer.name || peer.address, seed: peer.address },
        title: displayName(peer.name || peer.address),
        detail: `Quer conversar · ${peer.ecosystem.toUpperCase()} · ${shortAddress(peer.address)}`,
        actions: [
          button(
            'Aceitar',
            () => sources.respondRequest(peer.accountId, true),
            'Contato aprovado nos dois sentidos.',
            true,
          ),
          button(
            'Recusar',
            () => sources.respondRequest(peer.accountId, false),
            'Pedido recusado. A mesma identidade não pode repetir este pedido.',
          ),
        ],
      }),
    );
  }
  function inviteRows(): HTMLElement[] {
    return snapshot.invites.items.map((invite) =>
      row({
        title:
          invite.kind === 'invite'
            ? `${invite.actor} convidou você para um grupo`
            : `${invite.actor} ofereceu a propriedade de um grupo`,
        detail:
          invite.kind === 'invite'
            ? 'Entrar mostra o grupo na sua lista de conversas.'
            : 'A administração só muda depois do seu aceite.',
        actions: [
          button(
            invite.kind === 'invite' ? 'Entrar' : 'Aceitar propriedade',
            () => sources.respondGroupInvite(invite.id, true),
            invite.kind === 'invite'
              ? 'Você entrou no grupo.'
              : 'Propriedade aceita.',
            true,
          ),
          button(
            'Recusar',
            () => sources.respondGroupInvite(invite.id, false),
            'Convite recusado.',
          ),
        ],
      }),
    );
  }
  function replyRows(): HTMLElement[] {
    return snapshot.replies.items.map((reply) => {
      const preview = reply.preview;
      const current = generation;
      return row({
        read: reply.read === true,
        ...(preview?.author
          ? { avatar: { label: preview.author, seed: preview.author } }
          : {}),
        title: publicationTitle(preview?.author, reply.kind ?? 'reply'),
        quote: publicationQuote(preview, reply.kind ?? 'reply'),
        detail: relativeTime(reply.createdAt),
        actions: [
          noticeLink({
            label: 'Abrir',
            href: `#comunidades?id=${reply.community}&post=${reply.reply}`,
            read: reply.read === true,
            acknowledge: () => sources.markRepliesRead([reply.reply]),
            current: () => current === generation,
            acknowledged: () => {
              reply.read = true;
              options.countChanged(count());
            },
          }),
        ],
      });
    });
  }
  function transferRows(): HTMLElement[] {
    return snapshot.transfers.items.map((community) =>
      row({
        avatar: { label: community.name, seed: community.id },
        title: community.name,
        detail: 'Transferência de comunidade aguardando você',
        actions: [link('Ver', '#comunidades?view=invitations')],
      }),
    );
  }
  function callRows(): HTMLElement[] {
    return snapshot.calls.items.map((call) =>
      row({
        avatar: { label: call.label, seed: call.peer },
        title: displayName(call.label),
        detail: `Chamada de voz não atendida · ${new Date(call.at).toLocaleString('pt-BR')}`,
        actions: [],
      }),
    );
  }
  function render(): void {
    if (!host) return;
    const heading = element('header', '', 'activity-heading');
    heading.append(element('h2', 'Atividade'));
    if (session)
      heading.append(
        button('Atualizar', () => Promise.resolve(), 'Atividade atualizada.'),
      );
    const status = element('p', feedback, 'activity-feedback');
    status.setAttribute('role', 'status');
    host.replaceChildren(heading, status);
    if (!session) {
      host.append(
        element(
          'p',
          'Entre na conta para ver pedidos, convites e publicações.',
          'activity-empty',
        ),
      );
      return;
    }
    status.before(filters());
    const shown = activityGroups(filter);
    const groups = groupSections()
      .filter(([group]) => shown.includes(group))
      .map(([, node]) => node)
      .filter((node): node is HTMLElement => node !== null);
    if (groups.length) host.append(...groups);
    else host.append(element('p', 'Nada novo por aqui.', 'activity-empty'));
  }
  function filters(): HTMLElement {
    const nav = element('nav', '', 'activity-filters');
    nav.setAttribute('aria-label', 'Filtrar atividade');
    for (const [key, label] of [
      ['all', 'Tudo'],
      ['requests', 'Pedidos'],
      ['replies', 'Publicações'],
      ['mentions', 'Menções'],
    ] as const) {
      const choice = element('button', label);
      choice.type = 'button';
      choice.setAttribute('aria-pressed', String(filter === key));
      choice.addEventListener('click', () => {
        filter = key;
        render();
      });
      nav.append(choice);
    }
    return nav;
  }
  function groupSections(): [ActivityGroup, HTMLElement | null][] {
    const current = generation;
    return [
      [
        'requests',
        section('Pedidos de conversa', snapshot.requests, requestRows()),
      ],
      [
        'calls',
        section(
          'Chamadas perdidas',
          snapshot.calls,
          callRows(),
          snapshot.calls.items.length
            ? button(
                'Limpar',
                () => sources.clearMissedCalls(),
                'Chamadas perdidas removidas da lista em todos os aparelhos.',
              )
            : undefined,
        ),
      ],
      [
        'moderation',
        section(
          'Moderação automática',
          snapshot.moderation,
          moderationRows(snapshot.moderation.items, {
            acknowledge: async (id) => {
              await sources.markModerationRead?.([id]);
              const item = snapshot.moderation.items.find(
                (notice) => notice.id === id,
              );
              if (item) item.read = true;
              options.countChanged(count());
            },
            current: () =>
              current === generation && host !== null && session !== null,
          }),
        ),
      ],
      [
        'mentions',
        section(
          'Menções a você',
          snapshot.mentions,
          mentionRows(snapshot.mentions.items, {
            open: async (id) => {
              if (!sources.markMentionsRead)
                throw new Error('Leitura de menção indisponível.');
              await sources.markMentionsRead([id]);
            },
            current: () =>
              current === generation && host !== null && session !== null,
          }),
        ),
      ],
      ['invites', section('Convites de grupo', snapshot.invites, inviteRows())],
      [
        'replies',
        section('Publicações nas comunidades', snapshot.replies, replyRows()),
      ],
      [
        'transfers',
        section(
          'Transferências de comunidade',
          snapshot.transfers,
          transferRows(),
        ),
      ],
    ];
  }
  return {
    /** Loads once per call: opening the page or a new authorized session. */
    refresh,
    mount(container: HTMLElement): void {
      host = container;
      options.countChanged(count());
      render();
      void refresh();
    },
    leave(): void {
      host = null;
      feedback = '';
    },
    setSession(value: AccountSession | null): void {
      if (
        value?.accountId === session?.accountId &&
        value?.csrf === session?.csrf
      )
        return;
      session = value;
      seen.setSession(value);
      generation++;
      snapshot = empty();
      moderationAbort.abort();
      moderationAbort = new AbortController();
      if (value && sources.moderation && typeof document !== 'undefined')
        watchModeration(refreshPublicNotices, moderationAbort.signal);
      feedback = '';
      filter = 'all';
      options.countChanged(0);
      render();
    },
    canActivate: () =>
      !busy && !host?.querySelector('.activity-link[aria-busy="true"]'),
  };
}
