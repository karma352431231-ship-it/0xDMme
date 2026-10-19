# Carregamento de contatos e conversas — 15/10/2026

## A visible live check releases optional prefetch — 19 October 2026

The synchronization gate excludes a running optional history-preparation page.
A normal background hint deliberately waits for that page, but the same gate
also held a newer visible interactive history request. A regression demonstrates
that the request never asked the existing prefetch lifecycle to yield.

A visible interactive request now invokes that existing cooperative stop before
coalescing its fresh signed check. The active page still settles and releases its
SDK owner before the check runs; no overlapping SDK access or skipped authority,
removal or final confirmation is permitted. A stopped page is not marked complete
and preparation resumes later. Ordinary/hidden background hints keep their
previous behavior and do not repeatedly cancel a page.

**Ponto importante:** this changes scheduling of optional prefetch only. An empty
live hint grants no content, and the failed8s measurements stay failed until a
new assembled comparison meets the unchanged criterion. Calls are untouched.

## First directory opening retains foreground priority — 19 October 2026

The ordinary native-tab comparison passes its five-tab bidirectional send/focus
checkpoint, then stops on a28.898s sixth-tab opening against the20s limit. The
startup owner forwarded initial interactive priority to pins/runtime but dropped
it before the approved-contact/agenda/archive directory. Actual coordinator and
directory/controller regressions reproduce the loss before correction.

The first visible startup now forwards its existing work options through the
whole bounded directory: encrypted agenda heads, approved-contact signed reads
and local archived-peer discovery under fresh authority. Later automatic checks
and hidden startup retain maintenance priority. Directory changes/generation,
contact authorization, pagination and both vault removal checks are unchanged;
this is neither an authorization cache nor reuse of completed reads.

**Ponto importante:** current contact discovery remains mandatory before showing
an authorized peer. Passing priority regressions does not establish the20s finite
opening target; retain the failed sixth-tab measurement and compare separately.

## Saved user texts precede unrelated maintenance — 19 October 2026

A native ordinary-use comparison reaches five same-account tabs but stops at the
first UI delivery deadline. The text remains locally queued: the current history
recheck continues through contacts, groups and presence before transmission can
claim its owner. A real coordinator regression reproduces this ordering.

The synchronization owner now yields a multi-owner change recheck between steps
when a user text, requested opening or newer visible live hint is waiting. It retains one coalesced probe
for the remaining automatic work. The active authority/SDK operation finishes
normally; no work is interrupted or run concurrently. The regression verifies
that sending or the newer live check wins the next turn and unrelated maintenance
resumes afterward. A newer visible hint arriving during contacts does not wait
for groups/presence; the current contact owner finishes first.

Explicit queued text transmission also forwards its existing interactive priority
through current pin loading, recipient verification, pin persistence and encrypted
publication. Automatic retries/profile-card work keep maintenance priority.
Identity and vault owners accept the same bounded work options; current authority,
peer identity, removal checks, durable pin commit, FIFO outbox/idempotent packets,
SDK exclusivity and fresh history confirmation remain mandatory.

**Ponto importante:** contacts/groups/presence may finish after a just-saved text
is sent. A pending local bubble does not establish server acceptance or delivery.
These source regressions are not assembled performance acceptance; preserve the
failed eight-second result and measure the corrected candidate separately.

## Profile publication follows verified history — 18 October 2026

The assembled trace includes an automatic own profile-card publication before
history projection, even though verified history does not require publishing a
new name/photo. Both explicit opening and selected-history startup awaited that
publication. The real coordinator regression holds profile transmission and
reproduces blocked history before the correction.

Ordinary automatic selected-history refreshes retain maintenance priority through
probe, pins, projection and fresh confirmation. Explicit opening and user sends
keep interactive priority. A changed/removed live hint for the visible direct
conversation also prioritizes its fresh history recheck; an empty hint grants no
content or authority. Hidden conversations and unrelated contact/group/presence
work retain maintenance priority. The synchronization owner keeps one pending
priority bit through coalesced probe/full-refresh requests, consumes it once and
clears it on reset or covered full-refresh startup. A page hidden before dispatch
returns to maintenance priority. Active work is never aborted.
Real coordinator regressions distinguish ordinary automatic refresh, explicit
opening, a visible live change and a hidden live change; scheduling regressions
cover coalescence and reset so priority cannot leak into a later session.

Opening and startup now finish their existing verified history/removal/server
confirmation flow first. The existing ProfileBroadcast round handles the card
after foreground work and startup maintenance settle. It retains readiness,
one active round, idempotent encrypted publication and existing retry triggers.
The current approved private contact joins that round even when outside the
loaded directory page; archive-only contacts are excluded. No cross-session
selected-recipient state or new queue is retained. Profile publication errors do
not turn successful verified history opening into a failed conversation.

**Ponto importante:** the other person may receive the updated name/photo after
history opens. Private cards still reach confirmed contacts automatically through
the existing encrypted-message path; history authorization and user sends retain
their current verification gates. This ordering correction is not finite load
acceptance until the assembled comparison meets its declared criteria.

## Cross-tab authority admission — 18 October 2026

The per-controller priority queue cannot reorder maintenance requests already
submitted by other tabs to the native account lock. A regression using three real
controllers and the native LockManager reproduces maintenance ahead of a later
foreground action. `devices/authority-turns.ts` now owns admission across tabs.

Foreground operations request a shared account turn gate. Maintenance first takes
an exclusive account maintenance-intent gate, then an exclusive turn gate. Only
one maintenance contender can wait at the turn gate; other maintenance contenders
cannot queue ahead of foreground work there. A queued exclusive turn also blocks
later shared arrivals, so maintenance progresses under continued foreground work.
The controller's existing four-interactive-turn fairness policy remains in force.

Every admitted operation then takes the original exclusive account SDK lock and
performs the existing session, authority, cryptographic and removal checks. Shared
turn admission never permits concurrent SDK access. There is no lock stealing,
interruption of active work, polling, new persistent state or cross-tab payload.
The local queue, both admission gates and SDK acquisition consume the same
existing eight-second waiting budget; running work retains its existing lifecycle.
Timeouts, failures and owner-page closure release native locks. Other accounts and
browser storage partitions retain independent native lock scopes.

The owner clarified that five to ten tabs in one browser must work well. This is
an acceptance objective, not a product quota or evidence of a server-user ceiling.
Local regressions and a native browser control must pass before another finite
assembled comparison. Preserve previous failed profiles and their timing limits.
Calls remain deferred and last; no call behavior changes belong to this work.

**Ponto importante:** improved admission ordering is not assembled performance
acceptance. Full history still requires fresh authority and final confirmation.

## Queued vault reads and selected history priority — 18 October 2026

The capacity audit reproduced two client scheduling problems. Concurrent vault
refresh callers queued separate copies of the same read. Explicit history opening
requested interactive priority for its initial probe, then dropped that priority
for synchronization and final confirmation. The correction preserves the current
operations and checks while changing only their scheduling.

`vault-sync/queued-refresh.ts` owns one pending refresh group. Callers may join it
only before the authorized vault callback starts, before any local checkpoint or
remote vault read. The callback clears the joinable reference immediately. Later
callers schedule a fresh operation; neither active nor completed results are
cached. The actual batch still acquires verified device authority and reads
current removals, checkpoint, pending draft and remote pages normally. Failure
rejects every joined caller and releases the pending reference for a new attempt.

Account/device/CSRF replacement, reset, online/offline mode changes, explicit
local opening and intervening vault operations separate groups. Saves, retries,
discards and object reads never join a refresh or allow a later refresh to move
across them. In particular, a queued encrypted draft remains visible to the next
ordered refresh. Existing generation checks and bounded page/download work stay
in force; no new persistence, plaintext cache or cross-tab credentials are added.

The first visible directory startup also passes existing interactive work options
through pin refresh/object reads and runtime preparation. `MessageWarmup` owns the
initial-versus-normal lifecycle decision; hidden startup and subsequent automatic
rechecks retain default maintenance priority. A queued maintenance vault refresh
cannot absorb an interactive request: joinable groups must match priority as well
as online/offline mode.

Explicit opening and earlier-history navigation pass the existing interactive
work options through pin loading, `Messages.synchronize`, delivery, local-history
merging and final confirmation. Automatic maintenance retains its default priority. Device
work still permits four interactive turns before a waiting maintenance turn, caps
pending work and includes waiting in the existing acquisition deadline. Native
account locks and exclusive SDK handles remain unchanged. No running operation
is interrupted. The content read, current delivery check and local-history merge
form one bounded projection under its verified authority. After pin persistence,
a separate authority and server snapshot confirmation are still mandatory before
exposing any view. No authority result is cached for another read. This reduces
four authority acquisitions to two without bypassing the final check.

Regressions use the actual vault synchronizer with controlled storage/authority
boundaries and the actual history controller plus authority scheduler. They cover
queued sharing, a later active read, failure/retry, session replacement, network
mode changes, explicit local opening, encrypted-draft ordering and interactive
versus maintenance ordering through final confirmation. A projection regression
also requires two distinct authorization boundaries and keeps the history hidden
until the final fresh confirmation. Existing session,
revocation, removal, snapshot-change and hidden-history tests remain required.

The message controller and UI coordinator remain hotspots. This change forwards
existing work options within their current responsibilities; it does not add an
independent feature or split them. Keep the separate extraction order below:
session/identity, outbox/composition, then history/view lifecycle, with the
existing session, revocation, recovery and layout checks after each extraction.

**Ponto importante:** local regression success does not establish published
nine-page acceptance or a physical-phone speedup. Keep failed finite profiles and
their original limits in the private tracker. Publication uses the existing
integrated, pushed, passing-CI release process; no schema, dependency, runtime,
shared infrastructure, retention, crypto or call behavior changes are included.

## Usable conversations during mobile startup — 16/10/2026

The owner clarified that both manual markers in the latest capture referred to
Conversations; the separate Contacts screen was not opened. Automatic directory
publication and synchronization state identify two different waits. A visible
row was routed through a global busy gate that discarded the opening request.
Its startup operation also awaited group refresh, outbox work and presence before
releasing all conversation controls. Exact captures and timings remain private.

Conversation rows stay enabled during synchronization. A tap is acknowledged by
selection presentation and retained by `messages/opening.ts`: one latest choice,
with replacement/logout/navigation cancellation, no unbounded interaction queue. Engine
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
and usable composer. List publication alone is not functional readiness. The owner
authorized main integration and VPS activation through the
[existing release process](GIT_E_DEPLOY.md#usable-mobile-conversations--activation-authorized-on-16102026)
after 85 targeted scenarios and full exact-commit CI passed. Activation requires
the integrated commit's passing CI and matching published receipt. Physical gains
still require a new Android capture after release.

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
runtime failure never becomes directory success. The functional-startup contract
above now waits for essential message initialization and bounded maintenance
before releasing optional app work. Directory publication, including deep-link
or offline publication, alone no longer settles that current-session gate.

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
