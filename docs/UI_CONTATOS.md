# Contatos — revisão solicitada em 07/10/2026

Em 09/10/2026, [painéis e temas](UI_PAINEIS_E_TEMAS.md) tirou Contatos da barra mobile: a tela abre por Perfil → Contatos, agenda e convite e pelo + da lista; pedidos recebidos também aparecem na Atividade. As regras abaixo continuam.

O proprietário pediu uma interface de contatos mais clara, com menos texto e ações dispersas. A implementação mantém a identidade visual do menu lateral e do chat, sem alterar as regras de contato ou descoberta.

## Ecossistema automático no formulário — 09/10/2026

O proprietário confirmou que a mensagem “Wallet inválida” ocorreu ao selecionar EVM para um endereço Solana e pediu remover essa escolha. O formulário de contato passa a pedir somente o endereço completo e o apelido opcional. Ao salvar ou solicitar conversa, o cliente identifica EVM pelo endereço `0x` com 40 dígitos hexadecimais, ou Solana pelo endereço Base58 canônico que representa 32 bytes. A validação existente continua obrigatória; não consultar o servidor nem salvar endereço inválido. EVM permanece normalizado e Solana conserva maiúsculas/minúsculas; espaços externos de colagem são removidos.

A identificação usa apenas o endereço informado, sem RPC, consulta à blockchain ou serviço externo. Agenda e API conservam o campo de ecossistema validado; editar, reabrir e restaurar rascunhos usam o mesmo endereço. A UI final, a escolha de ecossistema no login, descoberta escolhida pelo destinatário, consentimento, bloqueios e formatos cifrados permanecem.

Validação local: 19 testes direcionados de contatos, ciclo da UI, normalização e wallets passaram, assim como lint, tipos estritos, fronteiras, formatação e build. A regressão do formulário falhou antes da mudança e passou ao identificar o endereço sem seletor; cobre salvar/solicitar EVM e Solana e impedir ambas as operações para endereço inválido. Seis fluxos de formulário em Chromium com API/cofre fictícios, em 320, 390 e 1440 px, confirmaram a identificação, o salvamento, a solicitação e a ausência de erro JavaScript ou excesso horizontal. Esses ensaios não substituem teclado/câmera e aceite físico mobile.

A [CI integral de `12f6936`](https://github.com/karma352431231-ship-it/0xDMme/actions/runs/38001650650) passou. A primeira ativação restaurou o código anterior depois de falhas de inicialização do worker de mídia pública; o limite de partidas impediu sua recuperação imediata. A conferência posterior confirmou fontes anteriores, saúde, configurações e processo do banco preservados. Os três workers foram iniciados com a mesma release restaurada e suas reservas foram verificadas, sem alterar configurações ou reiniciar serviços compartilhados. A causa das falhas iniciais não foi estabelecida. Preservar o registro da falha e exigir nova CI integral antes da tentativa em workspace separado pelo executor existente; acesso e evidências ficam em `.local/`.

**Ponto importante:** a identificação automática evita selecionar EVM para uma wallet Solana; permitir descoberta continua apenas habilitando o pedido, que exige aceite do destinatário.

## Organização da tela

- Contacts combines saved, pending outgoing and approved identities in one list, as revised on 14/10 below. Only approved rows expose **Chat**. The 19/10 settings revision below replaces the three-dot row options with Open contact for every row.
- Solicitações ficam em uma aba, com Recebidas, Enviadas e Recusadas. Aceitar/Recusar são ações explícitas; cancelar um pedido fica no menu. O contador representa pedidos recebidos da página carregada, não um total global inventado.
- The private address book is part of Contacts; Blocked keeps its own list. Vault versions, removal markers and conflict resolution retain their existing contracts. Saved records are never presented as conversation authorization.
- Adicionar contato abre um formulário contextual para wallet ou convite. Saving alone sends no request; after a successful request, the peer is also remembered in the encrypted address book, as revised on 14/10 below. Link/QR usa o fluxo já existente; câmera encerra ao fechar o formulário ou voltar ao modo wallet. Visibilidade continua no Perfil. Na revisão posterior de configurações solicitada em 07/10/2026, o próprio convite passa para **Contatos → Meu convite**, com criação, cópia, troca, revogação e QR no mesmo painel.
- A busca filtra apenas itens carregados no aparelho. Nomes/labels e termos não são enviados ao servidor. As páginas de permissões e agenda conservam os limites existentes; indicação de página não promete pesquisa no que ainda não foi carregado.
- No mobile, botões da linha ficam juntos, com formulário em painel modal e abas acessíveis por toque/teclado. O perfil do desktop conserva a posição no rodapé esquerdo.

**Ponto importante:** salvar não aprova uma conversa. Desbloquear exige novo consentimento; o histórico e as limitações de cópias anteriores permanecem. Nenhuma dependência, migração, formato cifrado, regra de descoberta ou permissão é alterada. Implementação e sincronização de fontes não autorizam ativação na VPS.

Validação local: lint, tipos, limites de dependências e formatação conferidos; build com 38 assets públicos. Os 22 testes relacionados cobrem busca local, ciclo de sessão, agenda/contatos e navegação. Uma regressão reproduziu a perda do convite por um evento de fechamento atrasado durante o login; o formulário reaberto conserva o convite após a correção. As dez integrações de contatos passaram, incluindo visibilidade conservadora, aparelho autorizado, consentimento, bloqueios, paginação, concorrência, idempotência, sessão e CSRF.

No navegador, duas contas fictícias confirmaram busca, abertura de conversa, bloqueio/desbloqueio, salvamento/edição de apelido particular, solicitação e aceite bilateral, convite inválido com erro dentro do formulário e navegação das abas por teclado. Lista, menus e formulário foram conferidos no desktop; larguras de 320/390 px preservam abas e formulário sem rolagem horizontal do documento. Capturas e dados ficam em `.local/`. Aceite físico, teclado virtual, câmera e QR reais permanecem separados; nenhuma ativação na VPS foi executada nesta revisão.

## Unified private contact directory — 14/10/2026

The owner requested one mobile contact flow and persistent contacts before acceptance. Remove the second Contacts/agenda tab; the first Contacts list combines the existing encrypted address book, durable outgoing requests and approved relations. Deduplicate by canonical ecosystem/wallet and retain private aliases. Saved-only and pending rows show their actual status and cannot expose the Chat action; acceptance upgrades the same row. Received requests, cancellation, rejection and blocking retain their original signed operations in Requests/Blocked.

A successful request remembers a new peer through the existing encrypted address-book save, including wallet requests and invitations. Preserve an existing alias/reference instead of overwriting it with the peer name; retain conflict resolution and removal markers. A failed bookmark does not undo the committed request, simulate success or retry it automatically. Existing saved entries and outgoing relations remain visible after mounting again; saving alone continues to send no request.

Reuse the existing bounded address-book reader, now owned by `contacts/directory.ts` and consumed through the contacts public interface by messages. `directory-view.ts` owns the combined projection and presentation, and `request-contact.ts` owns remembering a requested contact. Each visible slice has at most 16 rows, with explicit controls for encrypted and server pages. Search remains local. Automatic contact snapshots preserve current pages at unchanged revisions, return fresh incoming items to Activity and repaint only after a contact revision changes. They never run a vault synchronization or disable the form.

The existing `contacts/index.ts` remains a mixed screen/lifecycle hotspot. In a separate reviewed task, first extract session/readiness into `contacts-session.ts`, then dialog/form coordination into `contacts-request-screen.ts`. Keep list projection, signed controller and encrypted persistence separate; validate late session changes, draft preservation, alias/conflict handling, partial failure and keyboard/mobile behavior after each extraction. Do not combine that refactor with this repair.

**Ponto importante:** the owner authorized both repairs on main and VPS and continuation after compaction. Stored contact identity remains private and encrypted; acceptance is still mandatory for chat. No schema, dependency or wallet discovery rule changes.

## Edit shortcuts in contact menus — 15/10/2026

Contact row menus now include **Edit contact** / **编辑联系人**, including saved
contacts whose conversation is not approved. The private conversation header's
three-dot menu offers the same shortcut. Both reuse the existing navigation to
Contacts and its prefilled private address-book form. The form identifies itself
as editing, keeps the wallet address read-only, and lets the owner change the
private nickname. Saving retains stored account/identity references and uses
the existing encrypted address-book save and directory update. It sends no
conversation request, approval or profile change to the other person.

The explanatory contact-menu footer is removed for both approved and saved-only
rows. Group actions retain their own existing behavior. Representative
authorizations remain available as optional organization credentials; they do
not grant financial powers or become a requirement for ordinary chat.

The existing `startContacts` and community `posts.ts` coordinators remain
hotspots. This change only adjusts the existing editor's field state and reply
classification. A separate reviewed split should first extract contact-editor
presentation/lifecycle, then contact request/invitation actions; separately split
post projection from reading/pagination. Preserve session guards, encrypted
identity fields, conflicts, drafts, media cleanup and scroll through their
existing unit tests and targeted browser checks. Do not combine that split with
concurrent edits of either coordinator.

## Dedicated contact settings — 19/10/2026

The owner requested removing the three-dot menu from the Contacts list and showing Open contact for every saved, pending or approved row, including peers without a local bookmark. Open contact opens a dedicated dialog with the contact name, addition method and private nickname field. The sole primary action saves changes to the encrypted address book; this dialog cannot discover a wallet, send a request or accept an invitation. Add contact retains its separate wallet/invitation flow. Request-tab consent/cancellation and block controls remain available in their own existing contexts. Saved version conflicts are selectable inside contact settings, preserving explicit resolution and parent limits.

New wallet additions and outgoing requests write an encrypted address-book application record with version 2 and addedVia set to wallet or invite. The invitation token/link is never stored in that record. Wallet-origin settings show the wallet; invitation-origin settings show only Added via invitation. Private alias edits preserve the recorded origin, identity references and immutable wallet. Unchanged saves do not write another vault version. Session/navigation changes discard the dialog and invalidate unfinished opens/writes through the existing guard.

At the owner's request, existing contacts are not migrated or backfilled. Version 1 records remain readable and keep their format when edited; unrecorded origins are not guessed. Incoming approvals without a local addition record likewise do not prove which discovery method the sender used. The settings display does not expose a wallet for an unknown origin. The new application record requires an updated reader: older clients that support only version 1 reject version 2 rather than infer a source. This changes encrypted application data, not keys, AAD, signing, vault envelopes, backend schema, contact authorization or public @ identity. No dependency or migration is included. The owner's subsequent scheduled main/VPS authorization supersedes the initial branch-only instruction; follow the [scoped release contract](GIT_E_DEPLOY.md#contacts-and-private-chat-ui--activation-authorized-on-19-october-2026).

The contacts coordinator remains a hotspot. This change reduces it by moving settings editing and draft construction into contact-settings.ts and contact-draft.ts. A separate reviewed task should extract addition/invitation handling first, then request/block presentation, preserving session guards, pagination, concurrent encrypted versions and consent tests. Do not combine that extraction with another session's edits.

Local validation for the 19/10 controls/settings changes: lint, strict types, dependency boundaries (778 modules), full formatting check, English/Chinese localization coverage and the web build passed. All 1,107 Node tests passed with concurrency set to two, with no failures, cancellations or skips. Eight isolated Chromium scenarios passed in English and Simplified Chinese at 320/390/768/1440 px: hover/focus/touch and Escape, explicit Apply, native radio navigation, no horizontal overflow, desktop/mobile photo decoding and stable image nodes, photo cleanup, Open contact on every row, no row ellipsis, wallet/invite/unsaved settings, nickname-only saves, unchanged-save deduplication and cancellation of a late open. The four new TypeScript UI modules are present in the distributed source archive. No live account, physical mobile device or database-backed integration was exercised for this UI-only backend scope. Evidence remains in .local/. Main and deployment were left untouched at that validation stage, before the subsequent release authorization.
