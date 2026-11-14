import { keys, object } from '../../shared/account/index.ts';
import { canonical } from '../../shared/devices/index.ts';
import type { AttachmentApi } from '../attachments/index.ts';
import { SendPreparationRead } from '../send-preparation/index.ts';
import type { GroupGovernance, GroupState } from './governance.ts';

/** Only the first history page and its matching directory batch can be answered here. */
export class GroupSendPreparation {
  private readonly read = new SendPreparationRead();

  async prepare(input: {
    groupId: string;
    governance: GroupGovernance;
    api: AttachmentApi;
  }) {
    const { groupId, governance, api } = input;
    let combined: Record<string, unknown> | null = null;
    const group = await governance.verify(
      groupId,
      async (operation, payload) => {
        combined = await this.read.read(api, 'group-send-preparation', payload);
        if (combined === null) return api(operation, payload);
        keys(combined, ['history', 'directories']);
        const history = object(combined['history']);
        if (history['revision'] !== payload['after']) combined = null;
        return history;
      },
    );
    return { group, directoryApi: preparedDirectoryApi(api, group, combined) };
  }
}

function preparedDirectoryApi(
  api: AttachmentApi,
  group: GroupState,
  combined: Record<string, unknown> | null,
): AttachmentApi {
  if (!combined || combined['directories'] === null) return api;
  const scope = canonical({
    groupId: group.state.groupId,
    head: group.head,
    accounts: group.state.members
      .slice(0, 16)
      .map((member) => ({ accountId: member.accountId, after: 0 })),
  });
  let used = false;
  return (operation, payload) => {
    if (operation !== 'group-directory' || used || canonical(payload) !== scope)
      return api(operation, payload);
    used = true;
    return Promise.resolve(combined['directories']);
  };
}
