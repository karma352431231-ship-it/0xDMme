import type { Ecosystem } from '../wallet-identity/index.ts';

export type RecoveryLanguage = 'en' | 'zh-CN';
interface RecoveryConfiguration {
  accountId: string;
  origin: string;
  ecosystem: Ecosystem;
  address: string;
  id: string;
  salt: string;
}
export type WalletRecovery = RecoveryConfiguration &
  ({ version: 2 } | { version: 3; language: RecoveryLanguage });
