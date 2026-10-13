import { t } from '../../shared/i18n/index.ts';

/** Explains the unchanged standard English login document before the wallet prompt. */
export function loginSignatureNotice(handoff: boolean): string {
  return handoff
    ? t(
        'O documento de login na wallet está em inglês. Ele conecta ao 0xDMme o navegador que abriu este pedido. Recuse links de outras pessoas. Não movimenta fundos, não autoriza transações e não abre seu histórico cifrado. Confira o domínio e o endereço antes de assinar.',
      )
    : t(
        'O documento de login na wallet está em inglês. Ele apenas conecta sua conta ao 0xDMme. Não movimenta fundos, não autoriza transações e não abre seu histórico cifrado. Confira o domínio e o endereço antes de assinar.',
      );
}
