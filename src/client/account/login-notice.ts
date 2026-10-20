import { t } from '../../shared/i18n/index.ts';

/** Explains the unchanged standard English login document before the wallet prompt. */
export function loginSignatureNotice(handoff: boolean): string {
  return handoff
    ? t(
        'The wallet login document is in English. It connects the browser that opened this request to 0xDMme. Reject links from other people. It does not move funds, authorize transactions or open your encrypted history. Check the domain and address before signing.',
      )
    : t(
        'The wallet login document is in English. It only connects your account to 0xDMme. It does not move funds, authorize transactions or open your encrypted history. Check the domain and address before signing.',
      );
}
