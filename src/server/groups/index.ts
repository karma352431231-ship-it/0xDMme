import { groupDailyActions, groupDailyOperations } from './daily.ts';
import {
  AccountError,
  keys,
  object,
  uuid,
} from '../../shared/account/index.ts';
import { revision } from '../../shared/contacts/index.ts';
import { fingerprint } from '../../shared/devices/index.ts';
import { groupConsent, groupEvent } from '../../shared/groups/index.ts';
import type {
  ContactAuthority,
  GroupEligibility,
  GroupStore,
  GroupMessageStore,
  GroupDailyStore,
} from '../database/index.ts';
import { groupDeliveryActions, groupDeliveryOperations } from './delivery.ts';
export { GroupMediaService, groupMediaOperations } from './media.ts';
function cursor(value: unknown): string | null {
  return value === null ? null : uuid(value);
}

export interface GroupEligibilityVerifier {
  mode: 'fixture' | 'configured';
  verify(authority: ContactAuthority): Promise<GroupEligibility>;
}
export const groupOperations = [
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

/** Explicit local fixtures cannot be enabled against a staging profile or database. */
export function localGroupEligibility(
  config: { profile: 'development' | 'staging'; databaseUrl: string },
  enabled: boolean,
): GroupEligibilityVerifier | null {
  if (!enabled) return null;
  if (
    config.profile !== 'development' ||
    !/^\/hash_talk_test(?:_[a-z0-9_]+)?$/u.test(
      new URL(config.databaseUrl).pathname,
    )
  )
    throw new Error(
      'Elegibilidade sintética exige ambiente e banco exclusivos de teste.',
    );
  return {
    mode: 'fixture',
    verify: (authority) =>
      Promise.resolve({
        accountId: authority.session.accountId,
        balance: 10_000n,
        decimals: 0,
        expiresAt: Date.now() + 30_000,
      }),
  };
}
/** Group operations are called only after the signed device proof has been verified by the message service. */
export class GroupService {
  private readonly store: GroupStore;
  private readonly eligibility: GroupEligibilityVerifier | null;
  private readonly actions: Record<
    string,
    (authority: ContactAuthority, data: Record<string, unknown>) => unknown
  >;
  constructor(
    store: GroupStore,
    messages: GroupMessageStore,
    eligibility: GroupEligibilityVerifier | null = null,
    daily: GroupDailyStore | null = null,
  ) {
    this.store = store;
    this.eligibility = eligibility;
    this.actions = {
      'group-mode': (_a, d) => {
        keys(d, []);
        return { mode: this.mode() };
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
      'group-directory': (a, d) => this.directory(a, d),
      ...groupDeliveryActions(messages),
      ...groupDailyActions(daily),
    };
  }
  private mode(): 'fixture' | 'configured' | 'unavailable' {
    return this.eligibility?.mode ?? 'unavailable';
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
  private directory(
    authority: ContactAuthority,
    data: Record<string, unknown>,
  ): Promise<unknown> {
    keys(data, ['groupId', 'head', 'accounts']);
    if (
      !Array.isArray(data['accounts']) ||
      data['accounts'].length > 16 ||
      !data['accounts'].length
    )
      throw new AccountError(400, 'Lote de participantes inválido.');
    const accounts = data['accounts'].map((input: unknown) => {
      const row = object(input);
      keys(row, ['accountId', 'after']);
      return {
        accountId: uuid(row['accountId']),
        after: revision(row['after']),
      };
    });
    if (new Set(accounts.map((r) => r.accountId)).size !== accounts.length)
      throw new AccountError(400, 'Participantes repetidos.');
    return this.store.directory(authority, {
      groupId: uuid(data['groupId']),
      head: fingerprint(data['head']),
      accounts,
    });
  }
  private async commit(
    authority: ContactAuthority,
    data: Record<string, unknown>,
  ): Promise<unknown> {
    keys(data, ['event']);
    const event = groupEvent(object(data['event']));
    if (event.kind !== 'create' && event.kind !== 'transfer')
      return this.store.commit(authority, { event });
    if (await this.store.preflight(authority, event))
      return this.store.commit(authority, { event });
    if (!this.eligibility)
      throw new AccountError(
        503,
        'O token do projeto ainda não foi configurado para criação ou transferência de grupos.',
      );
    // RPC/provider verification happens outside the SQL transaction. The store
    // rechecks freshness, tier/count, frequency and capacity atomically afterwards.
    const eligibility = await this.eligibility.verify(authority);
    return this.store.commit(authority, { event, eligibility });
  }
}
