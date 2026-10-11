import { object } from '../../shared/account/index.ts';
import { fingerprint, eventHash } from '../../shared/devices/index.ts';
import type { DirectoryEvent } from '../../shared/devices/index.ts';
import { integer } from '../../shared/vault/index.ts';
import {
  groupEvent,
  groupEventHash,
  groupManager,
  verifyGroupTransition,
  verifyGroupConsent,
} from '../../shared/groups/index.ts';
import type { GroupConsent, GroupEvent } from '../../shared/groups/index.ts';
import { readDirectories } from '../peer-identity/index.ts';
import type { PeerIdentity } from '../peer-identity/index.ts';
import type { AttachmentApi } from '../attachments/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';
import { GroupCache } from './cache.ts';
export interface GroupState {
  state: GroupEvent;
  head: string;
}
interface HistoryPage {
  head: string;
  revision: number;
  events: GroupEvent[];
}
function historyPage(input: unknown): HistoryPage {
  const data = object(input),
    raw = data['events'];
  if (!Array.isArray(raw) || raw.length > 16)
    throw new Error('Histórico de grupo inválido.');
  const values: unknown[] = raw;
  return {
    head: fingerprint(data['head']),
    revision: integer(data['revision'], 100_000),
    events: values.map(groupEvent),
  };
}
function checkProgress(
  previous: GroupEvent | null,
  page: HistoryPage,
  expected: HistoryPage | null,
): void {
  if (
    expected &&
    (expected.head !== page.head || expected.revision !== page.revision)
  )
    throw new Error(
      'Participantes mudaram durante a leitura. Tente novamente.',
    );
  if (previous && previous.revision > page.revision)
    throw new Error('Histórico antigo do grupo.');
}
function checkCachedGroup(previous: GroupEvent | null, groupId: string): void {
  if (previous && previous.groupId !== groupId)
    throw new Error('Histórico local de outro grupo.');
}
export class GroupGovernance {
  private readonly identities: PeerIdentity;
  private readonly api: AttachmentApi;
  private readonly authority: VaultAuthority;
  constructor(
    identities: PeerIdentity,
    api: AttachmentApi,
    authority: VaultAuthority,
  ) {
    this.identities = identities;
    this.api = api;
    this.authority = authority;
  }
  async verify(groupId: string): Promise<GroupState> {
    const cache = new GroupCache(this.authority, groupId);
    let previous = await cache.current();
    let expected: HistoryPage | null = null;
    checkCachedGroup(previous, groupId);
    for (;;) {
      const page = historyPage(
        await this.api('group-history', {
          groupId,
          after: previous?.revision ?? 0,
        }),
      );
      checkProgress(previous, page, expected);
      expected = page;
      if (page.events.length)
        previous = await this.verifyPage({
          groupId,
          head: page.head,
          page: page.events,
          previous,
          cache,
        });
      if (previous?.revision === page.revision) {
        if ((await groupEventHash(previous)) !== page.head)
          throw new Error('Histórico do grupo divergente.');
        return { state: previous, head: page.head };
      }
      if (!page.events.length)
        throw new Error('Histórico do grupo incompleto.');
    }
  }
  private async verifyPage(input: {
    groupId: string;
    head: string;
    page: GroupEvent[];
    previous: GroupEvent | null;
    cache: GroupCache;
  }): Promise<GroupEvent> {
    const accounts = [
      ...new Set(
        input.page.flatMap((e) => [
          e.actor,
          ...(e.consent ? [e.consent.actor] : []),
          ...(e.link ? [e.link.actor] : []),
        ]),
      ),
    ];
    const directories = await readDirectories({
      accounts,
      identities: this.identities,
      load: (requests) =>
        this.api('group-directory', {
          groupId: input.groupId,
          head: input.head,
          accounts: requests,
        }),
    });
    let previous = input.previous;
    for (const event of input.page) {
      if (event.groupId !== input.groupId)
        throw new Error('Evento de outro grupo.');
      if (event.consent) await this.checkAnchor(event.consent, input.cache);
      previous = await verifyGroupTransition({
        previous,
        event,
        ...this.eventOrigins(event, directories),
        ...(event.link
          ? { linkAnchor: await this.checkAnchor(event.link, input.cache) }
          : {}),
      });
      await input.cache.preserve(previous);
    }
    if (!previous) throw new Error('Grupo sem origem.');
    return previous;
  }
  private eventOrigins(
    event: GroupEvent,
    directories: Map<string, { events: DirectoryEvent[] }>,
  ): {
    actorDirectory: DirectoryEvent;
    consentDirectory?: DirectoryEvent;
    targetDirectory?: DirectoryEvent;
    linkDirectory?: DirectoryEvent;
  } {
    const actorDirectory = this.origin(
      directories.get(event.actor)?.events,
      event.authorityRevision,
    );
    if (event.link)
      return {
        actorDirectory,
        linkDirectory: this.origin(
          directories.get(event.link.actor)?.events,
          event.link.authorityRevision,
        ),
      };
    if (!event.consent) return { actorDirectory };
    return {
      actorDirectory,
      consentDirectory: this.origin(
        directories.get(event.consent.actor)?.events,
        event.consent.authorityRevision,
      ),
      targetDirectory: this.origin(
        directories.get(event.actor)?.events,
        event.consent.targetRevision,
      ),
    };
  }
  private origin(
    events: DirectoryEvent[] | undefined,
    revision: number,
  ): DirectoryEvent {
    const event = events?.[revision - 1];
    if (!event) throw new Error('Autoridade de grupo incompleta.');
    return event;
  }
  private async checkAnchor(
    consent: Pick<GroupConsent, 'actor' | 'head' | 'groupId'>,
    cache: GroupCache,
  ): Promise<GroupEvent> {
    const anchor = await cache.event(consent.head);
    if (
      !anchor ||
      !groupManager(anchor, consent.actor) ||
      anchor.groupId !== consent.groupId
    )
      throw new Error('Convite sem participação administrativa verificada.');
    return anchor;
  }
  async invitation(consent: GroupConsent): Promise<GroupState> {
    if (consent.target !== this.authority.session.accountId)
      throw new Error('Convite de outra conta.');
    const verified = await this.verify(consent.groupId),
      cache = new GroupCache(this.authority, consent.groupId);
    const data = await readDirectories({
      accounts: [consent.actor],
      identities: this.identities,
      load: (requests) =>
        this.api('group-directory', {
          groupId: consent.groupId,
          head: verified.head,
          accounts: requests,
        }),
    });
    await verifyGroupConsent(
      consent,
      this.origin(data.get(consent.actor)?.events, consent.authorityRevision),
    );
    const target = this.authority.events[consent.targetRevision - 1];
    if (!target || (await eventHash(target)) !== consent.targetDirectory)
      throw new Error('O convite diverge da sua identidade.');
    await this.checkAnchor(consent, cache);
    if (!groupManager(verified.state, consent.actor))
      throw new Error('O convite não tem mais administrador autorizado.');
    return verified;
  }
}
