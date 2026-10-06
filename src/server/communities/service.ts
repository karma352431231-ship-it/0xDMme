import { AccountError, uuid } from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import { directoryEvent, verify } from '../../shared/devices/index.ts';
import {
  communityBody,
  communityCursor,
  communityProof,
} from '../../shared/communities/index.ts';
import { postCursor } from '../../shared/community-posts/index.ts';
import {
  feedFilter,
  exploreFilter,
} from '../../shared/community-discovery/index.ts';
import type {
  CommunityDiscoveryStore,
  CommunityPostStore,
  CommunityStore,
  DeviceStore,
} from '../database/index.ts';
export class CommunityService {
  private readonly store: CommunityStore;
  private readonly devices: DeviceStore;
  private readonly posts: CommunityPostStore | null;
  private readonly discovery: CommunityDiscoveryStore | null;
  constructor(
    store: CommunityStore,
    devices: DeviceStore,
    posts: CommunityPostStore | null = null,
    discovery: CommunityDiscoveryStore | null = null,
  ) {
    this.store = store;
    this.devices = devices;
    this.posts = posts;
    this.discovery = discovery;
  }
  feed(filter: unknown, after: string | null) {
    return this.requireDiscovery().feed(feedFilter(filter), after);
  }
  explore(filter: unknown, after: string | null) {
    return this.requireDiscovery().explore(exploreFilter(filter), after);
  }
  private requireDiscovery(): CommunityDiscoveryStore {
    if (!this.discovery) throw new AccountError(404, 'Feed indisponível.');
    return this.discovery;
  }
  post(community: unknown, id: unknown) {
    return this.requirePosts().read(uuid(community), uuid(id));
  }
  postPage(community: unknown, after: unknown, tag: unknown) {
    return this.requirePosts().list(
      uuid(community),
      postCursor(after),
      communityCursor(tag),
    );
  }
  replies(community: unknown, parent: unknown, after: unknown) {
    return this.requirePosts().replies(
      uuid(community),
      uuid(parent),
      postCursor(after),
    );
  }
  tags(community: unknown, after: unknown) {
    return this.requirePosts().tags(uuid(community), communityCursor(after));
  }
  private requirePosts(): CommunityPostStore {
    if (!this.posts) throw new AccountError(404, 'Posts indisponíveis.');
    return this.posts;
  }
  read(id: unknown) {
    return this.store.read(uuid(id));
  }
  list(after: unknown) {
    return this.store.list(communityCursor(after));
  }
  async operate(
    operation: string,
    session: AccountSession,
    input: unknown,
  ): Promise<unknown> {
    const proof = communityProof(input),
      current = await this.devices.current(session.accountId);
    const signer =
      current &&
      directoryEvent(current.event).devices.find(
        (device) => device.id === session.deviceId,
      );
    if (!signer || current?.head !== proof.directory)
      throw new AccountError(403, 'Aparelho sem autorização atual.');
    await verify(
      signer.signing,
      proof.signature,
      communityBody(session.accountId, session.deviceId, operation, {
        directory: proof.directory,
        payload: proof.payload,
      }),
    );
    const store = operation.startsWith('discovery-')
      ? this.requireDiscovery()
      : operation.startsWith('post-') ||
          operation.startsWith('tag-') ||
          operation === 'reply-create'
        ? this.requirePosts()
        : this.store;
    return store.operate(
      operation,
      { session, directory: proof.directory },
      proof.payload,
    );
  }
}
