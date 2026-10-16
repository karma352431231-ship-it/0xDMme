# Carregamento de contatos e conversas — 15/10/2026

## Foreground directory startup — 16/10/2026

The owner supplied a complete physical Chrome Android boot capture and approved
fixing the measured startup contention. The observed initial private directory
waited through repeated online authority reads and signed startup work. Native
lock wait alone did not show the application's preceding serialized queue.
The debugger setup pause and later individual-chat navigation are excluded from
that analysis. Captures, exact timings and operational evidence stay in `.local/`.

`app/session-boot.ts` now owns a bounded startup gate for one current session.
When opening the foreground private chat directory, start its existing loader
and calls normally; incoming group links remain immediate as well. Defer optional profile/community readiness, contacts-screen
warmup, activity, status, vault, settings and session decoration until the first
directory publication. Repeated readiness callbacks coalesce into that single
pending warmup. After startup, normal readiness rechecks keep their behavior.

Other foreground pages, including Communities and Contacts, keep their normal
startup path. Navigating away releases deferred work immediately. A valid
directory failure also releases it while the existing error remains an error;
runtime failure never becomes directory success. Do not wait for message SDK
initialization to release work after a directory already appeared. Deep-link or
offline directory publication can settle the same current-session gate.

Account, device or CSRF changes, logout and authorization loss invalidate the
pending warmup. A stale completion cannot start another session's deferred work.
There is one pending session and no added timer, retry, queue, storage or network
operation. Calls and explicit screen/controller actions keep their own lifecycle.
Every online operation still reacquires its existing verified authority and
checks revocation/removals; history remains behind the existing runtime and
verification gates. No backend, schema, dependency, cache or crypto change is made.

Regression coverage exercises the assembled authorized app entry point, one-time
directory startup, immediate calls, deferred warmups, normal post-start rechecks,
foreground navigation, account/device/CSRF replacement, logout and directory/
runtime failures. A passing synthetic test establishes scheduling behavior,
not a physical mobile speedup. Reuse the console capture for acceptance.

The app and message coordinators remain hotspots. This repair adds small wiring
calls and puts the scheduling rule in its own module. A separate reviewed task
should extract app session composition/readiness, then route mounting; for the
message coordinator, extract session/identity first, outbox/composition next and
history/view lifecycle last. Preserve generation cancellation, disposal and
verification gates; run app startup/navigation, message session/revocation,
recovery and layout tests after each extraction. No broad split is included here.

**Ponto importante:** this changes startup scheduling while preserving security
checks. It does not establish the final mobile speedup or activate a release.

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
| Reabertura com ciphertext local                    | 7270 ms | 1388 ms  |
| Retomada da mesma sessão, com ciphertext local     | 3945 ms | 1554 ms  |
| Reabertura sem ciphertext local                    | 7240 ms | 1921 ms  |
| Retomada após a primeira carga remota              | 3948 ms | 989 ms   |
| Downloads de objetos na reabertura com cópia local | 32      | 0        |
| Leituras de autoridade na reabertura               | 35      | 5        |

CPU, rede e armazenamento de um celular podem mudar esses tempos. Não houve
teste físico. Evidências, harness e dados de execução ficam somente em `.local/`.

## Contrato da correção

- `VaultSync.openMany` abre até 16 IDs únicos por operação. Agenda mantém suas
  páginas de 16 contatos e até 16 versões por contato; conflitos maiores continuam
  recusados. A leitura de pins também cede a autoridade entre lotes de 16.
- Dentro do lote, no máximo quatro objetos são lidos/decifrados em paralelo.
  Mesmo com erro, aguardar todas as tarefas do grupo antes de devolver a
  autoridade. Uma leitura não continua executando depois da liberação do lock.
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
chat pelo @ também passam: 79 testes dirigidos, mais 19 testes de montagem do
app, sessão, cofre e criptografia real de mensagens/grupos, em arquivos distintos.

Transporte do cofre e abertura/validação de objetos saem de `vault-sync/index.ts`
para `api.ts` e `objects.ts`, dentro do mesmo módulo. A interface pública continua
no índice; agenda e identidade usam somente essa interface. Não há alterações
nos hotspots dos coordenadores do app/chat nesta entrega.

**Ponto importante:** esta correção retira um custo comprovado da carga das
listas; não comprova o tempo total de boot no aparelho nem resolve a investigação
de voz. Após a CI integral de `9be4698`, o proprietário pediu integrar à main e
ativar na VPS, substituindo a restrição anterior de entrega em branch. A ativação
exige CI do commit integrado e confirmação operacional pelo executor existente,
conforme [Git e deploy](GIT_E_DEPLOY.md#boot-de-contatos-e-conversas--ativação-autorizada-em-15102026).
