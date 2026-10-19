# Conversas — revisão aprovada em 07/10/2026

## Stable contact directory — 19 October 2026

Presence, contact, group and last-message-preview refreshes project into existing
conversation rows instead of clearing the entire list. Unchanged text, checks,
unread badges, photos and status tiles keep their nodes. A changed field updates
only its section; a changed order moves existing rows and preserves keyboard
focus. Removed entries are disposed immediately, including their avatar work.
The empty state also keeps its node until its translated presentation changes.

Rows own their current entry and click handler. Menu bindings are refreshed with
the latest entry; an unchanged open menu resolves its actions from the current
projection, while removed entries or changed action availability close it.
Group photos retain one observer per group head/profile sequence. Pause, clear,
search close and session reset still release the existing photo lifecycles;
later rendering restarts released work. Private contact photos continue checking
their current local card pointer/tombstone, reuse the same image for the same
resolved URL, and remove the image on confirmed absence or failed current reads.
A superseded async photo read cannot overwrite a newer projection.

Implementation is confined to directory projection and photo/menu lifecycles.
The existing `messages/index.ts` coordinator remains a hotspot and is not changed:
its later dedicated split should separate initialization/session lifecycle, then
UI mounting, with startup, cancellation, recovery and authority regressions after
each step. This repair introduces no new app text, protocol, backend, dependency,
database, retention policy or deployment action.

**Ponto importante:** preserving a row does not preserve removed authorization or
a failed preview. Existing readers still determine what may be projected, and
an explicit directory clear discards its row cache. The captured eight rebuilds
are the regression target; acceptance of the visible effect on the owner's
browser remains a real-device retest after publication.

Local validation: lint, strict types, dependency boundaries/cycles, licenses,
formatting, localization and all three builds passed. The application suite ran
1,099 tests: 1,095 passed initially, three wallet cases hit their existing
10-second deadlines, and one proof test lacked the artifacts that CI prepares
before testing. Both wallet files passed their 41 tests in one serial recheck;
the proof passed after the existing pinned-artifact preparation command. These
isolated results do not turn the first full command into a clean run. The 318
deployment and 51 evaluation tests passed with the supplied Python 3.12 runtime;
the macOS system Python had rejected the existing safe extraction API. No test
limits, tool configuration or unrelated application code changed.

An isolated Chrome run used the real renderer, menus, private photo cache and
IndexedDB with synthetic contacts at 320 and 1280 px in both official languages.
All 68 assertions passed without page errors: eight unchanged refreshes removed
zero rows, retained images/status tiles/focus, and kept current menu actions;
reordering, partial updates, removal, photo deletion and explicit clear also
passed. The source archive contains the new authored modules. This is local
verification, with exact-commit CI and physical-browser acceptance still pending.

## Enquadramento e ampliação da foto privada — 15/10/2026

> Atualização posterior de 15/10/2026: a DM pelo `@` passa a usar o mesmo visualizador de avatar e preserva a foto durante atualizações comuns. A edição de texto próprio foi autorizada também nesse contexto, substituindo a recusa histórica de edições registrada abaixo. Navegação e avisos usam execução serializada, invalidação imediata e preparação inicial reaproveitada na sessão; histórico já sincronizado consulta o snapshot autenticado e as remoções antes de usar sua cópia cifrada. O cursor versão 3 relê as novas ações uma vez. Identidade, chaves e consentimento continuam separados. [Matriz e contrato](PARIDADE_CHATS.md).

O proprietário pediu retirar o fundo visível e centralizar a foto do cabeçalho,
além de permitir ampliá-la. Quando existe foto, a moldura circular recorta uma
imagem posicionada por toda a área, com `cover` e centro explícito; o degradê
das iniciais sai somente enquanto a foto está disponível. A lista privada usa
o mesmo recorte circular sem fundo sob a imagem. Sem foto, permanecem as iniciais.

A foto do cabeçalho é um botão acessível que abre a imagem já recebida neste
aparelho. O visualizador oferece ampliar, ajustar à tela, fechar e Escape,
sem buscar bytes, sincronizar contatos ou consultar perfis públicos. O mesmo
visualizador já usado por fotos públicas fica em `image-viewer`, separado dos
leitores de mídia pública; a origem e o ciclo de vida dos bytes continuam com
seu módulo de origem.

`chat-ui/avatar-photo.ts` conserva a ampliação durante atualizações normais do
cabeçalho e fecha ao substituir/remover a foto, trocar contato, navegar ou mudar
de sessão. URLs privadas continuam pertencendo ao cache de cartões recebidos;
o visualizador não persiste nem cria cópias adicionais. Nome, E2EE, acesso ao
cartão e distribuição da foto permanecem iguais.

**Ponto importante:** alteração de apresentação e interação, sem backend,
migração, dependência, retenção ou ativação automática na VPS. A verificação
visual usa fotos sintéticas, sem copiar a foto privada enviada pelo proprietário.

**Ativação autorizada em 15/10/2026:** após a CI integral de `af5e05f`, o
proprietário pediu integrar à main e enviar à VPS. Publicar somente o commit
integrado, enviado e com CI aprovada pelo executor existente, com preservação,
rollback e versão servida conferida. [Contrato operacional](GIT_E_DEPLOY.md#enquadramento-e-zoom-da-foto-privada--ativação-autorizada-em-15102026).

O bootstrap de `messages/index.ts` continua um hotspot; esta alteração conecta
somente o callback da foto existente. Proposta para tarefa própria: separar a
inicialização/sessão do coordenador de sincronização e da montagem da interface,
nessa ordem, mantendo os contratos de cancelamento e os testes de inicialização,
troca de conversa, exclusão, retomada e navegação antes da conferência no browser.

## Histórico da revisão

Em 09/10/2026, a navegação e o tema desta revisão passam a ser substituídos por [painéis e temas](UI_PAINEIS_E_TEMAS.md), por etapas. As regras de conversa abaixo continuam.

O proprietário escolheu a proposta **Conversa em foco** e autorizou sua implementação, com o menu atual incorporado à composição. As imagens fornecidas são referências de organização; dados pessoais e conteúdo das imagens não entram na interface.

- Desktop mantém a navegação Conversas/Comunidades, os filtros Todos, Não lidas, Favoritos, Grupos e Arquivadas e o perfil no rodapé esquerdo. A lista rola independentemente do perfil.
- Cabeçalho reúne destinatário, presença permitida pelas preferências, ligação e opções. Autorizações de representantes e administração/cofre de grupos permanecem acessíveis nas opções.
- Mensagens recebidas ficam à esquerda; enviadas, à direita em verde suave. Contadores na lista destacam mensagens não lidas. Os sinais de entrega/leitura usam o contrato existente; não inventar horários ou recibos que não estão disponíveis nesse contrato.
- Reply, edit, react and delete for both remain message menu actions under existing authorship, local-copy and consent checks. Forward in private conversations starts multi-message selection and then an explicit recipient picker using local aliases and already received private photos. Public-identity chats never offer Forward. Tapping the current user’s emoji chip removes that reaction; there is no separate removal menu item. Both chat types place reactions below the bubble and the authenticated sender clock inside its bottom metadata area.
- Campo de mensagem fica na base. Emoji e clipe permanecem junto ao texto; o microfone dá lugar ao envio quando há texto ou anexo. Foto otimizada e arquivo original continuam distintos, com prévia e aviso de metadados antes de enviar. Gravação exige conferir a prévia e enviar explicitamente.
- Resposta/edição, gravação, prévia e envios pendentes aparecem somente quando necessários. A conexão tem estado compacto e detalhes com sincronização manual.
- Mobile abre uma conversa por vez, com voltar no cabeçalho e compositor na base. O cabeçalho da marca e a navegação principal deixam espaço para a conversa; voltam na lista. Estrutura inspirada na referência do WhatsApp, usando identidade própria.
- Não mostrar os rótulos “Conversas privadas” e “Criptografia de ponta a ponta” nessa composição. Não remover proteção criptográfica.

**Ponto importante:** entrada, retomada e invalidação por exclusão/autorização mantêm o histórico oculto até a conferência. Atualizações normais conservam a visão anterior conforme a revisão de 08/10/2026. Desde 12/10/2026, uma pausa normal conserva o histórico validado para reuso após snapshot autenticado igual e confirmação final, sem repetir sua carga; ver [contrato de reuso](BLOCO_10A_AUDIO_E_TEMPO_REAL.md#reuso-do-histórico-na-sessão--12102026). O compositor impede novo envio enquanto essa verificação não terminou. Recuperação, revogação, permissões, cota e persistência continuam sob os módulos existentes; a revisão não muda o protocolo, dependências ou banco.

Validação: verificações estáticas e build do projeto, regressões do compositor/posição de leitura e testes dos contratos de mensagens. Conferência visual deve usar somente fixture local com dados fictícios, incluindo largura mobile, ações de mensagem, prévia, volta à lista e perfil no rodapé. Aceite em aparelhos físicos e eventual ativação na VPS são etapas separadas.

## Resultado local

Lint, tipos, fronteiras, formatação e build passaram; o build conserva 38 assets e distribui as fontes do novo módulo. Cinco regressões cobrem bloqueio de envio, gravação/prévia e posição de leitura durante sincronização/troca de conversa. Os testes existentes de filtros, busca, agenda, voz, anexos, navegação, visibilidade e ações cifradas passaram. A integração PostgreSQL/HTTP concluiu 27 testes de mensagens, recuperação, exclusão, bloqueio, cotas, recibos e revogação.

Na fixture local com duas contas sintéticas, foram conferidos envio/recebimento reais, contador de não lidos, resposta, edição, foco no campo, prévia de arquivo com aviso de metadados, remoção da prévia e volta à lista. Atualização do PWA preservou as contas de teste. Conferência responsiva usa 320/390 px e desktop; capturas e evidências ficam em `.local/`. Não houve alteração de dependências, protocolo, migração ou ativação na VPS.

## Private group directory identity — 14/10/2026

Opening a group from the directory must update both the conversation panel and the selected row. Clear the direct-conversation selection immediately, then notify the directory after the group controller resolves or fails. When projecting the list, an opened group takes precedence over a stale selected contact. Filters and search reuse the same entry identity and selected state.

Group rows load the same private profile photo already received by this device, using offline vault authority and the known local/current group. They never synchronize or open a group solely to obtain an avatar. Existing independent local copies preserve their local photo access without granting remote membership. The avatar reader uses the existing private cache/history contract and account-generation checks. Missing or unavailable photos preserve initials.

A dedicated directory-photo module observes visible rows, creates at most one blob URL per visible group avatar and releases it when the row leaves the viewport. Directory replacement, search replacement/close, navigation and session reset abort the row lifecycle and prevent late bytes from reappearing. The existing conversation renderer shares that lifecycle with search. Feature-owned CSS fills the circular frame without changing app-wide theme rules.

`messages/index.ts`, `groups/index.ts` and `groups/controller.ts` remain existing hotspots. This repair adds only selection notifications and small photo/lifecycle connections. A separate reviewed split should first extract group lifecycle, then local profile/history access, then chat composition/administration; validate selection, cancellation, offline copies, authorization and E2EE recovery after each step. Do not mix that refactor with this visual repair.

## Message forwarding and reaction presentation — 15/10/2026

Forward selects any number of messages in the currently verified loaded window. Older messages can be loaded through the existing history controls. There is no new selection-count limit; normal storage, per-message size, consent and transfer limits remain. Closing the authorization gate or leaving the conversation cancels the remaining selection. Messages are forwarded sequentially, with explicit progress. A completed item leaves the selection immediately; a failed transmission retains its staged outbox and recipient so retry does not create a second copy. Recipient paging reuses the approved directory. Photos come only from locally received private profile cards, with two concurrent reads, visibility gating and blob cleanup. Aliases remain in the encrypted local agenda.

New individual/private and public-identity messages include optional versioned presentation metadata inside the existing Megolm application content. `presentation: { version: 1, sentAt }` is authenticated by the existing encrypted packet. It is a sender-device clock, not a server receipt. The packet schema, signing format, algorithms, keys, AAD and recovery envelopes remain unchanged; old readers ignore the extra application metadata and updated readers accept its absence. The optional clock is preserved in root-sealed receipts and encrypted backup records. Historical messages without this information do not invent a time. Edits retain the original message time; forwarding creates a new message time.

Public-identity reactions use the existing signed `reaction` relation and an encrypted Unicode emoji/empty removal action. Private wallets/profile cards and edits remain rejected. Admission requires current consent, matching participants, the immutable original hash and author, and a live root not personally removed by the reactor. Root row locking serializes the bounded budget of 64 retained actions; retries with the same packet are idempotent. Action rows occupy the existing history relation index rather than root-message slots, and displayed actions receive bounded read-receipt updates. Migration 069, explicitly approved for preparation on 15/10/2026, adds only an expression index for bounded reaction admission; existing tables, messages and all earlier migrations stay unchanged. Its production activation requires a separate reviewed transition through the existing executor. No dependency, retention policy or shared infrastructure changes are included. Public history delivers action packets only after the updated client explicitly requests `actions: true`; legacy clients continue to receive original messages. The updated client upgrades its encrypted local history cursor to version 2 and rescans once so reactions cannot be skipped by a cursor saved by an old client.

Existing hotspots remain in `messages/index.ts`, `messages/controller.ts`, `communities/dms.ts`, `social-dm/index.ts` and `local-history/index.ts`. This change keeps selection, recipient presentation, photo loading, reaction chips and server admission in focused modules. A separate reviewed extraction should move conversation composition/lifecycle first, then authenticated history/cache access, then public-chat rendering and backup storage transactions. Validate E2EE recovery, invalidation, retry idempotency, history paging and media cleanup after each extraction.

Local verification: targeted regressions cover multi-selection, sequential retries without re-staging a completed item, gate cancellation, emoji ownership/removal, stable original clocks, legacy encrypted records and bounded/deduplicated reaction receipts. Real SDK/PostgreSQL coverage checks reaction target binding, consent, idempotency, the action budget and legacy/new client history negotiation alongside existing media, quota, block and recovery scenarios. Synthetic browser checks cover both languages at 320/390/1280 px, recipient aliases/photos and blob cleanup, no Forward in public chat, clocks/reaction placement, no horizontal overflow and encrypted IndexedDB projection/cache upgrade. Operational evidence stays in `.local/`. Activation is a separate step.

## Canceling an edit — 19/10/2026

Canceling a text edit clears the composer and its editing context in private wallet chats and public @ DMs. The input event refreshes composer controls so the canceled text cannot be submitted as a new message. The original stays in history; no deletion or edit is sent. Canceling a reply preserves the typed draft, and clearing a public DM context without an active edit also preserves an independent draft.

The private and public edit-cancel regressions passed as part of the 1,107-test local run on 19/10/2026. The private case also verifies that a canceled edit cannot enqueue a new message and that canceling a reply preserves its independent draft. Existing coordinator hotspots remain; a separate reviewed task should extract composition and its controls first, then browser/session lifecycle, preserving authenticated history closure, E2EE, queued sends, audio cleanup and the coordinator regressions. This fix adds no new responsibility to those coordinators.
