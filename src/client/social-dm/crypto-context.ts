import type { VaultAuthority } from '../vault-authority/index.ts';
import type { MessageCrypto } from '../message-crypto/index.ts';
import type { DirectoryEvent } from '../../shared/devices/index.ts';
import type { SocialApi, SocialDirectoryPage } from './authority.ts';
import type { RecoveryKey } from '../../shared/messages/index.ts';

/** A single verified public-identity turn; never shared with private chat. */
export interface SocialContext {
  authority: VaultAuthority;
  privateAuthority: VaultAuthority;
  api: SocialApi;
  machine: MessageCrypto;
  senderHistories: Map<string, DirectoryEvent[]>;
  sendPeers: Map<
    string,
    { directory: SocialDirectoryPage; recovery: RecoveryKey }
  >;
}
