import { publicIdentityAvatar } from '../public-identity/index.ts';
import { upvoteRows } from './upvotes.ts';
import {
  t,
  translatedError,
  currentLanguage,
} from '../../shared/i18n/index.ts';
export { noticeLink, bindNoticeRow } from './notice-link.ts';
import { ActivitySeen } from './seen.ts';
import { mentionRows } from './mentions.ts';
import { PublicationPreview } from './publication-preview.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import { publicationTitle, publicationQuote } from './publications.ts';
import { noticeLink, bindNoticeRow } from './notice-link.ts';
import { moderationRows } from './moderation.ts';
import { ActivityUpdates } from './updates.ts';
import { missingPublicProfile } from '../public-action-guidance/index.ts';
import type { LiveEvent } from '../message-live/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import { displayName, paintAvatar, shortAddress } from '../appearance/index.ts';
import { pingNotice } from '../ping/index.ts';

export type { ActivitySources } from './sources.ts';
import { empty, readActivitySnapshot } from './sources.ts';
import type { ActivitySources, Loaded } from './sources.ts';

export type ActivityFilter = 'all' | 'requests' | 'replies' | 'mentions';
export type ActivityGroup =
  | 'requests'
  | 'calls'
  | 'invites'
  | 'replies'
  | 'transfers'
  | 'moderation'
  | 'upvotes'
  | 'mentions';
const groupOrder: readonly ActivityGroup[] = [
  'requests',
  'calls',
  'invites',
  'replies',
  'upvotes',
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
  if (minutes < 1) return t('activity.now');
  if (minutes < 60) return t('{0} min ago', [minutes]);
  if (minutes < 1440) return t('{0} h ago', [Math.floor(minutes / 60)]);
  return new Date(iso).toLocaleDateString(currentLanguage());
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
  options: {
    countChanged: (count: number) => void;
    externalMedia?: ExternalMediaConsent;
  },
) {
  const seen = new ActivitySeen();
  const publicationPreview = new PublicationPreview(options.externalMedia);
  let session: AccountSession | null = null;
  let snapshot = empty();
  let host: HTMLElement | null = null;
  let generation = 0;
  let busy = false;
  let feedback = '';
  let filter: ActivityFilter = 'all';
  const updates = new ActivityUpdates({
    read,
    failed: (error) => {
      // Without a public profile (or right after creating one, before every
      // public source agrees) the public parts are simply not there yet:
      // that is a state, not an error to show.
      feedback = missingPublicProfile(error)
        ? ''
        : error instanceof Error
          ? translatedError(error.message)
          : t('Could not load.');
      render();
    },
  });

  function count(): number {
    const ids = [
      ...snapshot.upvotes.items
        .filter((item) => !item.read)
        .map((item) => 'upvote:' + item.id),
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
  async function read(): Promise<void> {
    if (!session) return;
    const old = ++generation;
    const loaded = await readActivitySnapshot(
      sources,
      () => old === generation,
    );
    if (!loaded || old !== generation) return;
    snapshot = loaded;
    options.countChanged(count());
    render();
  }
  function refresh(): Promise<void> {
    return updates.refresh();
  }
  function invalidate(): void {
    updates.stop();
    generation++;
    snapshot = empty();
    publicationPreview.clear();
    options.countChanged(0);
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
        error instanceof Error
          ? translatedError(error.message)
          : t('The action was not completed.');
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
    avatar?: HTMLElement | { label: string; seed: string };
    title: string;
    /** Content shown in full contrast between the title and the detail. */
    quote?: string | HTMLElement;
    detail: string;
    actions: HTMLElement[];
    read?: boolean;
  }): HTMLLIElement {
    const item = element('li', '', 'activity-row');
    item.dataset['read'] = String(input.read === true);
    if (input.avatar instanceof HTMLElement) item.append(input.avatar);
    else if (input.avatar) {
      const avatar = element('span', '', 'conversation-avatar');
      avatar.setAttribute('aria-hidden', 'true');
      paintAvatar(avatar, input.avatar);
      item.append(avatar);
    }
    const copy = element('div', '', 'activity-copy');
    copy.append(element('strong', input.title));
    if (input.quote)
      copy.append(
        typeof input.quote === 'string'
          ? element('p', input.quote, 'activity-quote')
          : input.quote,
      );
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
        detail: t('Wants to chat · {0} · {1}', [
          peer.ecosystem.toUpperCase(),
          shortAddress(peer.address),
        ]),
        actions: [
          button(
            t('Accept'),
            () => sources.respondRequest(peer.accountId, true),
            t('Contact approved in both directions.'),
            true,
          ),
          button(
            t('Decline'),
            () => sources.respondRequest(peer.accountId, false),
            t(
              'Request declined. The same identity cannot repeat this request.',
            ),
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
            ? t('{0} invited you to a group', [invite.actor])
            : t('{0} offered you ownership of a group', [invite.actor]),
        detail:
          invite.kind === 'invite'
            ? t('Joining adds the group to your conversation list.')
            : t('Administration only changes after you accept.'),
        actions: [
          button(
            invite.kind === 'invite' ? t('Sign in') : t('Accept ownership'),
            () => sources.respondGroupInvite(invite.id, true),
            invite.kind === 'invite'
              ? t('You joined the group.')
              : t('Ownership accepted.'),
            true,
          ),
          button(
            t('Decline'),
            () => sources.respondGroupInvite(invite.id, false),
            t('Invitation declined.'),
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
        ...(preview?.identity
          ? {
              avatar: publicIdentityAvatar(
                preview.identity,
                publicationPreview.signal,
              ),
            }
          : preview?.author
            ? { avatar: { label: preview.author, seed: preview.author } }
            : {}),
        title: publicationTitle(preview?.author, reply.kind ?? 'reply'),
        quote: publicationPreview.quote(preview, reply.kind ?? 'reply'),
        detail: relativeTime(reply.createdAt),
        actions: [
          noticeLink({
            label: t('Open'),
            href: `#communities?id=${reply.community}&post=${reply.reply}`,
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
        detail: t('Community transfer awaiting you'),
        actions: [link(t('View'), '#communities?view=invitations')],
      }),
    );
  }
  function callRows(): HTMLElement[] {
    return snapshot.calls.items.map((call) =>
      row({
        avatar: { label: call.label, seed: call.peer },
        title: displayName(call.label),
        detail: t('Missed voice call · {0}', [
          new Date(call.at).toLocaleString(currentLanguage()),
        ]),
        actions: [],
      }),
    );
  }
  function render(): void {
    publicationPreview.clear();
    if (!host) return;
    const heading = element('header', '', 'activity-heading');
    heading.append(element('h2', t('Activity')));
    if (session)
      heading.append(
        button(t('Refresh'), () => Promise.resolve(), t('Activity updated.')),
      );
    const status = element('p', feedback, 'activity-feedback');
    status.setAttribute('role', 'status');
    host.replaceChildren(heading, status);
    if (!session) {
      host.append(
        element(
          'p',
          t('Sign in to see requests, invitations and publications.'),
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
    else
      host.append(
        pingNotice('sleepy', t('Nothing new here.'), 'activity-empty'),
      );
  }
  function filters(): HTMLElement {
    const nav = element('nav', '', 'activity-filters');
    nav.setAttribute('aria-label', t('Filter activity'));
    for (const [key, label] of [
      ['all', t('All')],
      ['requests', t('Requests')],
      ['replies', t('Publications')],
      ['mentions', t('Mentions')],
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
        section(t('Conversation requests'), snapshot.requests, requestRows()),
      ],
      [
        'calls',
        section(
          t('Chamadas perdidas'),
          snapshot.calls,
          callRows(),
          snapshot.calls.items.length
            ? button(
                t('Clear'),
                () => sources.clearMissedCalls(),
                t('Missed calls removed from the list on all devices.'),
              )
            : undefined,
        ),
      ],
      [
        'moderation',
        section(
          t('Automated moderation'),
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
          t('Mentions of you'),
          snapshot.mentions,
          mentionRows(snapshot.mentions.items, {
            preview: (text) => publicationPreview.text(text),
            signal: publicationPreview.signal,
            open: async (id) => {
              if (!sources.markMentionsRead)
                throw new Error('Mention read unavailable.');
              await sources.markMentionsRead([id]);
            },
            current: () =>
              current === generation && host !== null && session !== null,
          }),
        ),
      ],
      [
        'invites',
        section(t('Group invitations'), snapshot.invites, inviteRows()),
      ],
      [
        'replies',
        section(t('Community publications'), snapshot.replies, replyRows()),
      ],
      [
        'upvotes',
        section(
          t('upvote.heading'),
          snapshot.upvotes,
          upvoteRows(snapshot.upvotes.items, {
            preview: (text) => publicationPreview.text(text),
            signal: publicationPreview.signal,
            current: () =>
              current === generation && host !== null && session !== null,
            open: async (ids) => {
              if (!sources.markUpvotesRead)
                throw new Error('Upvote read unavailable.');
              await sources.markUpvotesRead(ids);
            },
            changed: () => options.countChanged(count()),
          }),
        ),
      ],
      [
        'transfers',
        section(t('Community transfers'), snapshot.transfers, transferRows()),
      ],
    ];
  }
  return {
    refresh,
    ready: () => updates.start(),
    event(event: LiveEvent): void {
      if (['invalidated', 'revoked', 'ended'].includes(event)) invalidate();
      else updates.event(event);
    },
    mount(container: HTMLElement): void {
      host = container;
      options.countChanged(count());
      render();
      void refresh();
    },
    leave(): void {
      publicationPreview.clear();
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
      publicationPreview.clear();
      updates.stop();
      feedback = '';
      filter = 'all';
      options.countChanged(0);
      render();
    },
    canActivate: () =>
      !busy && !host?.querySelector('.activity-link[aria-busy="true"]'),
  };
}
