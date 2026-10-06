import { AccountError, keys, uuid } from '../../shared/account/index.ts';
import { integer } from '../../shared/vault/index.ts';
import { fingerprint } from '../../shared/devices/index.ts';
import { socialRevision } from '../../shared/social-dm/index.ts';
import type { ContactAuthority, Database } from '../database/index.ts';
import {
  matrixUpload,
  matrixQuery,
  matrixClaim,
  matrixSend,
} from '../matrix-protocol/index.ts';

export const socialDmOperations = [
  'dm-accepted',
  'dm-profile',
  'dm-list',
  'dm-state',
  'dm-request',
  'dm-decide',
  'dm-block',
  'dm-directory',
  'dm-register',
  'dm-recovery-current',
  'dm-recovery-peer',
  'dm-recovery-register',
  'dm-recovery-key',
  'dm-publish',
  'dm-page',
  'dm-matrix-upload',
  'dm-matrix-query',
  'dm-matrix-claim',
  'dm-matrix-send',
  'dm-matrix-inbox',
  'dm-matrix-received',
] as const;
type Store = Pick<Database, 'socialDm' | 'socialCrypto' | 'socialMatrix'>;
export class SocialDmService {
  private readonly actions: Record<
    string,
    (
      authority: ContactAuthority,
      data: Record<string, unknown>,
    ) => Promise<unknown>
  >;
  constructor(db: Store) {
    this.actions = {
      'dm-accepted': (a, d) => {
        keys(d, ['id', 'hash']);
        return db.socialCrypto.accepted(
          a,
          uuid(d['id']),
          fingerprint(d['hash']),
        );
      },
      'dm-profile': (a, d) => {
        keys(d, ['peer']);
        return db.socialDm.withActor(a, (c) =>
          db.socialDm.target(c, uuid(d['peer'])),
        );
      },
      'dm-list': (a, d) => {
        keys(d, ['after']);
        return db.socialDm.list(
          a,
          d['after'] === null ? null : uuid(d['after']),
        );
      },
      'dm-state': (a, d) => {
        keys(d, ['peer']);
        return db.socialDm.state(a, uuid(d['peer']));
      },
      'dm-request': (a, d) => {
        keys(d, ['peer']);
        return db.socialDm.request(a, uuid(d['peer']));
      },
      'dm-decide': (a, d) => {
        keys(d, ['peer', 'revision', 'accept']);
        return db.socialDm.decide(a, {
          peer: uuid(d['peer']),
          revision: socialRevision(d['revision']),
          accept: boolean(d['accept']),
        });
      },
      'dm-block': async (a, d) => {
        keys(d, ['peer', 'blocked', 'revision']);
        await db.socialDm.block(a, {
          peer: uuid(d['peer']),
          blocked: boolean(d['blocked']),
          revision: socialRevision(d['revision']),
        });
        return { status: 'saved' };
      },
      'dm-directory': (a, d) => {
        keys(d, ['peer', 'after']);
        return db.socialCrypto.directory(a, {
          peer: d['peer'] === null ? null : uuid(d['peer']),
          after: integer(d['after'], 128),
        });
      },
      'dm-register': (a, d) => {
        keys(d, ['event']);
        return db.socialCrypto.register(a, d['event']);
      },
      'dm-recovery-current': (a, d) => {
        keys(d, []);
        return db.socialCrypto.recovery(a, {});
      },
      'dm-recovery-peer': (a, d) => {
        keys(d, ['accountId']);
        return db.socialCrypto.recovery(a, { peer: uuid(d['accountId']) });
      },
      'dm-recovery-register': (a, d) => {
        keys(d, ['key']);
        return db.socialCrypto.recovery(a, { key: d['key'] });
      },
      'dm-recovery-key': (a, d) => {
        keys(d, ['id']);
        return db.socialCrypto.recovery(a, { id: uuid(d['id']) });
      },
      'dm-publish': (a, d) => {
        keys(d, ['packet']);
        return db.socialCrypto.publish(a, d['packet']);
      },
      'dm-page': (a, d) => {
        keys(d, ['peer', 'before']);
        return db.socialCrypto.messages(a, {
          peer: uuid(d['peer']),
          before: d['before'] === null ? null : socialRevision(d['before']),
        });
      },
      'dm-matrix-upload': (a, d) => db.socialMatrix.upload(a, matrixUpload(d)),
      'dm-matrix-query': (a, d) => db.socialMatrix.query(a, matrixQuery(d)),
      'dm-matrix-claim': (a, d) => db.socialMatrix.claim(a, matrixClaim(d)),
      'dm-matrix-send': (a, d) => db.socialMatrix.send(a, matrixSend(d)),
      'dm-matrix-inbox': (a, d) => {
        keys(d, []);
        return db.socialMatrix.inbox(a);
      },
      'dm-matrix-received': async (a, d) => {
        keys(d, ['sequences']);
        if (!Array.isArray(d['sequences']) || d['sequences'].length > 16)
          throw new AccountError(400, 'Lote de envelopes inválido.');
        await db.socialMatrix.received(a, d['sequences'].map(socialRevision));
        return { status: 'saved' };
      },
    };
  }
  operate(
    authority: ContactAuthority,
    operation: string,
    data: Record<string, unknown>,
  ): Promise<unknown> {
    const action = Object.hasOwn(this.actions, operation)
      ? this.actions[operation]
      : undefined;
    if (!action) throw new AccountError(404, 'Operação de DM indisponível.');
    return action(authority, data);
  }
}
function boolean(input: unknown): boolean {
  if (typeof input !== 'boolean')
    throw new AccountError(400, 'Opção de DM inválida.');
  return input;
}
