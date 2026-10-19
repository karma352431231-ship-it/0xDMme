import { t } from '../../shared/i18n/index.ts';
const messages = {
  'conexao-recusada': t('The connection request was rejected in the wallet.'),
  'conexao-nao-autorizada': t(
    'The wallet did not authorize this page to connect.',
  ),
  'conexao-pendente': t(
    'A connection request is already pending in your wallet.',
  ),
  'conexao-nao-suportada': t(
    'The wallet rejected the Solana connection method.',
  ),
  'conexao-parametros-recusados': t(
    'The wallet rejected the Solana connection parameters.',
  ),
  'conexao-provider-falhou': t(
    'The wallet did not complete the Solana connection.',
  ),
  'conta-solana-ausente': t(
    'Select a Solana account that signs messages: the connection did not provide an authorized account.',
  ),
  'conta-solana-invalida': t(
    'The wallet returned a Solana account with an invalid address or public key.',
  ),
} as const;

type ConnectionFailure = keyof typeof messages;

/** Only our fixed descriptions cross into UI; never retain a provider error. */
export class SolanaConnectionError extends Error {
  readonly category: ConnectionFailure;

  constructor(category: ConnectionFailure) {
    super(messages[category]);
    this.category = category;
  }
}

export function connectionError(error: unknown): SolanaConnectionError {
  const code: unknown =
    typeof error === 'object' && error !== null
      ? Object.getOwnPropertyDescriptor(error, 'code')?.value
      : undefined;
  const categories = new Map<number, ConnectionFailure>([
    [4001, 'conexao-recusada'],
    [4100, 'conexao-nao-autorizada'],
    [-32002, 'conexao-pendente'],
    [4200, 'conexao-nao-suportada'],
    [-32601, 'conexao-nao-suportada'],
    [-32602, 'conexao-parametros-recusados'],
  ]);
  return new SolanaConnectionError(
    typeof code === 'number'
      ? (categories.get(code) ?? 'conexao-provider-falhou')
      : 'conexao-provider-falhou',
  );
}
