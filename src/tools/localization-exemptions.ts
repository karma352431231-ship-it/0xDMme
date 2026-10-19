/** Persisted labels and state identifiers are deliberately language-independent. */
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

/**
 * Catalog keys must be their English text or an `area.name` identifier. These
 * older keys are exceptions: English wire reasons whose display text differs,
 * and labels persisted in existing records, which need a migration to rename.
 */
export const legacyCatalogKeys: ReadonlySet<string> = new Set([
  'Message action target is unavailable.',
  'Message action limit reached.',
  'Invalid public-identity message or action.',
  'Reaction target is unavailable.',
  'Message reaction limit reached.',
  'DM accepts text, declared media and reactions; private profile and edits are forbidden.',
  'Upvote read unavailable.',
  'Invalid community topics.',
  'Invalid NSFW choice.',
  'Community creation classification already fixed.',
  'timeout',
  ...[...localizationExemptions.values()].flatMap((labels) => [...labels]),
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
