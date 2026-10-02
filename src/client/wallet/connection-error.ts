const messages = {
  'conexao-recusada': 'A solicitação de conexão foi recusada na wallet.',
  'conexao-nao-autorizada': 'A wallet não autorizou a conexão desta página.',
  'conexao-pendente':
    'Já existe uma solicitação de conexão pendente na wallet.',
  'conexao-nao-suportada': 'A wallet recusou o método de conexão Solana.',
  'conexao-parametros-recusados':
    'A wallet recusou os parâmetros da conexão Solana.',
  'conexao-provider-falhou': 'A wallet não concluiu a conexão Solana.',
  'conta-solana-ausente':
    'Selecione uma conta Solana que assine mensagens: a conexão não disponibilizou uma conta autorizada.',
  'conta-solana-invalida':
    'A wallet apresentou uma conta Solana com endereço ou chave pública inválidos.',
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
