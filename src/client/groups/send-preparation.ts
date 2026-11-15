import { refreshSendMaterial, SendMaterials } from '../send-material/index.ts';
import { requireFreshOwnDirectory } from '../own-device-authority/index.ts';
import type { SendMaterial } from '../send-material/index.ts';
import { readDirectories } from '../peer-identity/index.ts';
import type { PeerIdentity } from '../peer-identity/index.ts';
import { recoveryKey } from '../../shared/messages/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';
import { keys, object } from '../../shared/account/index.ts';
import { canonical, eventHash } from '../../shared/devices/index.ts';
import type { AttachmentApi } from '../attachments/index.ts';
import { SendPreparationRead } from '../send-preparation/index.ts';
import type { GroupGovernance, GroupState } from './governance.ts';

/** Only the first history page and its matching directory batch can be answered here. */
export class GroupSendPreparation {
  private readonly read = new SendPreparationRead();
  private readonly material = new SendMaterials();
  /** Select freshness conservatively; prepare() still verifies any cached hit. */
  ownDirectory(groupId: string): 'fresh' | 'reuse' {
    return this.material.has(groupId) ? 'reuse' : 'fresh';
  }
  observed(account: string, head: string): void {
    this.material.observed(account, head);
  }
  invalidate(groupId?: string): void {
    this.material.invalidate(groupId);
  }

  shouldRefresh(error: unknown): boolean {
    return (
      refreshSendMaterial(error) ||
      (this.read.legacy && legacyGroupConflict(error))
    );
  }
  async prepare(input: {
    groupId: string;
    governance: GroupGovernance;
    api: AttachmentApi;
    authority: VaultAuthority;
    identities: PeerIdentity;
  }) {
    const { groupId, governance, api } = input;
    const known = this.material.reusable(input.authority, groupId);
    if (known) {
      const group = await governance.verify(groupId);
      const directories = retainedDirectories(input.identities, known);
      if (known.scope === group.head && directories)
        return {
          group,
          preparation: new PreparedGroupSend(
            {
              authority: input.authority,
              identities: input.identities,
              api,
              group,
              directories,
              reused: true,
              legacy: false,
            },
            this.material,
          ),
        };
      this.material.invalidate(groupId);
    }
    requireFreshOwnDirectory(input.authority);
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
    const directoryApi = preparedDirectoryApi(api, group, combined);
    return {
      group,
      preparation: new PreparedGroupSend(
        {
          authority: input.authority,
          identities: input.identities,
          api: directoryApi,
          group,
          reused: false,
          legacy: this.read.legacy,
        },
        combined ? this.material : null,
      ),
    };
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

type Directories = Awaited<ReturnType<typeof readDirectories>>;
function retainedDirectories(
  identities: PeerIdentity,
  material: SendMaterial,
): Directories | null {
  const result: Directories = new Map();
  for (const participant of material.participants) {
    const events = identities.history(participant.accountId);
    if (
      !events ||
      identities.get(participant.accountId)?.directory !== participant.directory
    )
      return null;
    result.set(participant.accountId, {
      events,
      recovery: participant.recovery,
    });
  }
  return result;
}
interface PreparedGroupInput {
  group: GroupState;
  authority: VaultAuthority;
  identities: PeerIdentity;
  api: AttachmentApi;
  directories?: Directories;
  reused: boolean;
  legacy: boolean;
}
/** A single send batch owns this lazy verified page, with session storage owned separately. */
export class PreparedGroupSend {
  readonly reused: boolean;
  private readonly input: PreparedGroupInput;
  private readonly material: SendMaterials | null;
  private loaded: Promise<Directories> | null = null;
  private readonly retention: number | undefined;
  constructor(input: PreparedGroupInput, material: SendMaterials | null) {
    this.retention = material?.generation;
    this.input = input;
    this.material = material;
    this.reused = input.reused;
  }
  directories(): Promise<Directories> {
    this.loaded ??= this.input.directories
      ? Promise.resolve(this.input.directories)
      : readDirectories({
          accounts: this.input.group.state.members.map((m) => m.accountId),
          identities: this.input.identities,
          load: (accounts) =>
            this.input.api('group-directory', {
              groupId: this.input.group.state.groupId,
              head: this.input.group.head,
              accounts,
            }),
        });
    return this.loaded;
  }
  shouldRefresh(error: unknown): boolean {
    return (
      refreshSendMaterial(error) ||
      (this.input.legacy && legacyGroupConflict(error))
    );
  }
  invalidate(): void {
    this.material?.invalidate(this.input.group.state.groupId);
  }
  async encrypted(): Promise<void> {
    if (!this.material) return;
    const { authority, group } = this.input;
    const participants = await Promise.all(
      [...(await this.directories())].map(async ([accountId, directory]) => {
        const event = directory.events.at(-1);
        if (!event) throw new Error('Participant directory missing.');
        return {
          accountId,
          directory: await eventHash(event),
          revision: event.revision,
          recovery: recoveryKey(directory.recovery),
        };
      }),
    );
    this.material.remember(
      authority,
      group.state.groupId,
      {
        scope: group.head,
        participants,
      },
      this.retention,
    );
  }
}

export function legacyGroupConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    error.status === 409
  );
}
