# Carregamento de contatos e conversas — 15/10/2026

## Usable conversations during mobile startup — 16/10/2026

The owner clarified that both manual markers in the latest capture referred to
Conversations; the separate Contacts screen was not opened. Automatic directory
publication and synchronization state identify two different waits. A visible
row was routed through a global busy gate that discarded the opening request.
Its startup operation also awaited group refresh, outbox work and presence before
releasing all conversation controls. Exact captures and timings remain private.

Conversation rows stay enabled during synchronization. A tap is acknowledged by
selection presentation and retained by `messages/opening.ts`: one latest choice,
with replacement/logout cancellation, no unbounded interaction queue. Engine
selection and history opening run only when the current exclusive operation has
settled, before the next maintenance turn. A startup failure discards queued
openings. A tap never makes unverified history available or permits early send.
The existing local draft remains editable while selected-history verification
runs; sending and media retain their existing verification and busy gates.
An initial text send updates that selected conversation's read receipts without
waiting for account-wide presence/push work already scheduled by startup.

The essential startup path loads pins and the authenticated directory, prepares
the existing runtime/controller, refreshes a currently selected conversation when
needed and saves pins. Initial profile-preference events do not start presence
or profile broadcast ahead of that path. The latest preferences are read later.

`messages/warmup.ts` owns four fixed maintenance turns: group directory/settings;
durable outbox resumption and pin persistence; presence/push preferences; directory
previews and optional app warmup release. Each turn starts after an idle interval
and uses the existing maintenance exclusion. Foreground work waits for at most
the maintenance turn already running, not all remaining startup turns. Pending
startup work suppresses bulk history preloading, while live checks and immediate
invalidation remain available. After maintenance, normal background preparation
resumes. Session replacement and page departure cancel deferred work; an in-flight
owner retains its generation checks. Maintenance failures remain visible and the
existing explicit refresh can retry them; they never synthesize group success.

This supersedes the earlier app-warmup release at first directory publication:
the callback now follows essential initialization and bounded message maintenance,
or a current-session startup failure. Navigating to another foreground page still
releases optional app work immediately. Calls and incoming group links retain
their existing immediate startup. Every signed operation reacquires its verified
authority; no authorization/removal cache or cryptographic shortcut is introduced.

Behavioral acceptance covers a row tapped before runtime initialization settles,
latest-recipient replacement, logout/failure cancellation, local draft retention,
send gating and submission before unrelated startup work, and foreground priority
between maintenance turns. Existing live/suspension, recovery and session tests
remain required. The coordinators remain hotspots; keep the previously proposed
separate extraction order rather than mixing a broad refactor into this repair.

**Ponto importante:** completion means an accepted tap, verified selected history
and usable composer. List publication alone is not functional readiness. Physical
gains and release activation require their own evidence after the source checks.

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
warmup, activity, status, vault, settings and session decoration during startup.
The newer functional-startup contract above supersedes the original release at
first directory publication. Repeated readiness callbacks coalesce into that single
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
checks. The owner subsequently authorized main integration and VPS activation
through the [existing release process](GIT_E_DEPLOY.md#private-directory-boot-repair--activation-authorized-on-16102026).
Activation requires its passing checks and published receipt; a new physical
capture remains necessary to establish the final mobile speedup.

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
