import { AccountError, keys, uuid } from '../../shared/account/index.ts';
import { revision } from '../../shared/contacts/index.ts';
import { fingerprint } from '../../shared/devices/index.ts';
import { groupEvent } from '../../shared/groups/index.ts';
import { groupLink } from '../../shared/groups/links.ts';
import type { ContactAuthority, GroupStore } from '../database/index.ts';
import { groupDirectoryRequest } from './directory.ts';

export const groupInvitationOperations = [
  'group-link-current',
  'group-link-publish',
  'group-link-revoke',
  'group-link-history',
  'group-link-directory',
  'group-link-join',
] as const;
export function groupInvitationActions(
  store: GroupStore,
): Record<
  string,
  (a: ContactAuthority, d: Record<string, unknown>) => unknown
> {
  return {
    'group-link-current': (a, d) => store.admission.current(a, scope(d)),
    'group-link-publish': async (a, d) => {
      keys(d, ['link']);
      await store.admission.publish(a, groupLink(d['link']));
      return { status: 'saved' };
    },
    'group-link-revoke': async (a, d) => {
      await store.admission.revoke(a, scope(d));
      return { status: 'saved' };
    },
    'group-link-join': (a, d) => {
      keys(d, ['event', 'token']);
      const event = groupEvent(d['event']);
      if (event.kind !== 'link-join')
        throw new AccountError(400, 'Entrada por link inválida.');
      return store.commit(a, { event, token: fingerprint(d['token']) });
    },
    'group-link-history': (a, d) => {
      keys(d, ['groupId', 'after', 'token']);
      return store.history(a, {
        groupId: uuid(d['groupId']),
        after: revision(d['after']),
        token: fingerprint(d['token']),
      });
    },
    'group-link-directory': (a, d) => {
      keys(d, ['groupId', 'head', 'accounts', 'token']);
      const { token, ...directory } = d;
      return store.directory(a, {
        ...groupDirectoryRequest(directory),
        token: fingerprint(token),
      });
    },
  };
}
function scope(d: Record<string, unknown>) {
  keys(d, ['groupId', 'head']);
  return { groupId: uuid(d['groupId']), head: fingerprint(d['head']) };
}
