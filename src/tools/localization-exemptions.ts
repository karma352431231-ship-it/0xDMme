/** Wire/storage labels and legacy signature bytes are deliberately language-independent. */
export const localizationExemptions = new Map<string, ReadonlySet<string>>([
  [
    'src/client/message-state/index.ts',
    new Set([
      'Suspensa',
      'Recebida e preservada',
      'Aceita · entrega por aparelho pendente',
      'Histórico local',
      'Cópia local offline · estado remoto ainda não conferido',
      'Perfil recebido · cópia local offline',
    ]),
  ],
  [
    'src/client/phantom-native/index.ts',
    new Set([
      '0xDMme — prova de retorno da Phantom.\nOrigem: {0}\nPedido: {1}\nEsta assinatura testa o retorno ao navegador. Não conecta uma conta, não autoriza transações nem acesso ao histórico.',
    ]),
  ],
  [
    'src/client/wallet-recovery-probe/index.ts',
    new Set([
      '0xDMme: conteúdo fictício do ensaio de recuperação.',
      '0xDMme — ENSAIO LOCAL DE RECUPERAÇÃO — v1',
      'Somente dados fictícios. Isto NÃO é um login nem uma transação.',
      'Esta assinatura é um SEGREDO: não compartilhe e não assine em outro site.',
      'Conta: {0}',
    ]),
  ],
  [
    'src/client/account-settings/vault-record.ts',
    new Set(['Configurações da conta']),
  ],
  [
    'src/client/daily/index.ts',
    new Set(['Preferências da conversa', 'Conversa favorita']),
  ],
  ['src/client/peer-identity/index.ts', new Set(['Identidade para mensagens'])],
  ['src/client/social-dm/index.ts', new Set(['Recuperação das DMs pelo @'])],
  [
    'src/client/status/preferences.ts',
    new Set(['Privacidade dos próximos status']),
  ],
  ['src/client/calls/controller.ts', new Set(['Chamadas perdidas'])],
  [
    'src/client/vault-labels/index.ts',
    new Set([
      'Configurações da conta',
      'Preferências da conversa',
      'Conversa favorita',
      'Privacidade dos próximos status',
      'Recuperação das DMs pelo @',
      'Chamadas perdidas',
    ]),
  ],
]);

export const routeIdentifiers = new Set([
  'conversas',
  'comunidades',
  'perfil',
  'contatos',
  'publico',
  'cofre',
  'atividade',
  'configuracoes',
]);
