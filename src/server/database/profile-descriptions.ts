import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';
import type { PublicProfile } from '../../shared/public-profile/index.ts';
import type { ProfileDescription } from '../../shared/profile-social/index.ts';
import type { ContactAuthority, ContactStore } from './contacts.ts';
import { assertContentCapacity } from './vault-quota.ts';

interface DescriptionOptions {
  authority: ContactStore;
  identity: (client: pg.PoolClient, account: string) => Promise<PublicProfile>;
  capacity: number;
}
type Reader = Pick<pg.PoolClient, 'query'>;

/**
 * Owner-written public text of a profile. It is public as soon as it is
 * saved, like the @ itself; the row keeps its revision when cleared.
 */
export class ProfileDescriptions {
  private readonly options: DescriptionOptions;
  constructor(options: DescriptionOptions) {
    this.options = options;
  }
  private async row(
    client: Reader,
    id: string,
    lock = false,
  ): Promise<ProfileDescription> {
    const rows = await client.query<ProfileDescription>(
      `SELECT revision,description FROM hash_talk.public_profile_descriptions WHERE profile_id=$1${lock ? ' FOR UPDATE' : ''}`,
      [id],
    );
    return rows.rows[0] ?? { revision: 0, description: '' };
  }
  state(authority: ContactAuthority): Promise<ProfileDescription> {
    return this.options.authority.withMessageAuthority(
      authority,
      async (client) => {
        const profile = await this.options.identity(
          client,
          authority.session.accountId,
        );
        return this.row(client, profile.id);
      },
    );
  }
  /** `text` is already normalized by the shared contract. */
  replace(
    authority: ContactAuthority,
    revision: number,
    text: string,
  ): Promise<ProfileDescription> {
    return this.options.authority.withMessageAuthority(
      authority,
      async (client) => {
        const profile = await this.options.identity(
          client,
          authority.session.accountId,
        );
        // Serializes the absent-row case, as banners do.
        await client.query(
          'SELECT id FROM hash_talk.public_profiles WHERE id=$1 FOR UPDATE',
          [profile.id],
        );
        const old = await this.row(client, profile.id, true);
        if (old.description === text) return old;
        if (old.revision !== revision)
          throw new AccountError(
            409,
            'Descrição alterada em outro aparelho. Recarregue antes de editar.',
          );
        const result = await client.query<ProfileDescription>(
          `INSERT INTO hash_talk.public_profile_descriptions(profile_id,description) VALUES($1,$2)
           ON CONFLICT(profile_id) DO UPDATE SET description=$2,revision=hash_talk.public_profile_descriptions.revision+1
           RETURNING revision,description`,
          [profile.id, text],
        );
        await assertContentCapacity(client, this.options.capacity);
        return result.rows[0]!;
      },
    );
  }
}
