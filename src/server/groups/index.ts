import { groupDirectoryRequest } from './directory.ts';
import {
  groupInvitationActions,
  groupInvitationOperations,
} from './invitations.ts';
import { groupDailyActions, groupDailyOperations } from './daily.ts';
import {
  AccountError,
  keys,
  object,
  uuid,
} from '../../shared/account/index.ts';
import { revision } from '../../shared/contacts/index.ts';
import { groupConsent, groupEvent } from '../../shared/groups/index.ts';
import type {
  ContactAuthority,
  GroupStore,
  GroupMessageStore,
  GroupDailyStore,
} from '../database/index.ts';
import { groupDeliveryActions, groupDeliveryOperations } from './delivery.ts';
export { GroupMediaService, groupMediaOperations } from './media.ts';
function cursor(value: unknown): string | null {
  return value === null ? null : uuid(value);
}

export const groupOperations = [
  ...groupInvitationOperations,
  'group-mode',
  'group-list',
  'group-current',
  'group-history',
  'group-incoming',
  'group-propose',
  'group-cancel',
  'group-commit',
  'group-directory',
  ...groupDeliveryOperations,
  ...groupDailyOperations,
] as const;

/** Group operations are called only after the signed device proof has been verified by the message service. */
export class GroupService {
  private readonly store: GroupStore;
  private readonly actions: Record<
    string,
    (authority: ContactAuthority, data: Record<string, unknown>) => unknown
  >;
  constructor(
    store: GroupStore,
    messages: GroupMessageStore,
    daily: GroupDailyStore | null = null,
  ) {
    this.store = store;
    this.actions = {
      ...groupInvitationActions(store),
      'group-mode': (_a, d) => {
        keys(d, []);
        // Preserve the existing mode contract for installed clients; groups now require no token.
        return { mode: 'configured' };
      },
      'group-list': (a, d) => {
        keys(d, ['after']);
        return store.list(a, cursor(d['after']));
      },
      'group-current': (a, d) => {
        keys(d, ['groupId']);
        return store.current(a, uuid(d['groupId']));
      },
      'group-history': (a, d) => {
        keys(d, ['groupId', 'after']);
        return store.history(a, {
          groupId: uuid(d['groupId']),
          after: revision(d['after']),
        });
      },
      'group-incoming': (a, d) => {
        keys(d, ['after']);
        return store.incoming(a, cursor(d['after']));
      },
      'group-propose': async (a, d) => {
        keys(d, ['consent']);
        await store.propose(a, groupConsent(d['consent']));
        return { status: 'saved' };
      },
      'group-cancel': async (a, d) => {
        keys(d, ['id']);
        await store.cancel(a, uuid(d['id']));
        return { status: 'saved' };
      },
      'group-commit': (a, d) => this.commit(a, d),
      'group-directory': (a, d) => store.directory(a, groupDirectoryRequest(d)),
      ...groupDeliveryActions(messages),
      ...groupDailyActions(daily),
    };
  }
  async operate(
    authority: ContactAuthority,
    operation: string,
    data: Record<string, unknown>,
  ): Promise<unknown> {
    const action = Object.hasOwn(this.actions, operation)
      ? this.actions[operation]
      : undefined;
    if (!action) throw new AccountError(404, 'Operação de grupo indisponível.');
    return await action(authority, data);
  }
  private commit(
    authority: ContactAuthority,
    data: Record<string, unknown>,
  ): Promise<unknown> {
    keys(data, ['event']);
    const event = groupEvent(object(data['event']));
    return this.store.commit(authority, { event });
  }
}
