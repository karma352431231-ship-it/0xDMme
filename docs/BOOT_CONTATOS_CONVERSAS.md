# Carregamento de contatos e conversas — 15/10/2026

O proprietário relata demora no mobile ao reabrir, recarregar e retornar ao app,
até os contatos e as conversas aparecerem. A investigação encontrou um custo
reproduzível no caminho compartilhado de carga das listas, depois da abertura
da sessão. Isso não estabelece que seja a única causa da demora no aparelho.

## Custo reproduzido

`PeerIdentity.load` abria separadamente cada registro de identidade/agenda.
`AddressBook.page` reabria os contatos para apresentar a lista. Cada `VaultSync.open`
obtinha uma autoridade e, online, sempre baixava o objeto novamente, ignorando a
cópia cifrada local. Assim, 16 contatos exigiam 32 downloads na reabertura; a
retomada da mesma sessão ainda fazia 16 downloads.

O ensaio usa `PeerIdentity`, `VaultSync`, `ContactDirectory`, `Contacts` e
`MessageDirectory` reais, com assinaturas, AES-GCM, IndexedDB e Web Locks nativos.
Somente a autoridade e as respostas HTTP são sintéticas, com 100 ms por consulta.
Não há conta real nem conteúdo de usuário. A versão anterior é `38e6dac`.
O intervalo começa na carga das identidades e termina na publicação da lista;
não inclui login, transferência do app/SDK, montagem de todo o app ou abertura
de histórico. As duas versões apresentam os mesmos 16 contatos.

| Condição                                           | Antes   | Correção |
| -------------------------------------------------- | ------- | -------- |
| Reabertura com ciphertext local                    | 7270 ms | 1423 ms  |
| Retomada da mesma sessão, com ciphertext local     | 3945 ms | 1152 ms  |
| Reabertura sem ciphertext local                    | 7240 ms | 3349 ms  |
| Retomada após a primeira carga remota              | 3948 ms | 965 ms   |
| Downloads de objetos na reabertura com cópia local | 32      | 0        |
| Leituras de autoridade na reabertura               | 35      | 5        |

CPU, rede e armazenamento de um celular podem mudar esses tempos. Não houve
teste físico. Evidências, harness e dados de execução ficam somente em `.local/`.

## Contrato da correção

- `VaultSync.openMany` abre até 16 IDs únicos por operação. Agenda mantém suas
  páginas de 16 contatos e até 16 versões por contato; conflitos maiores continuam
  recusados. A leitura de pins também cede a autoridade entre lotes de 16.
- Cada lote obtém a autoridade atual e confere remoções pessoais antes e depois
  de ler/decifrar. Exclusão, revogação, falha ou mudança de sessão recusam o lote
  completo antes do retorno. O cache não permite fallback após essas falhas.
- Ciphertext local continua vinculado à conta, ID, época, tamanho e hash do
  commit autenticado e ao AAD existente. Corrupção é erro explícito, sem substituir
  silenciosamente a cópia por um download. Evicção normal busca somente o objeto
  ausente, valida e guarda o ciphertext; cache hit não regrava os mesmos bytes.
- `open(id)` usa as mesmas guardas. A cópia local explícita mantém seu contrato:
  não inicia downloads e não promete detectar novas revogações offline.
- Dados decifrados ficam somente na memória da operação. Não há cache novo de
  plaintext, persistência nova, expiração, telemetria, mudança de criptografia,
  backend, migração, dependência, quota ou infraestrutura.
- As listas não concedem permissão para conversar. Recibos, consentimento e a
  confirmação autenticada do histórico preservam seus fluxos. Os pins são
  compartilhados pelas conversas privadas, grupos e DMs pelo perfil público;
  isso não remove a sincronização própria de cada histórico.

## Validação e responsabilidades

A regressão de uma página com ciphertext válido falha na versão anterior:
16 autoridades/16 downloads; passa com uma autoridade, nenhum download e duas
conferências de remoções. Testes cobrem evicção, corrupção, autorização recusada,
remoções antes/depois da leitura, isolamento de conta, troca de sessão, offline,
duplicatas e limite do lote. As regressões de contatos, pins, boot, retomada e
chat pelo @ também passam: 77 testes dirigidos, mais 19 testes de montagem do
app, sessão, cofre e criptografia real de mensagens/grupos, em arquivos distintos.

Transporte do cofre e abertura/validação de objetos saem de `vault-sync/index.ts`
para `api.ts` e `objects.ts`, dentro do mesmo módulo. A interface pública continua
no índice; agenda e identidade usam somente essa interface. Não há alterações
nos hotspots dos coordenadores do app/chat nesta entrega.

**Ponto importante:** esta correção retira um custo comprovado da carga das
listas; não comprova o tempo total de boot no aparelho nem resolve a investigação
de voz. A entrega está em branch; ativação depende de autorização própria e CI
do commit integrado, conforme [Git e deploy](GIT_E_DEPLOY.md).
