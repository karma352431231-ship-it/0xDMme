import { object, uuid } from '../../shared/account/index.ts';
import { fingerprint } from '../../shared/devices/index.ts';
import { integer } from '../../shared/vault/index.ts';
import { recoveryKey } from '../../shared/messages/index.ts';
import {
  statusAudiencePage,
  statusAudienceHead,
} from '../../shared/status/index.ts';
import type {
  StatusEnvelope,
  StatusPacket,
} from '../../shared/status/index.ts';
import { StatusEncryption } from '../status-crypto/index.ts';
import { readDirectories } from '../peer-identity/index.ts';
import type { PeerIdentity } from '../peer-identity/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';
import type {
  AttachmentApi,
  AttachmentSelection,
} from '../attachments/index.ts';
import { sealStatusPhoto, uploadStatusPhoto } from './media.ts';
import type { StatusPhoto } from './media.ts';
/** A repeatable in-memory draft retains the exact signed pages through network retries. */
export class StatusPublication {
  readonly id = crypto.randomUUID();
  private readonly excluded: ReadonlySet<string>;
  private encryption: StatusEncryption | null = null;
  private photo: StatusPhoto | null = null;
  private after: string | null = null;
  private head: string | null = null;
  private page = 0;
  private ownSaved = false;
  private audienceComplete = false;
  private pending: {
    after: string | null;
    envelopes: StatusEnvelope[];
  } | null = null;
  private packet: StatusPacket | null = null;
  private constructor(excluded: ReadonlySet<string>) {
    this.excluded = new Set(excluded);
  }
  static async create(input: {
    authority: VaultAuthority;
    text: string;
    selection: AttachmentSelection | null;
    excluded: ReadonlySet<string>;
  }): Promise<StatusPublication> {
    const draft = new StatusPublication(input.excluded);
    if (input.selection)
      draft.photo = await sealStatusPhoto(input.selection, input.text);
    draft.encryption = await StatusEncryption.create({
      authority: input.authority,
      id: draft.id,
      kind: draft.photo ? 'photo' : 'text',
      text: draft.photo ? JSON.stringify(draft.photo.content) : input.text,
    });
    return draft;
  }
  async publish(input: {
    authority: VaultAuthority;
    identities: PeerIdentity;
    api: AttachmentApi;
  }): Promise<void> {
    const saved = object(await input.api('status-begin', { id: this.id }));
    if (!['draft', 'published'].includes(String(saved['state'])))
      throw new Error('Publicação encerrada ou removida.');
    if (!this.encryption) throw new Error('Rascunho de status encerrado.');
    if (!this.ownSaved) await this.saveOwn(input);
    while (!this.audienceComplete) await this.saveContacts(input);
    await this.sealPublication(input);
    const result = object(
      await input.api('status-publish', { packet: this.packet }),
    );
    if (result['status'] !== 'published')
      throw new Error('Publicação não confirmada.');
  }
  private async sealPublication(input: {
    authority: VaultAuthority;
    api: AttachmentApi;
  }): Promise<void> {
    if (this.packet) return;
    if (!this.encryption) throw new Error('Publicação encerrada.');
    if (this.photo) await uploadStatusPhoto(this.id, this.photo, input.api);
    const ready = object(await input.api('status-ready', { id: this.id }));
    if (!this.head || ready['head'] !== this.head)
      throw new Error('Audiência da publicação divergiu.');
    this.packet = await this.encryption.publish({
      authority: input.authority,
      publishedAt: integer(ready['publishedAt'], Number.MAX_SAFE_INTEGER),
      audienceHead: this.head,
    });
  }
  private async envelopes(
    input: {
      authority: VaultAuthority;
      identities: PeerIdentity;
      api: AttachmentApi;
    },
    accounts: string[],
  ): Promise<StatusEnvelope[]> {
    const histories = await readDirectories({
      accounts,
      identities: input.identities,
      load: (requests) =>
        input.api('status-recipient-directory', {
          id: this.id,
          accounts: requests,
        }),
    });
    const envelopes: StatusEnvelope[] = [];
    if (!this.encryption) throw new Error('Publicação encerrada.');
    for (const account of accounts) {
      const data = histories.get(account);
      if (!data?.recovery)
        throw new Error(
          'Um contato ainda precisa abrir as Conversas para preparar sua conta.',
        );
      envelopes.push(
        await this.encryption.recipient({
          authority: input.authority,
          history: data.events,
          recovery: recoveryKey(data.recovery),
        }),
      );
    }
    return envelopes;
  }
  private async append(
    api: AttachmentApi,
    envelopes: StatusEnvelope[],
  ): Promise<void> {
    const head = await statusAudienceHead(this.head, envelopes);
    const result = object(
      await api('status-recipients', {
        id: this.id,
        page: this.page + 1,
        previous: this.head,
        envelopes,
      }),
    );
    if (fingerprint(result['head']) !== head)
      throw new Error('Cápsulas da publicação divergiram.');
    this.head = head;
    this.page++;
  }
  private async saveOwn(input: {
    authority: VaultAuthority;
    identities: PeerIdentity;
    api: AttachmentApi;
  }): Promise<void> {
    this.pending ??= {
      after: null,
      envelopes: await this.envelopes(input, [
        input.authority.session.accountId,
      ]),
    };
    await this.append(input.api, this.pending.envelopes);
    this.pending = null;
    this.ownSaved = true;
  }
  private async saveContacts(input: {
    authority: VaultAuthority;
    identities: PeerIdentity;
    api: AttachmentApi;
  }): Promise<void> {
    if (!this.pending) {
      const data = object(
        await input.api('status-contacts', { id: this.id, after: this.after }),
      );
      if (!Array.isArray(data['accounts']))
        throw new Error('Audiência inválida.');
      const accounts = statusAudiencePage({
        contacts: data['accounts'].map(uuid),
        excluded: this.excluded,
        author: input.authority.session.accountId,
      });
      this.pending = {
        after: data['next'] === null ? null : uuid(data['next']),
        envelopes: accounts.length ? await this.envelopes(input, accounts) : [],
      };
    }
    if (this.pending.envelopes.length)
      await this.append(input.api, this.pending.envelopes);
    this.after = this.pending.after;
    this.audienceComplete = this.after === null;
    this.pending = null;
  }
  close(): void {
    this.encryption?.close();
    this.encryption = null;
    for (const file of this.photo?.files ?? []) file.bytes.fill(0);
    this.photo = null;
    this.pending = null;
    this.packet = null;
  }
}
