# 0xDMme — Git e envio à VPS

## Automatic Activity and unified contacts — activation authorized on 14/10/2026

The owner requested automatic private-request/reply notifications, bell increments
and one mobile contact directory with peers retained before acceptance. The owner
then explicitly requested VPS activation of both repairs and continuation after
context compaction until both are active. Application source review is bound to
`0a2df41fb7e3e3f236ea108e2826f2d93939b3f8`, from published main predecessor
`803a569a4d2b2c9fec9895762759e11ad290d7ec`.

The existing executor admits only the exact whole-database projections of this
pair: `community-interactions.ts`, `community-posts.ts`,
`profile-notifications.ts` and new `public-notice-wake.ts`. The change retains
existing push jobs and adds generic account wakeups after commit, including
recipients without push subscriptions. Every one of the 67 SQL migrations, the
migration executor, all other database files, dependencies, Node, model
configuration and installed units remains exact. This is a code release; no
schema change, backfill, detector acceptance or shared-service change is included.

Require full exact-commit CI on integrated pushed main, a locally prepared build
and only `npm run deploy:staging`. Preserve the existing checks, public served
hashes, service readiness and rollback. Access, baselines, artifacts and receipts
stay in `.local/`. Behavior and validation: [automatic Activity](BLOCO_10_NOTIFICACOES_E_EXPERIENCIA.md#automatic-activity-refresh--14102026)
and [unified contacts](UI_CONTATOS.md#unified-private-contact-directory--14102026).

**Ponto importante:** approval and push do not establish activation. Require a
`published` receipt, correct served hashes and readiness. Saving a requested
contact remains encrypted and does not grant conversation authority.

## Owner image editor repairs — activation authorized on 14/10/2026

The owner explicitly requested main integration and VPS activation after the
completed repairs, superseding the earlier branch-only choice. Include `24806b9`
(image clipping and neutral frame backing) and `9f9a81e` (replacement/removal of
all four owner images and stable settings editors), preserving the current main
predecessor `de509a01d39f0be23b9ab3a8c2866543c8ca4d5f` and its required topics.
Behavior and validation are recorded in [owner image editors](PERFIL_PUBLICO_E_FEEDS.md#replace-and-remove-owner-images-without-editor-redraws--14102026).

This is a client, corresponding-source packaging, tests and documentation update.
All backend/database sources, 67 SQL migrations, dependencies, Node, model
configuration, units and deployment infrastructure retain the main predecessor.
Use only `npm run deploy:staging` from clean, integrated, pushed main with passing
exact-commit CI and the Mac build. Keep preservation, readiness, public asset and
source checks and rollback. No banner retry or detector acceptance change is
needed. Access, artifacts, baselines and operational receipts stay in `.local/`.

**Ponto importante:** publication requires a `published` receipt and verified
served assets. Selection/removal remains a local draft until Confirm changes;
local synthetic browser validation does not establish real-account acceptance.

## Required community topics — activation requested on 14/10/2026

The owner now requires one or two topics for new communities. Validate the
creation form and the authoritative new-community admission; preserve historical
empty classifications, reads and creation retries. This is a code-only update
from published `8d94f34`: all 67 SQL migrations, dependencies, model configuration
and units remain exact. Bind only `community-classification.ts` to reviewed
application commit `b086ad511cd3338a5246f7f6752ca250be7892ff` in the existing
executor, require exact-commit CI and deploy from clean,
pushed main with the existing preservation, readiness and rollback checks.

## Community notice copy update — activation requested on 14/10/2026

Remove the automatic-analysis pause/manual-handling sentence from the creation
notice in English and Simplified Chinese. This is a catalog and documentation
release from published `6a60137`; preserve all backend/database sources,
migrations, dependencies, model configuration and installed units. Require
exact-commit CI and use the existing `npm run deploy:staging` executor with its
local build, preservation, readiness and rollback checks.

## Community classification and publication pause — prepared on 14/10/2026

The owner requested NSFW declarations for newly created communities, immutable
community topics, ranking filters and temporary suspension of automatic analysis.
The application and migration contract is in [community classification](COMMUNITY_CLASSIFICATION.md).

Migration 067 creates an initially empty classification table and adds
`public_moderation.publication_mode`, with `analysis` on every historical record.
It preserves historical verdicts, deadlines, bytes, account data and capacity
balances. New uploads are explicitly published as unreviewed; no model result or
operator verdict is fabricated. All 66 prior migration files remain exact.

The feature-specific VPS request authorizes the additive metadata required by
this feature; routine code-only authorization alone would not cover it. The
existing `npm run deploy:staging` executor has a dedicated internal transition
module, `deploy_community_classification.py`. Bind its exact reviewed application
sources to `ce69394c67450bd7f5515f1a25a133f27f59e83d`, including the collapsed
creation selector. The predecessor is `64c37f325f5bba54388e7e6257b6f407b19ad3d1`.
The guard rejects application source changes outside this binding. Preserve Node, dependencies,
model weights/configuration, installed units and shared services. Verify a
private backup/restore rehearsal, all old rows/checksums/usage, the new empty table,
defaults, constraints, triggers, index and service health. Pause only our web and
workers during maintenance, use the existing rollback and preserve writes after
reopening. Build on the Mac from a clean integrated pushed commit with passing CI.

**Ponto importante:** this is the reviewed 066→067 database transition for the
owner-requested feature and VPS activation, not a general migration override.
Preparation or push does not establish activation.
Access, backups, builds and operational evidence stay exclusively in `.local/`.

## Community and Private Group Repairs — Activation Authorized on 14/10/2026

The owner requested all three fixes on main and VPS activation. After automatic approval review rejected the broad request, the owner asked for an explanation. The explanation identified the five existing code identities plus the corrected sixth, the two database reader files pinned by the executor, unchanged models/rules/schema, and one normal banner retry. The owner then explicitly replied “Ah ta, pode seguir então”, approving these described adjustments. Include `0036e4f` (banner candidate routing), `cb4a95b` (owner-only review image preview) and `e4f9bfa` (private group directory photo/selection), already integrated and pushed on main.

Preserve all five accepted predecessors and add only the current exact pipeline, widening the bound from five to six. The frozen expected identity is `12c1cd1b6b504f1e476da8b58c07f034aaf2addfbd03fa0c2d2f074f6f3cea1f`; verify it after editing. Weights, thresholds, policy, runtime and installed model paths remain unchanged. Only the own private `HASH_TALK_MODERATION_ACCEPTED_NEXT_HASH` and `HASH_TALK_MODERATION_ACCEPTED_PIPELINES` fields may change atomically, with private backup and configuration/service fingerprints. Append active `adfa19fa…` to the retained historical list so the predecessor still starts during transition or code rollback. Keep access, raw configuration, baselines and evidence solely in `.local/`.

Pin the entire database source tree from `28b851b29ff11883511f5992083969534f7f7733` to `e4f9bfa8f35b4636e4ab8dfda720608962868817` in the existing executor, allowing only `public-profile.ts` and `public-moderation.ts` reader changes. All 66 migrations, migration executor, persistence operations and unrelated database sources remain exact. No schema transition or reset is authorized. Require full CI for the final integrated, pushed commit, then use only `npm run deploy:staging`, the Mac build and existing preservation/readiness/rollback checks.

After successful publication, retry only the reported retained failed banner through the normal worker. Match its original review, target, hash, technical-failure status and deadline. Restore one available automatic attempt; preserve creation/expiry and every verdict field. Do not force approval, renew retention or reprocess other records. Verify the resulting automatic outcome and public reference independently.

**Ponto importante:** this approval supersedes the earlier pending-activation notes for this batch. Approval does not establish publication or an allow verdict. Require the published receipt, served hashes and scoped retry result. No shared-service, infrastructure, dependency or model-weight change is included.

## Idle Synchronization Release Authorized on 14/10/2026

The owner explicitly asked to integrate `58886e1` into `main` and activate it on
the VPS. The client separates automatic message checks from interactive busy,
skips healthy idle group retries without eligible pending work, and accepts one
community action waiting behind an automatic read. Session/navigation changes
cancel that waiting action. Preserve all work already integrated in `main`.
Contract and local regression results: [block 07](BLOCO_07_MENSAGENS.md#idle-checks-and-queued-community-creation--14102026).

This is a client, tests and documentation release. Backend/database sources,
migrations, runtime dependencies, Node, detector, units and infrastructure stay
unchanged from the integrated predecessor `c1dffe3`. Use only
`npm run deploy:staging` from clean, pushed `main` with successful exact-commit
CI and a build prepared on the Mac. Keep the executor's preservation, readiness,
public hash/source checks and rollback. Access, baselines, build artifacts and
operational receipts stay exclusively in `.local/`.

**Ponto importante:** a push alone does not establish publication. Require a
`published` receipt and verified served assets; local synthetic regressions do
not identify every possible reconnect in the owner's browser.

## Community Draft Preservation Release Authorized on 14/10/2026

The owner asked to integrate fix `18a3337` into `main` and activate it on the VPS.
The fix preserves the creation form and sidebar nodes during identical rechecks,
while retaining current reads and typing during network I/O. Preserve work already
integrated into main and unrelated worktrees. Contract, evidence and validation:
[block 10A](BLOCO_10A_AUDIO_E_TEMPO_REAL.md#community-creation-and-sidebar--fix-requested-on-14102026).

This release changes only the client, tests and documentation. Backend, migrations,
dependencies, Node, detector, units and infrastructure retain the active release.
Use only `npm run deploy:staging` from clean, integrated, pushed main with passing
exact-commit CI and a build prepared on the Mac. Verify the predecessor, database
sources, preservation, readiness, public hashes and code rollback through the
existing executor. Access, baselines, artifacts and evidence remain in `.local/`.

**Ponto importante:** publication requires a `published` receipt and verified
served assets. Do not attribute connection failures to the app without evidence;
this fix addresses the interface reconstruction demonstrated by the investigation.

## Community Creation Back Arrow Release Authorized on 14/10/2026

The owner asked to publish `claude/community-create-back` on the VPS through
`main`. It fast-forwards `main` from the published `239023c` with a back arrow on
the create community form (full page and panel) and no "⋯" menu while creating.
Frontend only; backend, migrations, dependencies, Node, detector, units and
infrastructure keep the sources of `239023c`. Use only `npm run deploy:staging`
from the clean, pushed `main` with passing exact-commit CI, a locally prepared
build and the existing preservation, readiness and rollback checks. Access,
baselines, artifacts and receipts stay in `.local/`.

**Ponto importante:** the push alone does not confirm activation; require the
receipt and verified public asset hashes.

## Community Creation Images Release Authorized on 14/10/2026

The owner asked to put `claude/community-create-media` on `main` and activate it
on the VPS. It fast-forwards `main` from the published `f71905b` with the split
screen fix for the create button and "⋯", optional banner and photo when creating
a community, and the clearer create form. See
[UI decision](UI_PAINEIS_E_TEMAS.md#fixes-and-create-form--14102026-later-the-same-day).

Frontend release: the server keeps the existing `create` and `presentation`
operations; backend, SQL migrations, dependencies, Node, detector, units and
infrastructure keep the sources of `f71905b`. Use only `npm run deploy:staging`
from the clean, pushed `main` with passing exact-commit CI and a locally prepared
build, with the existing preservation, readiness and rollback checks. Access,
baselines, artifacts and receipts stay in `.local/`.

The first CI run of `b8488c5` failed only in the contacts integration test with
`EADDRINUSE` on its fixed port 45118. The test now listens on an OS-chosen port
with the matching origin, like the other integration tests; it passed locally
against the test database. No application source changed for this fix.

**Ponto importante:** creating a community with images was not exercised with a
real account before release; confirm it after activation. A push alone does not
confirm activation; require the receipt and verified public asset hashes.

## Ping Character and Chinese Line Breaks Release Authorized on 14/10/2026

The owner asked to push `claude/ping-character`, make `main` the integrated
branch and activate `main` on the VPS. The branch fast-forwards `main` from the
published `c7808af` with the Ping character, the communities "⋯" cleanup and
floating create button, and the Chinese line-break rule. See
[UI decision](UI_PAINEIS_E_TEMAS.md#ping-character-and-community-actions--14102026)
and [Chinese line breaks](I18N.md#chinese-line-breaks--14102026).

This is a frontend release: backend, SQL migrations, dependencies, Node,
detector, units and infrastructure keep the sources of `c7808af`. Use only
`npm run deploy:staging` from the clean, pushed `main` with passing exact-commit
CI and a locally prepared build, with the existing preservation, readiness and
rollback checks. Access, baselines, artifacts and receipts stay in `.local/`.

**Ponto importante:** pushing and source synchronization do not confirm
activation; require the receipt, verified public asset hashes and healthy own
services. Signed-in screens were reviewed by code and rules, not one by one in a
real account, and physical-device acceptance stays with the owner.

## Public Profile Invitation and Menu Release Authorized on 14/10/2026

The owner explicitly requested VPS activation of `codex/public-profile-menu-polish`.
Integrate the reviewed application commit `455e4dc` into `main`, preserving the
published `bea1d1b` release and unrelated work. Include the bilingual public-profile
invitation, matching contact actions, mobile menu placement and outside-click/Escape
dismissal. Editors, confirmations, drafts and explicit public-profile creation keep
their existing behavior. See [UI contract](UI_MENUS_E_PERFIL_PUBLICO.md).

Use only `npm run deploy:staging` from the clean, integrated, pushed commit with
passing exact-commit CI and a locally prepared build. Confirm the expected live
predecessor, unchanged database sources and migration checksums, runtime,
dependencies, own configuration and other project before and after activation.
Keep access, baselines, artifacts and operational receipts exclusively in `.local/`.
Reuse the existing preservation, readiness and rollback checks; no new executor,
SQL migration, data reset, shared-service change or recovery-format change is included.

**Ponto importante:** approval and source synchronization do not confirm activation.
Require a published receipt, verified public asset hashes and healthy own services.
Synthetic authenticated-browser tests do not replace physical-device acceptance.

## Wallet Entry and Recovery Language Release Authorized on 14/10/2026

The owner approved a more compact device-code field, integration of
`codex/wallet-entry-polish` into `main` and activation on the VPS. Include the
reviewed wallet marks, responsive entry screens and single-language recovery v3
from `81242f5`. Preserve existing v2 recovery documents and access. The field
starts at 64 px with reduced padding and remains vertically resizable; no other
presentation changes are requested in this final adjustment.

Use only `npm run deploy:staging` from the clean, integrated, pushed commit with
passing exact-commit CI, a locally prepared build, preservation checks and the
existing rollback. Verify the live predecessor, unchanged database sources and
migration checksums, runtime, dependencies, own configuration and other project
before activation. Access, manifests and operational evidence stay in `.local/`.
No SQL migration, data reset, shared-service change or new dependency is included.

**Ponto importante:** deployment approval does not establish publication. Confirm
the final receipt, own service readiness and public asset hashes. Existing v2
documents remain bilingual; physical-wallet acceptance remains separate from
browser emulation and synthetic recovery checks. A code rollback cannot convert
new v3 configurations to v2; preserve new data and restore compatible v3 code
if a rollback is needed after users have created v3 recoveries.

## Complete Test-Data Reset Authorized on 14/10/2026

After the pre-launch signed-document v2 transition, the owner explicitly chose
a fresh start instead of implementing legacy-account recovery. The final scope
includes every test account, wallet-to-account association, session, device,
recovery capsule, private message, group, status, public profile, community, post,
media object and derived queue/cache record. Public content is not retained.
The same wallet addresses may register again as new accounts.

This is a one-time, explicitly invoked data operation, not a code deployment,
an automatic migration or an application endpoint. Rehearse against a disposable
database first. Validate the exact application namespace, migration checksums,
complete table set and storage paths; stop only this app's writers. Preserve
schema, service identity, runtime, source, configuration, certificates and the
other project. Do not use cascading deletion into another schema or restart
shared services. Reset the content-accounting counters explicitly and verify
empty user tables before reopening the app. Retire app-data migration backups
within the reviewed scope after successful validation; keep operational receipts
and access exclusively in `.local/`.

The authorized reset completed with empty user tables and no content files or
managed historical data backups. Disposable-database validation confirmed that
the same wallet receives a new account ID, old sessions are rejected and fixed
bilingual v2 recovery initializes successfully. Transactional reset and backup
restore rehearsals passed before deletion. Migration checksums, schema,
installation identity, configuration fingerprints and the other project's
service state were preserved; own services returned ready. Historical backup
receipts were marked retired, preserving ordinary deployment cleanup checks.
There was no application-code deployment or new SQL migration. These checks do
not replace physical-wallet/device acceptance or erase browser-local copies.

**Ponto importante:** this separate authorization supersedes the earlier
no-data-reset restriction only for this test-data reset. It does not change
normal retention rules or authorize future resets. Wallet software, seeds,
balances and blockchain assets are untouched. Browser-local or exported copies
cannot be erased remotely; this operation does not promise forensic erasure
of underlying storage blocks.

## Inglês e chinês — integração e ativação autorizadas em 13/10/2026

O proprietário pediu revisar os últimos commits, completar as traduções,
integrar `codex/i18n-english-chinese` na `main` e ativar na VPS. Incluir a main
`9f8aed7`, sem perder respostas no feed/discussão, sincronização contínua ou
edições/exclusões de grupos. Completar controles, acessibilidade e erros novos
nos dois idiomas, preservando conteúdo dos usuários e o trabalho não integrado
de outras worktrees. Contrato de idioma e documentos v2 em [Idiomas](I18N.md).

A inspeção somente leitura confirmou predecessora ativa `9f8aed7`, schema 66,
serviços próprios saudáveis e preservação do outro projeto. Não há nova migração
SQL, dependência, Node, alteração de units, configuração do detector ou serviço
compartilhado. Documentos próprios da wallet passam a v2 bilíngue fixo conforme
aprovação anterior; SIWE continua inglês, com explicação traduzida no app.

Exigir commit integrado limpo/enviado e CI integral exata; publicar somente
com `npm run deploy:staging`, build no Mac, preservação, prontidão dos serviços
próprios e retorno de código do executor vigente. Acesso, baselines, artefatos
e recibos permanecem exclusivamente em `.local/`. Conferir recibo final e hashes
HTTPS; autorização ou envio de fontes não comprovam publicação.

**Ponto importante:** não apagar/resetar dados nem converter assinaturas antigas
automaticamente. Os formatos anteriores de teste não têm compatibilidade
garantida, conforme decisão pré-lançamento; rollback de código não converte
cápsulas v2 para v1. Validação física de wallets/aparelhos continua separada.

## Alterações pontuais em chats e grupos — publicação solicitada em 13/10/2026

O proprietário pediu incluir grupos, integrar na main e enviar/ativar na VPS, após a revisão da migração 065. Fontes da aplicação fixadas em `fc76aea996c728fe053618dfd6f313b6f19f90ad` sobre a predecessora `841931120e2315db895e3af91f04d7e24c351172`; incluir 065–066. Chats individuais consultam alterações contínuas por conta; grupos passam a oferecer edição de texto/exclusão de mensagens próprias por autor participante, com vínculo cifrado/assinado e diário por grupo. Contratos nos blocos 07 e 11. Preservar moderação de outra worktree, runtime, dependências, serviços compartilhados e limites vigentes.

O módulo interno `deploy_message_changes.py` integra a transição 064→066 exclusivamente ao executor existente `npm run deploy:staging`; não cria outro comando de publicação. Recusar tabela/coluna existente, fontes/checksums divergentes, mudança de units, dados/ledger modificados ou ausência dos índices/gatilhos/manutenção. A 065 cria diário vazio de metadados individuais. A 066 acrescenta revisão inicialmente zero nos grupos, relação inicialmente nula nos pacotes e diário vazio com gatilhos de pacote/mídia. Não faz backfill, recriptografia nem mudança em mensagens/cifras/provas existentes. Os snapshots comparam todas as tabelas antigas e o ledger, omitindo somente as duas colunas adicionadas; o orçamento explícito de versões passa a 66 nesta transição, mantendo 64 como padrão anterior.

Exigir CI integral do commit integrado exato e checkout limpo/enviado. O executor conserva backup completo/ensaio de restauração, manutenção restrita ao web e três workers próprios, preservação do outro projeto, prontidão e rollback. Após reabrir o escritor, não restaurar backup antigo sobre novas gravações. Não reiniciar PostgreSQL/Nginx compartilhados nem instalar dependências. Guardar acesso, artefatos, inventário e recibos somente em `.local/` e conferir hashes públicos ao concluir.

**Ponto importante:** esta solicitação inclui a publicação da extensão e a revisão específica das duas migrações; autorização e testes locais não confirmam ativação. Clientes antigos podem recusar os novos pacotes de edição de grupo e devem recarregar após a atualização. Suspensão/offline e backups independentes conservam seus limites anteriores.

Validação do executor: 212 testes passaram com Python 3.14, incluindo recusa de colisão, sources divergentes, mudança de units/ledger/checksums, orçamento de versões e falhas antes/depois de reabrir o escritor. O transporte inclui o módulo novo e mantém 256 KiB de fontes do executor; a fixture de fontes sintéticas foi ajustada para caber nesse teto com mais um módulo, preservando o teste de aspas/compactação, limite de argumento e recusa de adulteração. As fontes reais do executor ocupam 173.707 bytes antes da compactação. Nenhum limite operacional foi ampliado.

## Continuidade do chat em segundo plano — ativação autorizada em 13/10/2026

Depois de escolher manter preparação/recebimento e conversa verificada em aba hidden, o proprietário pediu integrar esta branch na main, enviar ao GitHub e à VPS e ativar. Incluir as correções de reuso/progresso e a continuidade com stream atualizado, preservando fechamento em exclusão, suspensão real, perda de conexão, falha e mudança de autorização. Contrato e limites no [bloco 07](BLOCO_07_MENSAGENS.md#continuidade-com-aba-hidden--aprovada-em-13102026).

É uma atualização do cliente com testes/documentação. Backend, SQL/migrações, dependências, Node, detector, serviços e infraestrutura conservam as fontes/configuração da main integrada. Usar somente `npm run deploy:staging`, checkout limpo/integrado/enviado e CI integral do commit exato, build no Mac e controles vigentes de preservação/prontidão/rollback. Acesso, artefatos e recibos permanecem exclusivamente em `.local/`. Sem flags para alteração do proxy, processador de mídia ou migração.

**Ponto importante:** autorização não comprova publicação. Conferir recibo e hashes HTTPS depois da execução. Preparação em hidden não força execução em página congelada ou descartada; validação física Android/iOS continua separada.

## Correção contextual do detector — ativação aprovada em 13/10/2026

O proprietário aprovou explicitamente ativar a [correção de desenhos cotidianos](MODERACAO_DESENHOS_COTIDIANOS.md), fontes d5a6323, identidade integral `adfa19fa323553c4cb172cc4b959db447203ec454815cf5e305c872a9ee7efcd`. O incidente e três desenhos públicos novos passam; 36 pares públicos anteriores mantêm decisões, um acima de 2.048 px permanece excluído. Verificação local completa passou: 634 testes do app, 207 do executor e 51 de moderação, além de análises estáticas/build. A melhoria qualitativa não estabelece taxa populacional de erro.

A mudança de aceite é restrita a dois campos próprios: próximo hash e lista histórica, que inclui explicitamente a predecessora ativa b0c665c56bed28a0630d379a13f90d202322d5a6a924901ca5da2dbeafa89ef0 além dos três aceites anteriores. O novo código aceita esses quatro mais sua própria identidade; o código anterior continua iniciando com sua identidade na lista. Vetores novos vivem na release, sem trocar os quatro artefatos instalados, runtime, dependências, units ou banco. Guardar baseline e conteúdo anterior somente em `.local/`, comparar os demais campos, escrever atomicamente e preparar retorno limitado a esses campos. Nenhuma imagem do incidente entra no pacote distribuído.

Depois de CI integral do commit final, usar somente `npm run deploy:staging` na main limpa/integrada/enviada. Não criar outro executor. Conferir detector carregado, hash exato/aceites, preservação dos serviços do outro projeto, prontidão dos workers e hashes públicos após publicação. O aceite pode mudar antes da troca sem invalidar a predecessora; em falha, conservar escritas novas e retornar somente após verificar qual release está ativa.

**Ponto importante:** autorização e commit não comprovam ativação. Registros antigos retidos não são reanalisados/liberados automaticamente; sua revisão continua separada, sem renovar prazos de retenção.

## Busca, salvos e espaço no ranking — ativação autorizada em 13/10/2026

O proprietário conferiu a prévia e pediu espaço leve entre os filtros e a tabela do ranking, seguido de commit, envio e ativação do conjunto pendente deste chat. Incluir busca de perfis/comunidades públicos, estado confirmado dos bookmarks, ícones selecionados mais brancos sem mudar o fundo e 14 px acima da tabela; integrar com a main preservando a release anterior `c2beaf0`.

A alteração de backend acrescenta somente leitura limitada/em lote da preferência saved da própria conta nas projeções autenticadas. Não muda gravações, tabelas, schema, migrações, ledger, retenção, Node, dependências ou units. A revisão do executor fixa predecessora e fontes exatas dos três módulos de leitura alterados; toda a árvore do banco precisa corresponder à projeção revisada. Nenhum bypass genérico de compatibilidade. A projeção do banco é fixada entre `c2beaf05d3c62826580b752e8b31d94930386a4e` e `877a9f9d80bd08a6dca23e2ad3616c7044f9f1c9`; os commits posteriores acrescentam somente estilo, documentação e essa revisão restrita do executor.

A CI de `6f35702` aprovou as três partes da integração, análise estática e build, mas o teste de inicialização recusou o import novo public-search por não haver essa feature no catálogo de fixtures. A correção acrescenta somente mountPublicSearch ao mock explícito, mantendo a recusa a módulos desconhecidos e os cenários desktop/mobile/wallet. Não modificar código da aplicação ou retirar o teste para publicar.

Publicar por `npm run deploy:staging`, checkout integrado/limpo/enviado, CI integral do commit exato e build no Mac. Preservação, retorno da release anterior e prontidão continuam sob o executor vigente. **Ponto importante:** ativação autorizada não equivale a publicação confirmada; conferir recibo e hashes HTTPS. Acesso, artefatos e evidências exclusivamente em `.local/`.

## Replies, grupos e avatar — ativação solicitada em 13/10/2026

Após conferir a prévia, o proprietário solicitou alteração da foto do grupo pelo avatar e integração/ativação desta branch na main. Incluir modal de reply, lista de comunidades seguidas em Postar, apresentação dos grupos e avatar privado cifrado; preservar as correções já integradas na main. Sem alteração de schema (64 migrações), dependências, Node, moderação, units ou infraestrutura compartilhada.

A primeira CI do commit `ceea7a0` aprovou check e duas partes da integração, mas cancelou a parte 1 após falha no início de `community-posts.test.ts`. A fixture usava porta fixa 45122 e podia conservar o pool aberto após falha de startup. A colisão foi reproduzida em teste local; trocar para porta livre e registrar fechamento antes de migrate/connect/listen permite passar os 11 cenários mesmo com a porta antiga ocupada. O log da CI não conserva a exceção final porque o processo ficou aberto, portanto a colisão remota é hipótese; o defeito local e a ausência de fechamento são confirmados. Não aumentar timeout, remover asserts ou forçar saída na CI.

Publicar apenas commit integrado/enviado com CI integral aprovada, via `npm run deploy:staging`, build no Mac e preservação/rollback existentes. Acesso, artefatos e recibos somente em `.local/`. **Ponto importante:** autorização não comprova ativação; o resultado exige recibo final, prontidão e hashes públicos verificados.

## Menções, atividade e ajustes de UI — ativação autorizada em 13/10/2026

O proprietário aprovou as telas e pediu ajustar identificação de dono/mods,
popup mobile de seguir e prévias dos @, integrar e ativar junto das mudanças
anteriores deste chat. Fontes revisadas `375fca2480334d7790d3a8aef8c04050b5d88ccf` sobre a release
`8ffcbc30f3c8b52f5dc729089362ac6511abfe72`, conferida em leitura na VPS:
62 migrações com checksums exatos, nomes sem colisões, web/três workers saudáveis
e configurações/serviços do outro projeto preservados. A autorização deste lote
inclui especificamente 063–064, antes pendentes; não inclui as alterações de
moderação sem commit de outra worktree.

O módulo interno `deploy_mentions.py` reutiliza exclusivamente
`npm run deploy:staging`. A 063 amplia somente capacidade de referências nos
campos SQL, conservando os limites visíveis, e acrescenta nome normalizado único
às comunidades. Colisões existentes recusam a atualização antes de manutenção;
nunca renomear automaticamente. A 064 cria uma tabela inicialmente vazia de
referências públicas de menção, com deduplicação, exclusão vinculada, índices,
paginação e contabilização de 384 bytes. Não copia texto nem gera avisos
históricos. Nenhuma linha anterior ou ledger deve mudar durante a transição.

A revisão exige predecessora/fontes exatas, ICU já instalado, todas as 62
migrações anteriores intactas, hashes de cada tabela antiga e ledger idêntico,
tabela nova vazia, índices/gatilho e constraints verificadas. Preparar backup
integral e ensaio de restauração; manutenção e retorno somente dos serviços
próprios. Após reabrir escritores, preservar novas gravações em qualquer falha.
Build no Mac, checkout main limpo/enviado, CI integral do commit exato e
preservação/hash/prontidão verificados pelo executor. Node, dependências,
moderação e units permanecem iguais; evidência e acesso só em `.local/`.

**Ponto importante:** autorização, commit e CI não comprovam ativação; conferir
recibo final, arquivos públicos e saúde após o deploy. `communities/index.ts`
e o handler HTTP seguem hotspots existentes: nesta revisão recebem só conexões
com os módulos de apresentação/seguidores. Proposta de corte separado: navegação,
coordenação de telas e adaptadores HTTP por recurso, nessa ordem, mantendo
contratos com testes de autorização/paginação e smoke mobile; fora deste lote.

## Cabeçalho e painel de emoji/GIF — ativação autorizada em 12/10/2026

O proprietário pediu enviar e ativar as mudanças do outro chat. O único commit novo é `273ecdef275395b20fcba1dc8a50f5551b9a8595`, da branch `claude/hero-gifs-lines`, construído sobre a release `23793a750c26d13279b4ae3b3c09a891416ae91c`. Inclui a linha de seguidores sob o nome, o painel compartilhado de emoji/GIF nos editores de posts/replies e separadores mais visíveis. Integração ocorre pela main; alterações antigas não commitadas de outras worktrees permanecem fora.

**Ponto importante:** esta é uma release de frontend; as 62 migrações, backend, moderação, Node, dependências e units permanecem iguais. Usar exclusivamente `npm run deploy:staging` em checkout limpo/enviado, com CI integral do commit final, build no Mac, preservação dos outros serviços e retorno da release anterior. Autorização e envio de fontes não comprovam ativação; conferir recibo, hashes públicos e prontidão dos três workers. A revisão local passou em análise estática, build e 22 testes direcionados. No navegador sintético em 320/390/1280 px: seguidores sem estouro horizontal, emoji no texto, GIF somente no rascunho, recusa sem consulta externa, emojis sem KLIPY e fechamento do painel. A VPS predecessora, o schema e os três workers foram conferidos antes da publicação. A CI revelou colisão da porta fixa 45128 no teste de mídia pública; o listener agora recebe porta livre com origem/Host correspondentes. Os 16 testes reais de mídia passaram com a antiga porta ocupada, sem mudar fontes da aplicação.

## Feed/postagem e discussão — ativação autorizada em 12/10/2026

O proprietário autorizou revisar o feed pendente, integrar este chat na main e enviar as fontes à VPS. A aplicação revisada é `09917b96e3ee1fda67fd89da4a5fe99bd3cbf2e3`, sobre a release publicada `e22b5e3eac26b78af927e424923bf664567f38ff`. Em 12/10/2026, após confirmar que o lote completo de feed/postagem foi integrado, o proprietário aprovou explicitamente a ativação do pacote na VPS, incluindo a transição 061→062. Preservar todas as migrações anteriores, Node, dependências, units e a política de moderação publicada sem julgamento de pose.

O módulo interno `deploy_discussion.py` usa exclusivamente o executor existente (`npm run deploy:staging`). Compara fontes exatas, hashes das linhas antigas e das migrações, relações ancestral/perfil, contadores reconstruídos e ledger esperado (256 bytes por relação nova). A 062 adiciona três colunas, uma tabela e índices/gatilhos; não copia textos nem altera retenção. Antes de ativar, medir volume/capacidade/backfill, exigir CI do commit final, backup integral com ensaio de restauração e manutenção restrita aos serviços próprios; conservar rollback e preservação dos outros serviços.

**Ponto importante:** merge/push e sincronização das fontes não ativam a release nem a migração. A revisão local passou em banco descartável, incluindo recusa de corrupção de dados, contadores, ledger e gatilhos. A autorização específica foi concedida; a confirmação operacional da publicação continua necessária. A CI integral de `75c49fc` passou e a conferência prévia preservou os serviços; este registro muda somente documentação e ainda exige CI integral do commit final antes de ativar.

## Experiência social — transição 058→061 autorizada em 12/10/2026

O proprietário pediu concluir as mudanças na mesma branch, integrar na main e
ativar tudo na VPS. A inspeção somente leitura confirmou a predecessora
`0065abea363920a0ef414f921f56dcd4f281c569`, 58 migrações com checksums exatos,
web e três workers prontos e preservação dos outros serviços/configurações.
As fontes de aplicação revisadas são
`612a6f4c2fc7822cbc0296564563baff1da53ad4`.

O módulo interno `deploy_social_experience.py` reutiliza exclusivamente
`npm run deploy:staging`. A 059 cria compartilhamentos por referência,
inicialmente vazios, com cobrança de 256 bytes por relação e gatilho de uso.
A 060 cria um índice parcial para os follows com sininho ativo, sem gerar
notificações históricas. A 061 acrescenta `read_epoch` inteiro opcional às
confirmações das DMs públicas; todos os registros anteriores continuam nulos.
Nenhuma migração anterior, dependência, Node ou unit muda.

A revisão exige predecessor/fontes exatos e compara todas as linhas anteriores,
checksums e ledger. O snapshot omite somente o novo `read_epoch`; seus valores
históricos devem permanecer nulos. Conferir tabela nova vazia, índices, coluna e
gatilho. Fazer backup integral do banco e objetos, sem os antigos tetos de MiB,
ensaiar restauração e parar somente web e workers próprios durante manutenção.
Antes da reabertura, retorno verificado de banco e release; depois dela,
preservar novas escritas em caso de falha. Usar checkout limpo, commit integrado
e enviado, CI integral do commit exato e evidências exclusivamente em `.local/`.

**Ponto importante:** o proprietário aprovou explicitamente as migrações 059–061
e a ativação. O ensaio real em banco descartável confirmou a preservação e a
rejeição de mudança indevida em linha existente. A CI integral de `8311ad8` passou;
este registro muda somente documentação e ainda exige CI integral do commit
final antes da ativação. O executor recusa fontes diferentes das revisadas.
A autorização não comprova publicação; conferir recibo, hashes e prontidão.

## Conexões da conta do app — correção autorizada em 12/10/2026

Após duas falhas de prontidão na ativação, a investigação encontrou um limite
legado de oito conexões no role do app, apesar dos pools web 16/worker 4 e do
`max_connections` 64 aprovados em 09/10. A inicialização isolada de configuração,
schema e modelo passou na release anterior e candidata; os logs não preservaram
a causa exata das falhas do processo completo. A CI integral de `190f1a1` passou
na `main` e no branch de publicação. A release anterior e os três workers foram
recuperados e verificados antes desta correção.

O proprietário autorizou remover o limite por role com `CONNECTION LIMIT -1` e
concluir a ativação. Alterar somente esse atributo da conta própria, preservando
privilégios, senha, parâmetros, pools e o limite global existente de 64 conexões.
A alteração é dinâmica: não reiniciar PostgreSQL, instalar pacotes ou executar
migração. Registrar comparação antes/depois em `.local/`; retorno restrito é
restaurar o atributo anterior, após conferir que a conta mantém o estado esperado.

Usar novamente `npm run deploy:staging` em commit final limpo, integrado/enviado
e com CI integral aprovada. Conservar o recibo da tentativa anterior e certificar
a recuperação antes da limpeza normal de código. Exigir hashes públicos exatos,
três reservas dos workers e preservação dos serviços/configurações ao concluir.

**Ponto importante:** são conexões simultâneas, não MiB nem tamanho do banco.
A retirada do limite por conta permite aos pools usar a capacidade já configurada;
os controles globais, prazos, durabilidade e retenção permanecem.

## Contexto de respostas e menus — integração de 12/10/2026

O proprietário pediu integrar os últimos commits na `main` e ativar na VPS.
O branch `claude/profile-activity-menus` foi integrado sem conflito; a revisão
`9077d25` também corrige o menu do perfil que saía da tela em 320 px e era
recortado pelo cabeçalho. As mudanças são de frontend; servidor, dependências,
Node, configuração e as 58 migrações permanecem iguais à release `93fb22c`.

A primeira tentativa devolveu a release anterior após falha na prontidão dos
workers. A recuperação posterior confirmou o site, os três workers e as reservas
PostgreSQL, com configurações e processo do banco preservados. Conservar o recibo
original e certificar a recuperação antes de liberar somente os artefatos de
código pelo executor existente. Acesso e diagnóstico ficam em `.local/`.

A CI integral de `9077d25` passou no branch de publicação. A execução da `main`
falhou em fixtures HTTP com `EADDRINUSE`; a credencial existente não permite
reexecutá-la. Esta entrega registra a revisão e exige nova CI integral do commit
final, checkout limpo/enviado e `npm run deploy:staging` para a nova tentativa.

**Ponto importante:** a recuperação da release anterior não confirma publicação
da nova. Conferir recibo, hashes públicos e prontidão dos três workers ao concluir.

## Tetos de backup removidos — decisão de 11/10/2026

O proprietário mandou retirar as travas de 256 MiB para objetos e 64 MiB para
banco, dump e SQL de restauração. Esta decisão substitui a autorização anterior
de ampliar apenas objetos. Não rejeitar backup nem migração por esses tamanhos;
não substituir os números por outro teto fixo.

O executor mede o banco e os objetos para estimar o espaço necessário, além da
reserva existente para as releases. Confere hashes por blocos, sem carregar cada
arquivo completo na memória. A restauração usa SQL integral em arquivo temporário
privado (0600), validado antes de alimentar o `psql`; ensaio termina em ROLLBACK,
retorno autorizado termina em COMMIT. Falha na decodificação não abre a transação.
Os arquivos temporários são removidos ao concluir ou falhar normalmente. Espaço
físico, integridade, isolamento, CI e prazos de execução continuam verificados.

Reutilizar `npm run deploy:staging` para publicar esta correção do executor,
com checkout limpo e commit integrado/enviado. As 58 migrações e o código da
aplicação não mudam; o banco não é migrado novamente por esta publicação.

**Ponto importante:** os antigos valores eram limites do executor, não da
capacidade do PostgreSQL ou do produto. Agora banco e backups podem ultrapassá-los.

## Controles sociais — ativação autorizada em 11/10/2026

O proprietário pediu alinhar este trabalho com o `main`, enviar à VPS e ativar.
A conferência somente leitura encontrou a release `adc6b6e`, 55 migrações e
nenhuma tabela dos novos controles sociais. As migrações desta tarefa, antes
054–056 apenas em bancos descartáveis, passam a 056–058; nenhuma das 55 migrações
já aplicadas muda. Preservar conta modular, configuração inicial, múltiplas tags,
moderação e demais mudanças integradas do `main`.

Reutilizar `npm run deploy:staging`, com checkout limpo/enviado, CI integral,
build no Mac, backup privado e restauração ensaiada. O módulo interno
`deploy_social_controls.py` exige fontes e predecessor exatos. Durante manutenção,
parar somente web e três workers próprios. Conferir todas as linhas anteriores e
checksums; permitir só follows ausentes dos donos, uma revisão de ranking por
follow e 128 bytes no ledger por follow. Campos históricos de ingresso ficam
nulos; banners, badges, leituras e denúncias começam vazios, com os gatilhos de
contabilidade habilitados. Antes da abertura, retorno verificado do banco e da
release; depois de reabrir, preservar novas escritas em caso de falha.

Fontes integradas revisadas: `3646d5460b0fc47d2156d09aaa4b1f8228f44211`,
com predecessora publicada `adc6b6e88b3e06aa905ff3b8e49a6e3237979649`.
O commit seguinte registra essas referências sem mudar fontes de aplicação,
SQL, dependências ou units; a ativação exige CI integral do commit final.

A comparação de fontes usa o limite vigente de 1024 entradas do manifesto;
o helper antigo ainda usava 512 e recusava ler as fontes do `main`. O limite
separado de 512 para backups/objetos/QR continua igual. Não mudar dependências,
Node, units, scanner privado, swap, proxy ou serviços compartilhados.

**Ponto importante:** esta ativação exige breve manutenção. Denúncias apenas
são guardadas, sininho começa desligado e o badge de novo membro dura dois dias.
Este registro de autorização não comprova a publicação; evidências operacionais
e acesso ficam em `.local/`.

A primeira tentativa de `2b6325c` foi recusada no backup, antes da migração: os
objetos existentes ultrapassavam o limite antigo de 64 MiB. A release
`adc6b6e` e as 55 migrações permaneceram; web/workers voltaram a executar, mas a
verificação de leases do retorno expirou, por isso o recibo não declarou rollback
verificado. A inspeção posterior confirmou a preservação da configuração e do
processo PostgreSQL; exigir prontidão dos três workers antes da nova tentativa.

O proprietário autorizou **256 MiB somente para o backup de objetos**. Conferir
todos os hashes e preservar o teto separado de 64 MiB para banco/dump/SQL de
restauração. A reserva prévia de espaço passa a contabilizar os dois backups e
as releases; a retenção de backups de migração usa o mesmo teto de objetos.
Esses valores são travas operacionais de migração, não cotas de armazenamento do
produto nem uma configuração que impeça o PostgreSQL de crescer. O código não
trunca backups ou arquivos para caber.

## Fix de rechecagem integrado à main — ativação autorizada em 11/10/2026

Após a conferência do Git, o proprietário pediu integrar o fix de piscadas à
`main` e ativar na VPS. A integração inclui a migração 055 de tags já preparada;
a autorização anterior de preparar sem publicar passa a permitir esta ativação.
Reutilizar `npm run deploy:staging`, com checkout limpo/enviado, CI integral do
commit exato, build no Mac, backup com restauração ensaiada, preservação e retorno
limitado ao app próprio. A moderação não commitada da outra sessão fica fora.

A conferência prévia confirmou fontes de `9719676`, os checksums das 54 migrações
e prontidão dos três workers. A falha anterior foi recuperada. O executor da 055
conserva esse predecessor e fixa as fontes integradas em `40cd67d7a050c92ea5c38195ed04a4c2be8d7edb`;
nenhum SQL anterior, dependência, Node ou unit foi alterado pelo fix.

**Ponto importante:** a transição 054→055 exige breve manutenção e preservação
das linhas existentes. Esta autorização não comprova publicação concluída nem
aceite físico das piscadas; evidências operacionais ficam em `.local/`.

## Várias tags por post — migração 055 preparada em 11/10/2026

O proprietário pediu título obrigatório e de 1 a 5 tags por post, e pediu para deixar a mudança pronta no Git, sem enviar à VPS. A migração 055 cria `community_post_extra_tags` (vazia, cobrança e gatilho de uso) e afrouxa a regra de conteúdo de `community_posts` para título, texto ou mídia; nenhuma linha existente muda.

O módulo `deploy_post_tags.py` revisa a transição 054→055 no molde das anteriores: fontes fixadas em `91cc993a6ae24a443f5d61247e0e1caada3f95e9` e predecessora fixada em `9719676d1ae2bb6a8ed6c8c11fe06b05706e0dbd` (main integrada com a 054 de grupos). Snapshot integral das tabelas existentes, ledger e checksums; depois confere tabela vazia, gatilho, índice e a nova regra de conteúdo.

**Ponto importante:** a ativação de `9719676` registrada em 11/10/2026 00:55 terminou com "Background workers did not acquire all three leases" e serviço próprio parado para revisão; o site voltou a responder depois. Antes de ativar a 055, confirmar qual release e quantas migrações estão de fato no ar e ajustar `BEFORE` se a predecessora não for `9719676`.

## Integração na main e grupos privados — autorização de 11/10/2026

O proprietário pediu integrar as branches no caminho principal e ativar na VPS.
Todos os commits das branches locais/remotas já pertenciam ao histórico de
`99c7de5`; a integração da `main` é um avanço sem conflitos, preservando as
alterações ainda não commitadas nas outras worktrees. O comando existente de
deploy e a sincronização de fontes aceitam agora `main`, além das branches
`codex/*`, mantendo checkout limpo, commit enviado e CI integral da branch e do
commit exatos. Um push continua sem ativar o site automaticamente.

A ativação inclui a transição 053→054 dos links de grupos. O módulo interno
`deploy_group_links.py` fixa o predecessor publicado
`4486e3aeb5b3742e6ea173fc954b9cff74f36605` e as fontes de aplicação revisadas
`99c7de5ec0fcfa14d019c30b6503b67bcf523d20`. Confere toda a árvore de fontes,
pacotes/Node, as 53 migrações anteriores e os units dos workers. A única tabela
nova é `group_links`, inicialmente vazia, com gatilho habilitado para o contador
de uso. Todas as linhas anteriores, checksums, ledger e objetos devem permanecer
iguais. Não há instalação de dependências ou alteração de serviços compartilhados.

Reutilizar `npm run deploy:staging`: parar os escritores próprios, guardar backup
privado, ensaiar sua restauração, migrar e verificar antes de reabrir o web e os
workers. Falha antes da reabertura permite retorno verificado; depois dela,
preservar as novas escritas e exigir revisão. Evidências ficam em `.local/`.

**Ponto importante:** esta autorização inclui a migração 054 e uma breve
manutenção do app. Publicação só é confirmada após CI e verificações remotas;
este registro de autorização não comprova uma ativação concluída.

## Descrição do perfil — migração 053 autorizada em 10/10/2026

O proprietário autorizou ativar a edição do perfil no lugar e aplicar a migração
053, que cria `public_profile_descriptions` (texto do dono, revisão e cobrança
própria, gatilho de uso). Nenhuma tabela existente muda.

O módulo interno `deploy_profile_description.py` segue o molde do
`deploy_profile_social.py`: predecessor fixado na release publicada
`000308884e86989fb3dbd9326deb2f6608ef5511` (52 migrações, com a moderação por poses publicada pela outra sessão) e fontes de aplicação
fixadas no merge `6a4d8e0702dbadeee596a2131f802a5190ec8e9d`, com comparação integral
das fontes, das 52 migrações já aplicadas, pacotes/Node e units dos workers.
O snapshot compara todas as linhas das tabelas existentes, o ledger de
capacidade e os checksums; depois confere a tabela nova vazia e seu gatilho de
uso. Web e workers próprios param durante o backup/migração e voltam em seguida,
com o mesmo retorno verificado da transição anterior. O deploy roda de uma
worktree limpa, na branch de publicação `codex/publicacao-perfil-moderacao`, que junta
o perfil/descrição e a moderação por poses já publicada (opção escolhida pelo
proprietário), sem tocar na pasta de trabalho nem nas branches das sessões.

**Ponto importante:** o site fica indisponível por alguns segundos durante a
manutenção. Passaram 164 testes do executor, incluindo os da revisão exata, da
preservação e da escolha da transição por número de migrações.

## Página pública individual — publicação autorizada em 10/10/2026

A publicação anterior ativou `8a793e32e2cfaa7cc0b97b1195f30802f389c09d` e conservou
o leitor público antigo. A página individual, follows, banner e composição dos
feeds estavam em alterações locais. A conferência HTTP da preparação encontrou
a rota compacta disponível e `/page`, `/activity` e `/communities` ausentes.
O proprietário autorizou registrar e aplicar as migrações 050–052 no banco
próprio e publicar a página após a CI integral passar, com backup verificado
e pausa temporária do web e dos três workers próprios.

A proposta mantém `npm run deploy:staging`, build no Mac, checkout limpo/enviado
e CI integral do commit final. O módulo interno `deploy_profile_social.py`
recusa a transição enquanto `REVIEWED` não identificar o commit de aplicação
revisto. O predecessor fica fixado em `8a793e3`, com comparação integral das
fontes e das 49 migrações já aplicadas, mesmos pacotes/Node e mesmos units.

Fontes de aplicação fixadas em `8781914293edae254a855c49222b7136d5e3eba4`.
O commit seguinte registra essa referência no executor e esta documentação;
a publicação exige CI integral do commit final integrado.

O banco próprio passa de 49 para 52 migrações. A 050 é preparação de schema do
trabalho paralelo de moderação: acrescenta fase e aviso, com todos os registros
existentes em `before` e aviso nulo. Sua inclusão preserva a numeração/checksums
já usados localmente. As regras de vídeo em desenvolvimento ficam fora desta
release. A 051 acrescenta data do perfil público para futuras criações, follows,
banner e índices; a 052 acrescenta o índice de conversas. Perfis antigos mantêm
data desconhecida, e as duas tabelas novas começam vazias.

Antes de backup/migração, parar o web e os três workers próprios, conferindo
seus PIDs. Usar o backup privado existente, com restauração ensaiada antes da
troca. Comparar todas as linhas antigas, objetos, ledger de capacidade e
checksums; conferir separadamente os defaults, índices e tabelas novas.
Reabrir o web e depois os workers, exigindo saúde, assets exatos, três reservas
PostgreSQL e preservação das configurações/processos registrados. PostgreSQL
e serviços compartilhados continuam rodando; nenhum pacote, unit ou scanner
novo faz parte da proposta.

Falha antes da reabertura permite retorno verificado do banco/release e dos
workers anteriores. Depois da reabertura, conservar as novas escritas, parar
nossos escritores e exigir revisão. A conferência prévia de somente leitura
encontrou 49 migrações, 83 tabelas de dados, workers prontos e backup dentro do
orçamento existente. Evidências e acesso ficam exclusivamente em `.local/`.

Passaram 160 testes do executor, incluindo interrupção parcial dos workers,
retorno anterior à abertura e falha de prontidão dos workers após abrir.
Os testes simulam serviços e backup; a restauração real permanece obrigatória
durante a manutenção autorizada. A aplicação passou 18 testes unitários,
27 integrações em banco exclusivo e as verificações estáticas/build locais.

**Ponto importante:** a autorização específica inclui o SQL de preparação 050
e a transição 049→052. O site fica temporariamente indisponível durante a
manutenção. Banner continua restrito até a análise aceita já exigida pelo
produto. A imagem de prévia usa dados fictícios e não comprova publicação.

## Detector de poses — ativação condicionada em 10/10/2026

O proprietário pediu ativar a integração e autorizou instalar, validar e ativar
o runtime privado revisado somente se passar. A revisão de código fixa a árvore
inteira de banco do predecessor `2ac00f9` e das fontes `5a54ddb`; apenas
`community-media.ts`, `public-moderation.ts` e `vault-quota.ts` diferem.
As 52 migrações, executor de migrações, pacotes npm e Node permanecem iguais.
Não executar migração para esta transição. A integração incorpora também as
alterações concluídas do branch principal antes da publicação.

Usar `npm run deploy:staging`, build no Mac, checkout limpo/enviado e CI integral
do commit final. A autorização separada do runtime cobre somente a área própria,
as versões/pesos fixados e configuração de web/worker público, sem instalação
global. Antes de aceitar o hash, validar execução nativa no isolamento, controles
licenciados existentes, todos os frames dentro do prazo vigente e preservação.
Falha mantém a análise desativada; não ampliar prazo nem alterar política para
obter aprovação. Guardar acesso, manifestos e evidências exclusivamente em
`.local/`, com rollback limitado às adições próprias. O [contrato de integração](INTEGRACAO_MODERACAO_POSES.md)
registra as versões, limites e a retenção observada no controle de IA convertido.

**Ponto importante:** publicar o código não aceita automaticamente o detector.
Vídeos liberados durante a análise podem ser vistos/copiados antes da remoção;
DMs E2EE não entram no scanner.

## Teto do manifesto ampliado — 09/10/2026

O proprietário pediu ampliar o teto de arquivos por release, que impedia o app de crescer (a publicação do redesign precisou juntar arquivos para caber). O executor passa a aceitar até 1024 entradas (`MAX_MANIFEST_FILES` em `deploy_remote.py`), no lugar de 512 mais conjuntos revisados. O teto continua barrando pacotes descontrolados; orçamentos de arquivo, extração e runtime não mudaram.

Na mesma data, o pool de conexões do app subiu de 4 para 16 (web) e de 1 para 4 (cada worker), acompanhando `max_connections` 64. Como o app executa migrações ao iniciar, o executor só aceita código de banco revisado: a primeira ativação foi recusada antes de trocar a release e o par exato `b1aa82c` → `68831a5` (somente `src/server/database/index.ts`) passou a constar das revisões fixadas, sem SQL ou migração.

Em 10/10/2026, a ativação pedida pelo proprietário incluiu a prévia das respostas na Atividade. O par exato `9a3170d` → `0bb7b9d`, que muda só `community-posts.ts` e `community-interactions.ts` (leitura pela projeção pública existente), entrou nas revisões fixadas, sem SQL ou migração. As alterações de moderação não commitadas ficaram fora: o build sai de `git archive` do commit, e o deploy rodou numa worktree limpa do mesmo branch, sem tocar na pasta de trabalho.

A segunda tentativa foi recusada pela conferência dos workers. Ao retirar os tetos, os três arquivos de worker em `/etc/systemd/system` haviam sido substituídos por arquivos comuns, quando deveriam ser links para `background-units/`; além disso, a conferência exige arquivo instalado = release no ar = candidata, o que não fecha quando os units mudam. O proprietário escolheu a opção A: os links foram restaurados com o conteúdo sem tetos, e o executor aceita esta transição única somente se a release no ar ainda tiver o conteúdo exato com tetos de `b1aa82c` (hashes fixados em `deploy_background.py`) e o instalado já for igual ao da candidata. Depois dessa release a conferência normal volta a valer.

**Ponto importante:** a tentativa recusada antes da troca parou os workers e, por desenho, não os religou. Ranking, conteúdo e mídia pública ficaram parados de 06:26 a 16:13 (horário de Brasília) de 09/10/2026, até serem iniciados manualmente; site e chat continuaram respondendo. Uma falha anterior à troca deve ser seguida de conferência e religamento dos workers.

## Agilidade do deploy — correção solicitada em 09/10/2026

O proprietário pediu corrigir a demora recorrente da publicação. Reutilizar o comando existente, mantendo build no Mac, CI integral do commit exato, preservação, orçamento e rollback. Os jobs de check e integração passam a executar em paralelo; todos precisam aprovar o workflow para liberar a ativação. Não remover testes nem alterar runners, dependências, banco ou serviços compartilhados.

O check remoto passa a verificar a capacidade de retenção antes do upload, sem apagar artefatos. No recebimento, o executor pode liberar código temporário de tentativas anteriores explicitamente marcadas como falhas de código com rollback e workers verificados. Manter os 16 recibos compactos mais recentes; Git enviado e builds locais conservam a recuperação das fontes. Tentativas ambíguas, rollback incompleto, dados/backups e a tentativa atual continuam fora dessa limpeza. O limite de três workspaces permanece. Falhas de preparação e falhas durante a recuperação dos workers deixam recibo, sem simular sucesso.

A ativação faz uma única conferência inicial sob o lock próprio, seguida das verificações de preservação já exigidas antes/depois da troca. O comando registra duração e CPU de fases fixas nos logs privados de `.local/`, inclusive em falha. Esses tempos permitem investigar preparo, runtime, prontidão pública e workers sem coletar conteúdo, credenciais ou dados de usuários. Não afirmar redução da ativação real sem medi-la; esta revisão não aumenta recursos da VPS.

O código dos módulos do executor viaja compactado no argumento do SSH, depois da conferência de cada hash no manifesto; configuração e acesso permanecem separados. Validar restauração integral e limitar o comando a 64 KiB antes de conectar. Essa correção evita o limite de argumento do shell encontrado no primeiro check da revisão, sem outro script, dependência ou arquivo executável na VPS.

**Ponto importante:** a limpeza automática atinge somente artefatos temporários de código cuja recuperação foi confirmada. Não remove histórico, objetos aceitos ou backups do banco, nem permite ativação com CI reprovada.

## Correção de latência do chat — ativação autorizada em 09/10/2026

O proprietário pediu envio e ativação do fix de latência medido, com fontes iniciais em `f5f10ce`. Usar `npm run deploy:staging` em checkout limpo/enviado e CI integral do commit final, com build no Mac, preservação, limites e rollback do executor existente. As alterações pessoais no checkout original ficam fora da release.

A primeira CI aprovou os 410 testes da aplicação e recusou o manifesto de publicação por uma entrada além do teto vigente. A janela verificada passa a residir no módulo existente do índice de mensagens, mantendo comportamento, contratos e limites; não ampliar o executor nem criar outro script de deploy. Banco, migrações, dependências, Node, infraestrutura e sessões de 160 dias permanecem iguais ao predecessor `506c187`. Ativar somente os serviços próprios conforme a publicação vigente dos workers. Acesso e evidências operacionais exclusivamente em `.local/`.

A CI integral de `574d678` passou. A primeira ativação restaurou a release anterior após uma falha de conexão na consulta de prontidão dos workers; a conferência posterior confirmou fontes anteriores, saúde, configurações e processo do banco preservados, com a mesma consulta aprovada dentro e fora do sandbox. A causa da falha de conexão não foi estabelecida. O executor existente passa a repetir somente saída 2 do `psql` dentro dos mesmos 30 segundos já previstos para adquirir as três reservas. [Esse código indica falha de conexão](https://www.postgresql.org/docs/16/app-psql.html#APP-PSQL-EXIT-STATUS); outros erros propagam imediatamente e falha persistente impede a publicação. Não alterar serviços, limites, credenciais, consultas ou schema. Exigir regressões e nova CI integral antes de uma nova ativação em workspace separado; preservar a tentativa anterior para diagnóstico.

**Ponto importante:** os ganhos do fix foram medidos no laboratório local. Publicação e hash conferidos no site não substituem a medição física de envio nos aparelhos do proprietário.

## Sessões de 160 dias — autorização de 08/10/2026

O proprietário escolheu 160 dias para novas sessões e pediu envio e ativação
na VPS. O [contrato de duração](BLOCO_03_CONTA_E_PERFIL.md#duração-da-sessão--08102026)
vale para login direto, confirmação mobile e vinculação. Ajustes nos timers
do navegador e do SSE preservam o prazo completo, inclusive além de 24,8 dias.
Sessões antigas conservam a validade emitida; não executar migração ou renovação.

Usar `npm run deploy:staging` em checkout limpo do commit enviado, com CI
integral exata e build preparado no Mac. Banco, migrações, dependências, Node,
executor e infraestrutura permanecem iguais ao predecessor. O executor mantém
os checks de preservação, limites, rollback e reinício dos serviços próprios
conforme a entrega vigente dos workers. Preservar os serviços compartilhados e
as alterações pessoais no checkout original; acesso, artefatos e evidências
operacionais ficam exclusivamente em `.local/`.

**Ponto importante:** o prazo normal passa a 160 dias apenas para novas sessões
emitidas pela release atualizada. Logout, revogação, substituição da sessão,
perda de cookie e eventos já observados da wallet continuam podendo encerrar
o acesso antes. A publicação não estabelece um teste físico de 160 dias.

## Conversa visível e exclusão prioritária — 08/10/2026

Continuação do fix de chat que o proprietário pediu corrigir, enviar e ativar.
Fontes `2607192`, com predecessor ativo `0c5b629`: conservar a visão verificada
durante atualizações normais, fechar ao receber exclusão/autorização e impedir
que o controle entre abas cancele a própria exclusão por aviso duplicado.
O [contrato atual](BLOCO_10A_AUDIO_E_TEMPO_REAL.md#conversa-visível-e-aviso-prioritário-de-exclusão--08102026)
preserva confirmação de snapshot e falha fechada.

O executor existente fixa a árvore inteira de banco desses dois commits;
somente `backups.ts`, `changes.ts`, `contacts.ts` e `messages.ts` diferem, com
marcador transitório publicado após COMMIT. SQL, migrações, executor de migrações,
dependências, Node e infraestrutura permanecem idênticos. Essa revisão permite
a troca de código, sem caminho de migração. Exigir checkout limpo/enviado,
CI integral do commit final, preservação, limites e rollback; reiniciar somente
`0xdmme-test.service` por `npm run deploy:staging`. Evidências em `.local/`.

## Continuidade do login mobile — ativação autorizada em 07/10/2026

O reteste físico posterior à release `91a82e8` mostrou perda do pedido e falhas
de abertura no iPhone. A correção de continuidade conserva o pedido público no
IndexedDB, preserva pedidos novos diante de ACK recusado/tardio, usa doc-3 também
para Backpack Android e handlers nativos MetaMask/Phantom no iPhone. Mantém
autenticação, criptografia, banco, dependências e infraestrutura. A autorização
de concluir o fix e ativar na VPS continua aplicável; reutilizar o mesmo comando,
CI exata, preservação e rollback. Publicação e teste físico permanecem distintos.

A validação da continuidade passou nas regressões de retorno com metadados de
aba ausentes, ACK 409 de sessão antiga, substituição concorrente de pedido,
cancelamento com falha de armazenamento e confirmação visível com sessão já
existente. Os contratos sintéticos EVM/Solana das três wallets passaram, assim
como a integração de conta, os 105 testes do executor e as verificações locais.
Na CI de `df905fb`, o check e duas integrações passaram; a terceira excedeu o
prazo instalando FFmpeg no runner, antes dos testes. A API recusou repetir esse
job com o acesso existente. Registrar esta entrega dispara nova CI integral;
a ativação continua exigindo sucesso do commit exato, sem exceção ao gate.

A CI de entrega `8ce8c8f` passou no check e nas integrações 1/3, mas a instalação
da integração 2 voltou a exceder o prazo. O log confirmou downloads de pacotes
presos no mirror Azure, depois de atualizar o índice. Somente o runner passa a
preferir os dois fallbacks oficiais Ubuntu já presentes na
[configuração da imagem](https://github.com/actions/runner-images/blob/main/images/ubuntu/scripts/build/configure-apt-sources.sh),
com uma repetição, timeout de conexão/dados de 15 segundos e limite de três
minutos para instalar o mesmo FFmpeg. A validação APT e a suíte integral
permanecem; não há instalação nem troca de runtime na VPS.

**Resultado da continuidade:** release `543a34e` ativa pelo executor oficial,
após [CI integral do commit exato aprovada](https://github.com/karma352431231-ship-it/0xDMme/actions/runs/37695596097).
O pacote de 8.443.831 bytes foi preparado no Mac. O executor confirmou build
público, preservação e rollback retido, sem reiniciar serviços compartilhados.
A conferência HTTPS independente confirmou prontidão e hashes do HTML normal,
HTML de atualização, JavaScript e Worker. A comparação antes/depois confirmou
43 migrações, 77 tabelas e cinco objetos preservados, com snapshots de banco,
configurações, PostgreSQL e processos/invocações da galeria idênticos. Não houve
migração, instalação ou mudança de infraestrutura. O aceite físico mobile
permanece pendente; evidências operacionais ficam exclusivamente em `.local/`.

O proprietário autorizou aplicar a correção, enviar e ativar na VPS, incluindo
continuidade após compactações até concluir. Login público e prova privada de
abertura são recolhidos na mesma visita à wallet; o navegador original confirma
o endereço e autoriza suas chaves sem segunda navegação automática. O contrato
criptográfico e seus limites estão no [bloco 04](BLOCO_04_DISPOSITIVOS_E_RECUPERACAO.md#continuidade-do-login-mobile--correção-solicitada-em-07102026).

Reutilizar `npm run deploy:staging`, build no Mac, checkout limpo/enviado e CI
integral do commit exato. A única alteração em `src/server/database` é código
de `authentication.ts`: preparar UUID sem gravar conta, reutilizar a identidade
existente e exigir o mesmo identificador na transação original de confirmação.
O lock por wallet e a recusa de concorrência conflitante permanecem. SQL,
executor de migrações, dependências, Node e infraestrutura permanecem iguais.
Fixar ambos os lados dessa revisão no executor existente; a revisão não permite
outra mudança de banco nem executa a transição histórica 027→043.

A revisão fixa a árvore inteira de banco de `f8ac068` para `6f8f2ab`,
aceitando somente a alteração exata em `authentication.ts`. Todos os demais
arquivos precisam coincidir com esses commits, incluindo SQL e executor.

Conferir preservação e saúde antes/depois, manter recursos e retorno limitado à
release própria, reiniciar somente `0xdmme-test.service`. Preservar a galeria e
seu timer sem reinício. As alterações anteriores do proprietário em AGENTS.md
e no roteiro manual ficam fora do commit; acesso e provas ficam em `.local/`.

**Resultado da primeira publicação:** release `91a82e8` ativa pelo executor oficial, com
[CI integral aprovada](https://github.com/karma352431231-ship-it/0xDMme/actions/runs/37611372387).
Fontes da correção em `6f8f2ab`; revisão restrita da publicação em `91a82e8`.
Build de 8.442.439 bytes preparado no Mac. O executor confirmou build público,
preservação, release anterior retida e nenhum serviço compartilhado reiniciado.
A auditoria independente confirmou 43 migrações, 77 tabelas e snapshots de
banco/objetos idênticos, configurações e processo do PostgreSQL preservados.
Galeria e timer conservaram seus processos e invocações. HTTPS confirmou
prontidão e hashes exatos do HTML normal/atualização, JavaScript e Worker.

Lint, tipos, limites de dependências, licenças, formato e builds passaram;
regressões de assinatura/retomada e integração PostgreSQL/HTTP passaram.
Os 105 testes do executor passaram; a CI executou a suíte completa e as três
partes da integração. A primeira preparação parou antes de ativar porque o
checkout isolado selecionava Python 3.9 do macOS; repetir com Python 3.14 já
instalado e Node 24.14 aprovado resolveu, sem instalar runtime ou mudar a VPS.
Acesso, baselines, artefatos, recibos e comparação ficam em `.local/`.

**Ponto importante:** a correção está publicada. Os testes com contas/providers
sintéticos não certificam o retorno entre apps físicos. Sessões antigas ainda
sem chaves oferecem **Concluir entrada na conta** no fluxo combinado. A entrada
`/?atualizar=1` entrega o código atual sem apagar o armazenamento local.

## Revisão visual de comunidades — solicitada em 07/10/2026

A atualização da UI reutiliza `npm run deploy:staging`, com build no Mac,
checkout limpo/enviado, CI integral do commit exato, preservação e retorno
da release própria. Dependências, Node, SQL, executor de migrações e serviços
compartilhados permanecem iguais. A galeria de calibração é independente;
conferir os processos e IDs/hashes dos casos antes/depois sem reiniciá-la.

O executor anterior tratava toda alteração em `src/server/database` como
transição de schema. A revisão estreita de código permite somente a árvore
exata de banco de `194bbd2` para `18523ca`: apenas `communities.ts` e
`community-discovery.ts` mudam, para projetar fotos públicas aprovadas em lote.
Os hashes de todos os demais arquivos, incluindo SQL e executor, precisam
coincidir com ambos os commits fixados. Qualquer outro conjunto ou fonte
continua sujeito à revisão de migração existente; esta exceção não autoriza
novos schemas nem dependências. A ativação usa a troca comum de código com
retorno, sem executar a transição histórica 027→043.

**Ponto importante:** fotos e mídia ainda pendentes não são liberadas pela UI.
O detector aceito e a calibração mantêm o estado já documentado.

**Resultado:** release `f8ac068` ativa pelo executor oficial, com
[CI integral aprovada](https://github.com/karma352431231-ship-it/0xDMme/actions/runs/37596095715).
A UI está em `18523ca`; o segundo commit fixa a revisão restrita da publicação.
Os 102 testes locais do executor passaram. O recibo confirmou build público,
preservação, release anterior retida e nenhum serviço compartilhado reiniciado.
A conferência HTTPS em navegador isolado confirmou os hashes do CSS/JavaScript
do manifesto e a UI em 1280/390 px, sem erros de página ou rolagem horizontal.
Galeria e timer conservaram processos e invocações; os 17 casos conservaram
IDs, hashes de imagem e referências. Acesso, screenshots e recibos ficam
exclusivamente em `.local/`.

## Ativação dos fluxos de comunidades — solicitada em 07/10/2026

Depois de informado de que os novos commits ainda não estavam ativos e de que
a atualização exigia revisão/aprovação das migrações, o proprietário pediu
explicitamente ativar os demais fluxos enquanto a calibração continua.
Reutilizar `npm run deploy:staging`, com revisão exata do predecessor `44af35f`
e das fontes de aplicação de `04b1bbf`. Dependências npm, Node, Nginx e
serviços compartilhados permanecem iguais; o runtime e o socket públicos
tiveram autorização adicional específica descrita ao final deste documento.

A conferência somente leitura confirmou schema 001–027, 50 tabelas de dados
preexistentes, mais o registro de migrações, preservação e saúde. Nenhuma tabela
de identidade/comunidades/DMs públicas existe no predecessor. A transição
027→043 acrescenta 26 tabelas inicialmente vazias; as migrações posteriores
alteram essas tabelas novas e ampliam somente a constraint de tipos de remoção
pessoal. Não há uploads públicos legados para coletar. Conservar checksums
001–027, comparar integralmente as 50 tabelas anteriores e os objetos, exigir
001–043, conjunto exato de tabelas, novas tabelas vazias e contabilidade integral
antes de reabrir o escritor. A leitura limitada do registro passa a 64 versões
para conferir todas as 43, sem aceitar uma comparação truncada.

Usar backup privado de banco/objetos, até 64 MiB cada, ensaio de restauração
transacional revertido e release anterior retida. Antes da abertura, falha
admite retorno verificado; depois da abertura, preservar novas gravações e
parar somente o app em caso de falha, sem restaurar banco antigo sobre elas.
Manter recursos e prazo de 240 segundos do executor, build no Mac, checkout
limpo/enviado e CI integral do commit exato. A galeria de calibração tem processo
independente: conferir seu estado antes/depois sem reiniciá-la ou apagar casos.
Acesso, fingerprints, inventário e evidências ficam exclusivamente em `.local/`.

A conferência real após preparar o artefato revelou `Query read timeout` com o
prazo de cinco segundos do cliente; a leitura isolada passava. O snapshot passa
a usar cancelamento de consulta no banco em 12 segundos e prazo do cliente em
15 segundos, com margem para receber o cancelamento. A execução completa dessa
leitura permanece limitada a 30 segundos e o executor a 240; CPU, memória,
limites de linhas/bytes, schema, hashes, contabilidade e requisitos de backup e
retorno permanecem os mesmos. A reprodução usa preparação real e transação
somente leitura, sem ativação ou migração.

**Ponto importante:** esta ativação permite testar identidade pública,
comunidades, posts/replies em texto, votos, feeds, gestão e DMs E2EE pelo `@`.
Não aceita o detector experimental: inventário aceito vazio e `runner: null`
permanecem. O processador isolado foi autorizado para habilitar envio/preparação;
avatares/fotos e mídia pública continuam aguardando análise aceita. Sua instalação
é uma etapa operacional própria, sem relaxar a política de conteúdo.

**Resultado:** release `194bbd2` publicada pelo mesmo comando, com
[CI integral do commit exato aprovada](https://github.com/karma352431231-ship-it/0xDMme/actions/runs/37584837010).
Build preparado no Mac; somente o web próprio foi parado/reaberto na transição.
O recibo confirmou publicação, migrações, build público, preservação e backup
privado retido. A auditoria independente confirmou 43 migrações e 77 tabelas,
checksums 001–027 e as 50 tabelas anteriores idênticos, objeto existente e
processo do banco preservados. Serviços/configurações compartilhados não
mudaram. Galeria e timer mantêm seus processos; os 17 casos conservaram IDs e
hashes de imagem. O detector aceito continua ausente.

O worker próprio passou no handshake, execução dos binários e conferência do
namespace/limites efetivos; a proteção de execução do volume permanece. O
ensaio real aprovou uma foto, quatro vídeos de 60 s/1080p/60 FPS e três GIFs de
20 s/20 FPS, com hashes, miniaturas e contrato do resultado conferidos. Todos
os arquivos sintéticos desse ensaio foram removidos, incluindo dois arquivos
identificados da tentativa anterior. O executor passou em 73 testes locais;
a reprodução pós-preparação validou a correção dos prazos. Recibos, backups,
fontes das tentativas interrompidas e provas operacionais ficam em `.local/`
ou na área privada própria, sem apagar dados de usuários.

## Preparação do corte 10 — solicitada em 06/10/2026

O proprietário solicitou consolidar os commits, enviar ao Git e ativar o site
para testar artes permitidas/proibidas pelo navegador. A base local do corte 10
tem fila, retenção, contestação, ferramenta restrita, executor de todos os frames
e leitura pública implementados. A verificação consolidada passou com 334 testes
da aplicação e 91 do executor; integração de mídia passou com 11 testes. Fontes
podem ser consolidadas e enviadas conservando a identidade Karma e as alterações
anteriores do proprietário fora do commit.

A análise automática real permanece desativada: `runner: null` e inventário de
modelos aceitos vazio. As decisões usadas nos testes são sintéticas. Publicar
essa base permite testar envio/fila/avisos, mas não comparar classificação de
artes com a política. O [estado e aceite do detector](MODERACAO_AUTOMATICA_COMUNIDADES.md)
continuam pendentes; envio de fontes não os resolve.

Na preparação inicial, o executor recusava a transição para as 43 migrações
locais sem revisão fixada própria. A revisão solicitada posteriormente está na
seção de ativação acima; não liberar sua verificação nem contornar `npm run deploy:staging`.
Migrações de moderação também agendam coleta de uploads legados ainda não
aprovados, sem data/hashes verificáveis. A ativação exige conferir predecessor,
efeitos sobre dados, backup/retorno, runtime e preservação antes de obter aprovação
da transição concreta. Nenhuma migração, instalação ou reinício está implícito
na sincronização das fontes; acesso e provas operacionais ficam em `.local/`.

**Ponto importante:** o corte 10 permanece em andamento. Código enviado ao Git
não significa detector ativo nem nova release ativada na VPS.

## Ativação da correção mobile — autorizada em 05/10/2026

Após a entrega local, o proprietário pediu explicitamente ativar `793bf21` na
VPS. Executado `npm run deploy:staging` na cópia limpa e enviada, com
[CI integral do commit exato aprovada](https://github.com/karma352431231-ship-it/0xDMme/actions/runs/37287239483).
Build preparado no Mac; somente `0xdmme-test.service` reiniciado. Banco,
migrações, dependências, Node, Nginx e infraestrutura permanecem iguais.
As alterações anteriores do proprietário foram preservadas fora do commit.

**Resultado:** release `793bf21` publicada sobre `e0cb062`. Manifesto ativo,
38 assets públicos, preservação e retenção da release anterior verificados.
A conferência independente confirmou 25 migrações, 48 tabelas, checksums,
contabilidade e saúde consistentes; configurações próprias, processo do banco
e backups históricos preservados. Nenhum serviço compartilhado foi reiniciado.
HTTPS confirmou prontidão e hashes exatos do HTML normal, entrada de atualização,
JavaScript e Worker. Pacote de 8.293.054 bytes, dentro de 16 MiB. Acesso,
baselines e evidências operacionais permanecem exclusivamente em `.local/`.

**Ponto importante:** a correção está publicada no ambiente de testes; o
reteste físico MetaMask/Chrome continua pendente. Preserva as chaves locais e
protege operações válidas. Navegadores precisam receber o novo código e ativar
explicitamente o Worker; um Worker antigo pode exigir a entrada fixa
`/?atualizar=1`, sem apagar o armazenamento.

## Ativação de filtros e menus por contato — autorizada em 05/10/2026

Após a entrega local, o proprietário pediu explicitamente ativar `e0cb062` na
VPS. Reutilizar `npm run deploy:staging` na cópia limpa e enviada, com
[CI integral do commit exato aprovada](https://github.com/karma352431231-ship-it/0xDMme/actions/runs/37279726940).
Preparar o build no Mac, conferir preservação e assets públicos, reiniciar
somente `0xdmme-test.service` e reter a release anterior para retorno.
Banco, migrações, dependências, Node, Nginx e infraestrutura não mudam.
As alterações anteriores do proprietário permanecem fora dos commits.
Acesso, baselines e evidências operacionais ficam exclusivamente em `.local/`.

**Ponto importante:** esta autorização publica os filtros, menus e agenda
simplificada no ambiente de testes. Remover contato preserva mensagens e
consentimento; o aceite do toque prolongado em aparelhos físicos permanece
pendente.

**Resultado:** release `e0cb062` publicada pelo executor existente, com CI
exata aprovada. Manifesto ativo, 38 assets públicos e HTML público dos filtros
conferidos; HTTPS confirmou prontidão. A verificação independente confirmou
25 migrações, 48 tabelas, checksums e contabilidade consistentes, configurações
e serviço de banco preservados, backups e release anterior retidos.
Nenhum serviço compartilhado foi reiniciado. Pacote de 8.344.195 bytes,
dentro de 16 MiB. Acesso e evidências permanecem exclusivamente em `.local/`.

## Ativação da interface de chat responsiva — autorizada em 05/10/2026

Após a entrega local, o proprietário pediu ativar a interface de `685b9d1`.
Usar `npm run deploy:staging` numa cópia limpa e enviada, com
[CI integral do commit exato aprovada](https://github.com/karma352431231-ship-it/0xDMme/actions/runs/37269326144).
Build no Mac; banco, dependências, Node, Nginx e infraestrutura permanecem
inalterados. Conferir manifesto, assets públicos e preservação antes/depois,
reiniciando somente o serviço web próprio e retendo a release anterior.
As alterações anteriores do proprietário permanecem fora do commit; acesso e
evidências operacionais ficam exclusivamente em `.local/`.

**Ponto importante:** esta autorização cobre a publicação do novo visual no
ambiente de testes. Não substitui o aceite da interface em aparelhos físicos.

**Resultado:** release `685b9d1` publicada pelo executor existente. Manifesto
ativo e 38 assets públicos verificados; HTTPS público confirmou prontidão e
HTML do commit exato. Banco permaneceu com 25 migrações e 48 tabelas, checksums
e contabilidade consistentes. Configurações, processos e respostas passaram
nas comparações de preservação; nenhum serviço compartilhado foi reiniciado.
Release anterior e backups históricos ficaram retidos e conferidos. Pacote de
8.333.792 bytes, dentro de 16 MiB. Acesso e evidências permanecem em `.local/`.
O resultado detalhado consta em [interface de chat responsiva](INTERFACE_CHAT_RESPONSIVA.md).

## Preparação do bloco 12A — 05/10/2026

O proprietário pediu enviar o corte local de organizações/representantes à VPS.
As fontes de aplicação revisadas estão em `c70eeed`; a auditoria somente leitura
confirmou o predecessor ativo `2772aba`, 24 migrações e 45 tabelas existentes,
saúde própria e preservação. Acesso, digests e recibos permanecem em `.local/`.
As alterações anteriores do proprietário em AGENTS.md e no roteiro de
simplificação ficam fora dos commits e são preservadas no checkout original.

Proposta pronta no executor existente `npm run deploy:staging`: transição exata
024→025, fontes de aplicação idênticas às revisadas, lockfile/Node/runtime
inalterados e somente três tabelas novas (`organizations`,
`representative_credentials`, `organization_domains`), índices/constraints e
contabilidade. Não alterar 001–024 nem projetar/excluir campos dos digests das
45 tabelas anteriores. Conferir 001–025, tabelas novas vazias e soma integral de
bytes antes de abrir. O fluxo continua sujeito à CI integral do commit exato,
árvore limpa, limites e comparações de preservação.

Reutilizar backup privado de banco/objetos de até 64 MiB cada e ensaio de
restauração em transação revertida, parando somente o escritor próprio. Antes
da abertura, falha permite retorno verificado; após abrir, preservar novas
gravações e parar somente o app, sem restaurar automaticamente dados antigos.
Não alterar dependências, runtime, Nginx, rede ou serviços compartilhados.
Conservar teto de 240 segundos, recursos, backup e release anterior.

Os 86 testes locais do executor passaram, incluindo recusa de fontes,
predecessor ou migrações divergentes, preservação/contabilidade, retenção de
backup e falhas antes/depois da abertura. Nenhuma ativação real foi executada
por esses testes.

Após o envio das fontes `0891b4b`, sua CI integral e o pré-flight aprovados, o
proprietário autorizou explicitamente aplicar a migração 025 e ativar o corte
em 05/10/2026. Registrar a aprovação antes de executar `npm run deploy:staging`
em checkout limpo, com CI do commit exato e a revisão restrita acima. Essa
aprovação não amplia a transição para outras migrações ou infraestrutura.

**Ponto importante:** envio de fontes não ativa a release. A transição 024→025
está autorizada somente no ambiente de testes, com backup, preservação e retorno
verificados. Retorno móvel das novas assinaturas e aceitação física/DNS real
continuam pendentes.

**Resultado:** release `ed82a54` publicada em 05/10/2026 pelo executor existente,
com [CI integral do commit exato aprovada](https://github.com/karma352431231-ship-it/0xDMme/actions/runs/37262394128).
Migração 025 aplicada com checksums 001–025, preservação das 45 tabelas anteriores,
três tabelas novas inicialmente vazias e contabilidade verificados antes da
abertura. Backup privado, ensaio de restauração e release anterior ficaram
retidos. A conferência posterior confirmou manifesto ativo, 25 migrações,
48 tabelas, contabilidade consistente, 38 assets públicos e saúde HTTPS pronta.
Pacote de 8.323.314 bytes, dentro de 16 MiB. Configurações, processos e respostas
passaram nas comparações de preservação; nenhum serviço compartilhado foi
reiniciado. Elegibilidade sintética de grupos permanece desligada. Acesso,
backups e evidências operacionais ficam exclusivamente em `.local/` e na área
privada própria da VPS. A publicação não substitui os testes físicos pendentes.

## Transição do bloco 11 — autorizada em 04/10/2026

Após a entrega local e a CI de `aab78ef`, o proprietário pediu enviar e ativar
as mudanças na VPS. Reutilizar `npm run deploy:staging`, com revisão restrita ao
predecessor ativo `f7b48bb`, às fontes de aplicação de `aab78ef`, às migrações
001–019 intactas e às novas 020–024. Não alterar runtime, dependências, Node,
Nginx, rede ou serviços compartilhados. A consulta inicial confirmou o
predecessor, as 19 migrações e a preservação; evidências permanecem em `.local/`.

As novas migrações acrescentam 16 tabelas de grupos/status, índices, constraints
e contabilidade. Alterações de colunas alcançam somente as tabelas novas. Não
alteram mensagens, contas, sessões, confirmações de wallet ou chaves existentes.
Conferir checksums 001–024, digests integrais das 29 tabelas preexistentes,
tabelas novas vazias e contabilidade de bytes efetivos antes de reabrir.

Com somente o writer próprio parado, reutilizar backup privado de banco e
objetos, cada um limitado a 64 MiB, parsing integral e ensaio de restauração em
transação revertida. Preservar o contrato de retorno: antes de abrir, verificar
restauração do schema/release próprios; após abrir, conservar novas gravações e
parar somente o app em caso de falha, sem restaurar automaticamente dados antigos.
Conservar recursos, orçamento de disco/transferência, backups e release anterior.
O executor continua limitado a 240 segundos e reinicia somente o serviço próprio.

As alterações locais de AGENTS.md e do roteiro de simplificação são anteriores
a esta publicação e ficam preservadas fora do commit. Executar o comando numa
cópia limpa do commit enviado e aprovado pela CI, com acesso/baseline/artifacts
privados em `.local/`; não liberar a verificação de árvore limpa no executor.

A primeira CI de publicação passou em `npm run check`, mas excedeu os dez minutos
durante a integração completa. A CI executa os checks primeiro e distribui o
mesmo glob de testes de integração em três shards nativos do Node, cada um com
PostgreSQL próprio, execução serial interna e dez minutos de limite. Todos os
shards precisam passar; a ativação continua exigindo sucesso integral do
workflow do commit exato. Cada job gera seu próprio build para o teste que inicia
o servidor completo, pois os arquivos do job de checks não são compartilhados.
Não excluir testes nem elevar limites do executor.
O repositório é público e conserva runners Ubuntu padrão, cujo uso é gratuito
conforme a [documentação do GitHub](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

**Ponto importante:** a autorização permite a transição de banco do Bloco 11
no ambiente de testes. O token ainda não existe; criação e aceite de propriedade
públicos continuam indisponíveis, sem ativar elegibilidade sintética na VPS.
Ensaios físicos e aceite para conversas reais continuam pendentes.

**Resultado:** release `2772aba` enviada e ativada em 04/10/2026 pelo comando
existente, após [CI integral do commit exato aprovada](https://github.com/karma352431231-ship-it/0xDMme/actions/runs/37248117062).
Migrações 020–024 aplicadas com checksums 001–024, preservação integral das
29 tabelas anteriores, estado inicial das 16 novas tabelas e contabilidade
verificados. Backup privado e ensaio de restauração passaram antes da abertura;
backup e release anterior ficaram retidos. A conferência posterior confirmou
manifesto ativo, 45 tabelas, 38 assets públicos e saúde HTTPS pronta. Pacote de
8.304.411 bytes, dentro de 16 MiB. Os 81 testes do executor passaram.

A primeira tentativa parou na preparação local porque a cópia limpa selecionou
Python 3.9; a execução com Node 24 e Python 3.14 já instalados no Mac concluiu.
Nenhuma instalação ou alteração de runtime foi feita na VPS. Somente o serviço
próprio foi parado/iniciado; configurações, PostgreSQL e serviços compartilhados
permaneceram iguais nas conferências. Acesso, baselines, backups e provas ficam
privados em `.local/` e no armazenamento próprio da VPS. Elegibilidade sintética
permanece desligada; criação e aceite de propriedade públicos aguardam o token.

## Transição da experiência simplificada — autorizada em 04/10/2026

Após informar a migração 019 pendente, o proprietário autorizou concluir a
validação, commitar e atualizar o site. Usar `npm run deploy:staging`, com
exceção no executor existente restrita ao predecessor ativo `9ed5988`, às
fontes revisadas em `3520812`, às migrações 001–018 intactas e à nova
`019-linked-sessions.sql`. Runtime, dependências, Node, Nginx e serviços
compartilhados não mudam. A correção publicada da URL padrão está integrada.

A migração acrescenta a confirmação de wallet por sessão. Sessões anteriores
foram emitidas somente depois de assinatura verificada e permanecem confirmadas;
sessões novas de QR/código começam sem essa capacidade. Com o writer próprio
parado, reutilizar backup privado de banco/objetos de até 64 MiB cada, parsing e
ensaio de restauração em transação revertida. Conferir checksums 001–019 e
digests das 29 tabelas existentes, omitindo somente a coluna nova da comparação
e verificando separadamente que as sessões anteriores ficaram confirmadas.
Conta, perfil, histórico, permissões e contabilidade permanecem preservados.

Antes da reabertura, uma falha admite retorno verificado do schema/release
próprios. Após reabrir, preservar novas gravações e parar somente o app se
falhar, sem restaurar automaticamente dados antigos. Publicar apenas o commit
exato com CI aprovada e verificar saúde, os assets/fontes públicos e as
impressões de configuração, processos e respostas antes/depois. A leitura
autenticada passa a ter orçamento separado de 240 pedidos/minuto, com os
limites existentes de quatro pedidos simultâneos; mutações e desafios mantêm
seus limites. Recursos do serviço/executor, tamanho de release/transferência,
isolamento e ausência de push externo permanecem.

**Ponto importante:** o deploy não executa reset de Cofre nem exclusão de dados.
Backup e release anterior ficam privados para retorno. Testes físicos do novo
fluxo continuam no [roteiro de simplificação](TESTES_MANUAIS_SIMPLIFICACAO.md).

**Resultado:** release `f7b48bb` publicada em 04/10/2026 pelo comando existente,
com [CI do commit exato aprovada](https://github.com/karma352431231-ship-it/0xDMme/actions/runs/37191016205),
migração 019, backup/ensaio de restauração e preservação verificados. Os 38
arquivos públicos passaram na conferência; pacote de 8.325.168 bytes, dentro
de 16 MiB. Nenhum serviço compartilhado foi reiniciado. Backup, release
anterior e evidências operacionais permanecem privados em `.local/` e no
armazenamento próprio da VPS. A rodada duplicada da branch de publicação
encerrou sem aprovação; a ativação exigiu e confirmou a CI integral bem-sucedida
da mesma release na branch de implementação, sem dispensar nenhuma verificação.
Testes físicos de câmera, wallet, salvamento/reabertura e suspensão continuam
pendentes; a interface mobile foi conferida no navegador com dados sintéticos.

Em 01/10/2026, o proprietário autorizou separar os arquivos por escopo em commits,
enviar a branch ao GitHub e usar Git para transferir código à VPS. O remoto
permanece no repositório existente da conta Karma; isso não autoriza trocar a
identidade/autenticação global nem vinculá-la à conta ohsael.

O GitHub confirmou a renomeação do mesmo repositório para **0xDMme**, preservando
seu identificador e proprietário. URL canônica do `origin`:
`https://github.com/karma352431231-ship-it/0xDMme.git`.

## Fluxo aprovado

1. Revisar arquivos, excluir dados privados e executar os checks necessários no
   ambiente de desenvolvimento. Manter `.local/`, segredos, inventários, builds e
   `node_modules` fora do Git.
2. Criar commits por responsabilidade e enviar a branch `codex/` ao `origin`.
   A branch principal não é atualizada automaticamente.
3. Executar `python3 infra/staging/sync-git.py`. O script exige árvore limpa e o
   mesmo commit já enviado ao GitHub. O acesso SSH é lido exclusivamente de
   `.local/VPS_SSH_TARGET`.
4. O Git envia os objetos diretamente por SSH ao repositório bare exclusivo
   `/var/lib/0xdmme/data/git/0xdmme.git`, dentro do armazenamento limitado do
   ambiente. O recebimento usa a slice própria (sem tetos de recursos desde 09/10/2026) e hooks
   desativados. Nenhuma credencial do GitHub é copiada para a VPS; não há clone,
   pull, escrita ou instalação nos diretórios do outro projeto.

O repositório remoto precisa ser preparado e revisado separadamente; o comando
de sincronização não cria diretórios ou infraestrutura. Não usar `--force`,
reconfigurar remotos globais ou instalar hooks de deploy automaticamente. A
sincronização confere o hash recebido; falha é reportada, sem ativar código.

### Exceção temporária de fontes do bloco 07 — aprovada em 03/10/2026

O proprietário autorizou ampliar de 16 para 64 MiB o pacote recebido somente
para sincronizar as fontes do bloco 07, mantendo os demais limites. Aplicar
`-c receive.maxInputSize=64m` apenas ao processo Git desse recebimento. A
configuração persistente do repositório continua em `16m`; término ou falha
do processo encerra automaticamente a exceção, sem deixar um teto ampliado.

Preservar CPU de 10% de um núcleo, memória de 128 MiB, 24 tarefas, timeout de
120 segundos, verificação dos objetos e hooks desativados. Conferir espaço,
configurações, serviços, respostas atuais e hash recebido antes/depois. A
diferença HTTP preexistente em relação ao registro histórico fica registrada
privadamente, sem substituir a baseline do deploy. A autorização não amplia
o limite de build/deploy, não ativa uma release nem aplica migrações, e não
autoriza novos envios grandes automaticamente. Evidências e acesso ficam
exclusivamente em `.local/`.

Antes do primeiro envio, `npm run check` passou com lint, tipos, fronteiras,
licenças, formatação, build e 70 testes automatizados. Sintaxe do helper Python,
links locais e ausência do acesso SSH/chaves privadas nos arquivos versionáveis
foram conferidos. O repositório bare próprio foi preparado; as comparações de
configuração, processos persistentes e respostas dos sites anteriores passaram,
sem reinícios. Evidências detalhadas permanecem exclusivamente em `.local/`.

## Ativação de uma versão

### Transição específica dos blocos 04–05, aprovada em 02/10/2026

Após a revisão de `203274b`, o proprietário autorizou a ativação com QR 0.7.2,
migrações 004–009, backup do banco/objetos próprios e pausa temporária somente do
serviço web próprio. Publicar com `npm run deploy:blocks45`; pré-flight com
`python3 infra/staging/deploy_blocks45.py --check`. O deploy comum conserva todos
os bloqueios anteriores. A transição específica exige o predecessor `d64711c`,
fontes de aplicação idênticas às revisadas em `203274b`, lockfile/Node revisados e
o pacote QR exato preparado no Mac. Somente o novo comando é acrescentado ao
contrato de scripts. Não há npm, build ou atualização de Node na VPS.

O commit do executor deve passar em CI e estar nos dois remotos. A release é
montada pelo Git e vinculada ao manifesto do build; configurações, processos e
respostas da baseline são comparados antes/depois. Os limites já aprovados do
executor permanecem. Banco e objetos admitem, cada um, backup de até 64 MiB,
com espaço adicional conferido, parsing integral do dump e hashes dos objetos.
Uma restauração de ensaio executa DDL/dados/constraints em transação e termina em
`ROLLBACK`; os digests originais precisam permanecer iguais antes de migrar.
Acima desses limites, recusar e revisar, sem pular backup ou apagar dados.

Com o escritor próprio parado, guardar backup privado, aplicar as migrações na
transação versionada e conferir checksums, digests de contas/perfis/sessões e a
contagem inicial de bytes usados. A nova release só abre após essas verificações.
Falha anterior à reabertura permite restaurar exclusivamente o schema próprio,
em uma transação, conferir o retorno e iniciar a versão antiga. Depois de iniciar
a versão nova, **não restaurar automaticamente o dump antigo**: podem existir
gravações novas. Nesse caso parar somente o serviço próprio e conservar banco,
objetos, backup e releases para correção/revisão. Timeout/interrupção exige ler o
receipt privado antes de repetir. Backups de dados não entram na limpeza de
workspaces do deploy comum; sua exclusão exige revisão específica.

**Ponto importante:** esta aprovação permite a publicação dos blocos 04–05 para
testes; não autoriza futuras migrações/dependências, mudanças compartilhadas,
retorno com perda de novas gravações ou uso de conversas reais. Teste físico
mobile permanece com o proprietário após a publicação verificada.

**Enviar commits e publicar uma versão são operações distintas.** O comando
acima guarda fontes e histórico na VPS; ele não modifica a release em execução,
não aplica migrações e não reinicia serviços. A versão HTTPS já testada permanece
ativa até um deploy deliberado.

Para o próximo deploy, escolher um commit enviado aos dois remotos, preparar o
build e as dependências de runtime desse commit no ambiente de desenvolvimento e
verificar o pacote antes da transferência. Assets gerados continuam fora do Git,
com fontes/licenças correspondentes incluídas no build público. Exportar as
fontes desse commit com Git; não copiar arquivos soltos da árvore de trabalho.

A ativação deve escrever somente no armazenamento/release próprios, conferir
compatibilidade das migrações, preservar dados e preparar retorno à versão
anterior quando seguro. Reiniciar somente o serviço web próprio se necessário;
configurações compartilhadas não fazem parte do deploy de código. Não executar
build, npm, testes ou bootstrap no outro projeto nem atualizar dependências
globais. Push sozinho não ativa uma release.

Em 01/10/2026, o proprietário autorizou separadamente a ativação da correção
mobile `17d04b6`. O pacote foi exportado desse commit, conferido com o Git
exclusivo da VPS e ativado após verificar backend, migrações e dependências
idênticos à versão anterior. Somente o serviço web próprio foi reiniciado;
saúde HTTPS, JavaScript público e fontes correspondentes foram conferidos.
As comparações de configuração, processos compartilhados, banco próprio e
respostas anteriores passaram. A release anterior ficou guardada para retorno,
dentro do armazenamento limitado próprio. Evidências e operações de acesso
ficam em `.local/`; o aceite físico Android continua pendente. Esse deploy
autorizado não habilita ativação automática para os próximos envios de Git.

## Comando reutilizável aprovado

### Transição específica do bloco 08, aprovada em 03/10/2026

Após revisar a implementação, o proprietário pediu enviar e ativar o bloco 08.
Usar o mesmo `npm run deploy:staging`, com exceção restrita no executor existente:
predecessor ativo `931b09b`, fontes/runtime revisados em `121a4eb`, sequência
001–015 intacta e somente a nova migração 016. O commit que incorpora o executor
precisa passar em CI e ser enviado aos dois repositórios. Não há mudança de
dependências, Node, Nginx ou serviços compartilhados.

Antes de reabrir o escritor, o fluxo reutiliza as ferramentas de backup já
validadas: dump privado de até 64 MiB, cópia/hash de objetos até 64 MiB, espaço
adicional, parsing integral e restauração em transação encerrada por `ROLLBACK`.
Conferir checksums 001–016, digests das 22 tabelas preexistentes, tabela de anexos
inicialmente vazia e contabilidade de uso real. Parar/iniciar somente
`0xdmme-test.service`, conservando as impressões de configuração, processos e
saúde dos demais serviços. A política de retorno dos blocos 04–05 também vale:
antes de reabrir é possível restaurar o schema próprio; depois de reabrir,
preservar novas gravações e parar somente o app para correção, sem restaurar
automaticamente o dump antigo. Backups e release anterior ficam privados.

O bloqueio de outras alterações de banco continua ativo. Atualizações posteriores
sem mudança do banco seguem o caminho comum, com build preparado no Mac e
reutilização por commit. Um artefato incompleto antigo sem receipt/ativação deve
ser investigado antes de liberar uma vaga; conservar sua evidência dentro do
armazenamento próprio e não apagar backups de transições para abrir espaço.

**Ponto importante:** a aprovação destina o bloco 08 ao ambiente de testes na VPS.
Ela não conclui testes físicos mobile nem o aceite final para conversas reais.

**Resultado:** release `8acc99d` publicada com CI aprovada, migração 016,
backup/ensaio de restauração e preservação verificados. Houve falha na primeira
checagem após abrir: o app foi parado e o estado novo conservado. Após revisão,
a mesma release foi reaberta e todos os 36 hashes públicos e saúde passaram;
a falha não se reproduziu e sua causa exata não foi isolada. O receipt só foi
concluído após nova conferência, sem repetir migração ou restaurar o dump.
Backups e release anterior permaneceram privados. Um build gerado antigo,
incompleto e nunca ativado foi conferido por hash e movido para evidência privada
no armazenamento próprio, sem apagar conteúdo ou backups.

Depois desse primeiro deploy, o proprietário aprovou um comando explícito
reutilizável, mantendo o build no Mac/ambiente de desenvolvimento. Publicar:

```sh
npm run deploy:staging
```

Desde 10/10/2026, por solicitação do proprietário, os modos `prepare`, `check` e
`staging` selecionam automaticamente Python **3.14** no ambiente de desenvolvimento.
Se `python3` iniciar outra versão (como o 3.9 do Xcode encontrado pelo npm), o executor
confere `python3.14` no `PATH` e nas instalações padrão Homebrew/python.org e se
reinicia com a versão verificada, conservando diretório, ambiente e opções. A
sincronização de fontes usa esse mesmo interpretador. A seleção ocorre antes de
Git, CI, build ou SSH; se o 3.14 estiver ausente ou não iniciar, o comando para com
uma mensagem explícita. Não instala ferramentas nem altera o Python da VPS.

Antes de chamar: revisar, commitar e dar push da branch `codex/`; aguardar sucesso
do workflow `check.yml` para esse commit. O comando recusa árvore suja, remoto
diferente, commit não enviado, CI pendente/falha ou executor alterado. Consulta
a CI pública sem copiar credenciais para a VPS. Não instala ferramentas de build,
executa npm ou compila na VPS.

O build é feito uma vez por commit numa exportação do Git com as dependências de desenvolvimento
já instaladas. Repetir `prepare`, `check` ou `staging` para o mesmo commit reutiliza
o pacote depois de validar manifesto, arquivos do Git, hashes dos assets, fontes
Matrix e integridade do arquivo; cache incompleto/corrompido é recusado. Diretórios reais com hardlinks locais preservam a identificação
dos pacotes incorporados pelo esbuild; um link simbólico para `node_modules`
pode omitir esses pacotes do arquivo de fontes. O comando confere fontes dos
terceiros antes de permitir a publicação. O pacote transferido contém somente
`dist/`, exceto as partes das fontes Matrix já versionadas: essas partes são
reconstruídas do blob Git dedicado com hashes individuais e integral. Todas as
fontes ficam na release pública. As fontes de runtime são extraídas do commit no Git bare próprio da VPS,
com manifesto/hash que vincula fontes e build. Dependências de runtime existentes
são reutilizadas somente quando lockfile/contrato permanecem iguais.

Exceção específica aprovada em 01/10/2026 para publicar a prova isolada
Phantom/Solana: permitir a transição entre os lockfiles SHA-256
`4db68588987a5b5a1a3afedd09a6096a2c5ab51c37ac9f334af2cc06b8125092` e
`fac024d2596d80a4450f9ad46cc212e6b51e536f02062f630fd8c8c1adcc0be5`,
inclusive no sentido inverso, desde que suas entradas de execução sejam iguais.
A revisão encontrou somente `libsodium-wrappers` e `libsodium` 0.8.4 novos,
marcados para desenvolvimento; a biblioteca é incorporada no script público da
prova, com licença ISC e fontes correspondentes. Não executar npm na VPS.
Qualquer outro hash diferente continua recusado; Node, módulo de banco,
contrato de runtime, preservação e limites mantêm as verificações anteriores.
A autorização cobre publicar a prova e seu teste físico, sem substituir login
ou considerar o retorno EVM resolvido.

Outros modos:

```sh
npm run deploy:prepare
npm run deploy:check
```

`prepare` gera o pacote local e confere Git/CI, sem acessar a VPS. `check` também
sincroniza as fontes no Git da VPS e executa o pré-flight, sem enviar o build,
trocar release ou reiniciar serviços. A sincronização de fontes continua usando
`sync-git.py`. Repetir `staging` para uma versão que já está ativa e confere com
os hashes não reinicia o serviço.

O acesso vem de `.local/VPS_SSH_TARGET`; a baseline privada revisada vem de
`.local/VPS_DEPLOY_BASELINE.json` (`files`: hashes de configurações existentes;
`services`: propriedades PID/início/estado; `sites`: host/status anterior).
Ambos devem ser arquivos regulares, ignorados pelo Git e com modo `0600`.
Não capturar uma baseline nova para esconder uma diferença encontrada. Builds,
manifestos e logs ficam em `.local/deployment/`, sem inventário no Git.
O cache local admite até 16 commits de build, com arquivo de até 16 MB por commit
e logs de até 64 KB por etapa; exceder esse limite exige revisar os artefatos locais.

Na VPS, o executor usa a slice própria. Desde 09/10/2026, por decisão do proprietário, sem tetos de CPU, memória ou tarefas (ver plano, seção 3); o texto a seguir descreve os limites anteriores. Antes: CPU 10%, memória 192 MB, swap zero,
32 tarefas, I/O idle, sistema de arquivos protegido e escrita somente no
armazenamento próprio já limitado a 2 GB. O arquivo de build tem limite de
16 MB; código, assets e dependências juntos têm orçamento de 128 MB; exigir 256 MB
livres. Há lock contra ativação simultânea. Antes/depois, comparar configurações,
processos e respostas da baseline, além de configurações próprias e processo do
PostgreSQL próprio. Não atualizar Nginx, certificados, firewall ou outros serviços.

Mudanças no módulo de banco (incluindo migrações), contrato de runtime ou Node
são recusadas. Mudanças de lockfile são recusadas, exceto pelo par de hashes
revisados acima; precisam de revisão específica antes de ampliar o fluxo.
O Node já instalado pode estar numa versão superior à `.nvmrc`, desde que atenda
ao intervalo aprovado em `engines.node` sem mudança desse contrato. Não atualizar
o Node do sistema para igualar a versão do ambiente de desenvolvimento.
Não há opção `force` ou migração automática autorizada. Uma falha de ativação
restaura os arquivos anteriores e reinicia somente `0xdmme-test.service`; a
saúde do retorno é conferida. Falha do próprio retorno é reportada como não
verificada, nunca como sucesso.

Uma release anterior é mantida para retorno. Workspaces de código de publicações anteriores saudáveis
podem ser removidos para abrir espaço à próxima tentativa, contendo
apenas código/build/backup de código; banco e objetos ficam fora dessas árvores.
Até três tentativas pendentes/concluídas cabem no orçamento de workspaces;
tentativas interrompidas ou com conteúdo inesperado exigem revisão. Backups
históricos anteriores ao comando não são apagados por ele. Timeout, queda de SSH
ou término abrupto podem deixar resultado indeterminado: consultar receipt/log
privado antes de retomar, sem repetir uma ativação cegamente.

A autorização desse comando cobre deploys explícitos de código revisado dentro
desses limites. Custos, dependências, migrações e infraestrutura continuam sujeitos
às regras do projeto; não há publicação automática a cada push.

Validação local da implementação: lint, tipos, fronteiras, licenças, formatação
e build passaram; os 72 testes JavaScript passaram, com dois casos de listener
reexecutados fora do sandbox após bloqueio `EPERM` de porta local. Passaram
também os 17 testes de deploy em diretórios temporários, sem SSH/reinício real:
CI exata, arquivos maliciosos, limites, migrações/dependências, retorno após falha,
recusa de retorno não verificado, retenção, versão já ativa e fontes de terceiros
no build real exportado do Git. O workflow repete esses controles em CI.

O fluxo foi executado com sucesso em 01/10/2026 para o commit `9f15d57`, com
CI aprovada. Fontes de runtime foram extraídas do Git próprio da VPS; o build
local e todas as fontes/licenças públicas conferiram pelo manifesto. Somente
o serviço web próprio foi reiniciado, a versão anterior foi mantida e as
verificações de preservação passaram. O Node instalado permaneceu dentro do
intervalo já aprovado, sem atualização de sistema. Isso valida a publicação
pelo comando; o aceite físico mobile da autenticação continua pendente.

**Ponto importante:** o envio ao GitHub/VPS não libera a V1, não substitui aceite
mobile e não torna seguro usar conversas reais. O risco residual de hardware e
rede compartilhados continua conforme a [decisão de isolamento](DOMINIO_E_AMBIENTE_TESTE.md).

## Transição autorizada dos blocos 06–07 em 03/10/2026

O proprietário pediu explicitamente publicação/ativação e aprovou aumentar somente `client_max_body_size` do site próprio de 5 MiB para 8 MiB. O limite de foto no app permanece 3.000.000 bytes; a cifra e seu transporte são maiores. Não há alteração de Node, dependências, serviços/bancos do outro projeto ou limites persistentes de Git. O reload do Nginx é gracioso, precedido por validação e seguido por comparação dos fingerprints/processos e respostas existentes.

Comando específico: `python3 infra/staging/deploy_blocks67.py --activate`, executado no Mac em checkout limpo do commit exato com CI aprovada. `--check` prepara/sincroniza/verifica sem ativação. O executor aceita somente a aplicação revisada em `8e74bb1` sobre o predecessor `32663bb`, com migrações 010–015; o comando comum continua recusando mudanças de banco e artefatos maiores que 16 MiB.

O Mac prepara o build completo e seu manifesto. O pacote transferido omite somente as 18 partes da fonte preferencial Matrix, já presente no Git dedicado da VPS. O executor copia esses bytes do blob versionado em blocos, sem compilar ou instalar, verificando tamanho, SHA-256 integral e hash de cada parte contra o build do Mac. Todas as fontes permanecem disponíveis na publicação. O pacote mantém teto de 16 MiB e a soma de código/assets/dependências permanece limitada a 128 MiB. A verificação HTTP do WASM conhecido admite 8 MiB; as demais respostas conservam 2 MiB, exceto o pacote principal `source-<hash>.tar.gz`: em 10/10/2026, o proprietário removeu seu teto individual. A conferência desse pacote usa o orçamento total da release e preserva o prazo e o SHA-256/ETag; não altera serviços compartilhados.

Antes de migrar, parar somente o writer `0xdmme-test.service`, conferir schema 1–9 e preservar hashes das 12 tabelas existentes. Fazer backup privado de até 64 MiB, verificar sua integridade e ensaiar restauração do schema próprio dentro de transação revertida. Após migrar, conferir checksums 1–15, dados anteriores, tabelas novas vazias e contabilidade de bytes. Falha antes de reabrir admite retorno verificado; após reabrir, nunca restaurar automaticamente o banco antigo, pois novos dados podem existir. Guardar backup/versão anterior em workspace próprio para revisão posterior.

A evidência histórica de preservação permanece intacta. Uma diferença de HTTP já existente antes da operação foi investigada e registrada privadamente; esta transição exige os fingerprints/processos históricos e compara a resposta atual antes/depois, sem reescrever o baseline para ocultá-la. A entrada privada `.local/VPS_BLOCK67_REVIEW.json` contém a proposta exata do site próprio e a evidência de respostas, com permissões 0600. Acesso, inventário, recibos e backups ficam exclusivamente em `.local/` ou na área privada dedicada da VPS.

O executor mantém CPU 10% de um núcleo, RAM 192 MiB, sem swap, 32 tarefas e duração de até 240 segundos por operação. O web mantém os limites próprios já configurados. Não reiniciar serviços compartilhados; somente o reload aprovado do Nginx. DNS/HTTPS e publicação de teste não constituem aceite de segurança nem substituem testes físicos mobile.

Na operação de proxy, a validação enxerga logs temporários e `/dev/null` no lugar do arquivo PID, somente dentro de seu namespace. Isso permite `nginx -t` com filesystem protegido sem abrir os logs/PID reais para escrita; o reload é solicitado ao master existente pelo systemd.

## Transição específica do bloco 09, aprovada em 03/10/2026

O proprietário pediu enviar e ativar o bloco 09 e autorizou a retomada após a pausa de contexto. Usar o mesmo `npm run deploy:staging`, com exceção restrita no executor existente: predecessor ativo `8acc99d`, fontes/runtime revisados em `343d334`, sequência 001–016 intacta e somente a nova migração 017. O commit final, que inclui o executor, precisa estar publicado e passar em CI. Não há alteração de dependências, Node, Nginx ou serviços compartilhados.

Antes de reabrir o escritor, reutilizar dump privado e cópia de objetos, cada um limitado a 64 MiB, parsing integral e restauração em transação encerrada por `ROLLBACK`. Conferir checksums 001–017 e contagens/digests das 23 tabelas preexistentes. Somente a coluna nova `message_packets.personal_collected` fica fora da comparação de linhas; uma verificação separada exige que seja falsa em todas as mensagens existentes. A tabela nova `personal_removals` precisa estar vazia e o livro de uso físico continuar consistente, incluindo suas futuras cobranças. Objetos, configurações e processos são comparados antes/depois. Parar/iniciar somente `0xdmme-test.service`. Depois de reabrir, uma falha conserva novas gravações e para o app para revisão, sem restaurar automaticamente o dump antigo.

Os três workspaces anteriores estavam ocupados por transições concluídas com backups. O executor separa bundles históricos em `migration-backups/<commit>` na área privada própria: conserva dump, objetos, receipt e eventual artefato QR; remove somente código/build de publicações concluídas conforme a autorização existente. A transição mais recente mantém sua release de retorno completa até uma nova publicação ter sucesso. Ownership, tipos, links, conteúdo e colisões são conferidos antes de mover; tentativas interrompidas permanecem para revisão. O teto de três workspaces de código e o filesystem próprio de 2 GB não aumentam; backups históricos não são apagados para abrir espaço.

**Ponto importante:** publicação destinada ao ambiente de testes. Download/reabertura e limpeza pela interface, aparelhos físicos mobile e aceite final de segurança continuam pendentes. Esta transição não autoriza outras migrações nem estabelece prontidão para conversas reais.

**Resultado:** release `62781eb` publicada em 03/10/2026 com CI aprovada, migração 017, backup/ensaio de restauração, preservação e 36 hashes públicos verificados. A primeira tentativa de preparar parou localmente porque o ambiente do npm encontrou um Python sem suporte a `tarfile.extractall(filter='data')`; selecionar o interpretador compatível já instalado no Mac resolveu, sem instalar dependências ou mudar a VPS. Uma consulta de CI também sofreu timeout antes de atingir a ativação e foi reconferida por leitura.

A primeira conferência após reabrir a release falhou e o executor parou somente o app, conservando novas gravações e todos os backups. Depois de revisar receipt, schema e manifesto exato, a mesma versão foi reaberta e todos os hashes e saúde passaram; a publicação foi concluída somente depois dessa conferência. A reabertura mostrou respostas HTTP não bem-sucedidas antes da prontidão, mas a causa exata da falha original não foi isolada. Não se repetiu migração nem se restaurou o dump. Configurações/processos de preservação permaneceram idênticos. Os três backups históricos e o novo backup foram conservados; só os bundles de código concluídos mais antigos liberaram workspaces.

## Atualizações rotineiras após o bloco 07

O proprietário pediu reaproveitar o script existente e reduzir a demora nas atualizações. Os comandos continuam sendo `npm run deploy:prepare`, `npm run deploy:check` e `npm run deploy:staging`; não há outro comando por bloco para mudanças comuns de código. Antes de ativar, commitar/push da branch `codex/`, conferir checkout limpo e CI do commit exato. O último comando prepara ou reutiliza o build, sincroniza os fontes, envia o pacote, troca a release e reinicia somente o app. Não é necessário rodar os três comandos em sequência.

É possível manter vários commits coesos e enviá-los num único push: a CI exigida para a publicação é a do commit final, que inclui os anteriores, e somente essa versão precisa de build/transferência/ativação. No bloco 09, os commits de funcionalidade e executor foram enviados juntos para uma única publicação. Migrações, dependências e infraestrutura continuam sujeitas às revisões específicas; agrupar commits não dispensa esses contratos.

A preparação comum incorpora a distribuição Matrix já aprovada: pacote abaixo de 16 MiB, reconstrução das fontes do Git e manifesto completo. As restrições de banco, dependências, Node e infraestrutura permanecem; novos contratos desses tipos exigem revisão específica. Atualização comum não reaplica a transição 010–015, não faz backup/restauração de banco e não recarrega Nginx. As migrações já aplicadas continuam verificadas pelo app na inicialização.

Cada asset público tem ETag calculada por SHA-256 dos bytes carregados pelo app. A conferência HTTPS usa o hash esperado com `If-None-Match`; uma resposta 304 confirma conteúdo correspondente sem retransmitir os arquivos grandes. Respostas 200 continuam verificadas pelo hash integral, permitindo conferir versões anteriores sem esse header. As chamadas respeitam o orçamento de requisições existente. APIs/dados privados não recebem essa ETag; a política `no-store` é preservada e o PWA continua com seu fluxo explícito de atualização.

A limpeza automática remove somente workspaces de código concluídos e reconhecidos; backups privados de transições de banco são preservados e tentativas interrompidas continuam exigindo leitura do recibo. O orçamento de três workspaces não foi aumentado.

**Ponto importante:** o comando é executado no Mac, publica código/build na release própria e verifica saúde/retorno. `git pull` ou envio dos fontes sozinho continua sem ativar o app. CI ainda precisa passar, mas preparar/verificar/ativar o mesmo commit não refaz o build nem precisa retransmitir os 50 MB de assets na conferência pública.

## Publicação revisada do bloco 10 em 03/10/2026

O proprietário pediu enviar o bloco 10 à VPS. Reutilizar `npm run deploy:staging`: predecessor ativo `62781eb`, fontes de aplicação revisadas em `1f4d33c`, sequência 001–017 intacta e somente a nova migração 018. O commit final inclui a revisão do executor e exige CI exata aprovada.

A revisão de runtime autoriza somente `web-push@3.6.7` e `@types/web-push@3.6.4`, com os locks SHA-256 `e569391aa19daf28a27c30a8567ce4d55324119d7d1bb2d6c3f36609640152d4` → `a94082f173b3d553c15ea1c8b0db29452b7b79c41615c30478f0a924a12937db`. São 17 pacotes adicionais de runtime, incluindo cinco antes exclusivos do desenvolvimento, sem mudança de versões das dependências existentes. Pacotes originais do cache npm do Mac: 148.973 bytes comprimidos, 509.772 bytes extraídos. Integridade SHA-512 npm e versões são conferidas nas duas pontas. O helper `deploy_runtime.py` apenas prepara/verifica/extrai esses pacotes no candidato do executor existente; não é outro comando de deploy. Não executar npm, scripts de instalação ou compilação na VPS. Arquivos nativos, links, traversal, pacotes alheios e restrições de plataforma são recusados. Dois arquivos originais com alias `./` idênticos são deduplicados somente após comparação dos bytes. Pacotes/licenças originais permanecem no artefato privado da release, sem incorporação ao frontend.

A transição 017→018 reaproveita backup e ensaio transacional de restauração. Com somente o escritor próprio parado, compara hashes das 24 tabelas anteriores, omitindo apenas `relation` e `deletion_account`, ambas inicialmente nulas. Exige as cinco tabelas novas vazias, checksums 001–018 e cobrança global correta. Antes da abertura pode devolver esquema antigo verificado; depois da abertura conserva escritas novas e para somente o app em caso de falha, sem restauração automática. Backup e release anterior ficam preservados.

Limites de 16 MiB de transferência, 128 MiB de release, recursos dos serviços, Node, Nginx e isolamento de rede permanecem. Nenhum VAPID é instalado. Push externo continua pendente devido ao isolamento aprovado; publicação do código não libera saída de rede. Conferir saúde, os 37 assets/fontes públicos e fingerprints/processos/respostas do outro projeto antes/depois. Evidências, acesso e inventários exclusivamente em `.local/`.

**Resultado:** release `8f22884` publicada em 03/10/2026 com [CI aprovada](https://github.com/karma352431231-ship-it/0xDMme/actions/runs/37167971351), migração 018, backup/ensaio de restauração, runtime original conferido, preservação e 37 hashes públicos verificados. Pacote de 8.300.758 bytes, dentro de 16 MiB. A primeira conferência de prontidão encerrou a tentativa depois da abertura; fontes, esquema e backups foram inspecionados, e somente a mesma release foi retomada sem nova migração, instalação ou restauração. Na retomada, oito consultas com intervalo de dois segundos ainda encontraram o serviço iniciando antes da resposta saudável. Evidências operacionais ficam privadas.

A espera inicial de dez tentativas era insuficiente para a carga das fontes sob os limites de I/O existentes. Correção no executor: janela de prontidão de 60 segundos, intervalo de até dois segundos, seguida de uma única conferência dos assets. Mismatch de asset continua falhando, sem repetir o manifesto inteiro. O teto total de 240 segundos, recursos e regra de preservar escritas após abertura permanecem. Dois testes de regressão cobrem partida em 16 segundos, limite da espera e erro de asset; conjunto de 71 testes do executor passou. Publicação da correção pelo mesmo comando é uma atualização de código, com banco/runtime idênticos e sem nova transição de esquema.

**Atualização final:** a correção de prontidão foi publicada como release `7adefc0` pelo mesmo `npm run deploy:staging`, após [CI exata aprovada](https://github.com/karma352431231-ship-it/0xDMme/actions/runs/37168927177). O fluxo normal concluiu sem interrupção, com 37 hashes públicos e preservação verificados; pacote de 8.300.631 bytes. Banco permanece na versão 018, sem nova migração, restauração ou alteração de configuração/serviço compartilhado. A release anterior foi retida para rollback; backups da transição continuam privados e preservados.

## Preparação de chamadas, push e grupos — 05/10/2026

O proprietário pediu publicação e ativação das novas funcionalidades e, após o inventário, aprovou explicitamente infraestrutura própria de TURN/push, filtros restritos aos usuários exclusivos e migrações 026–027, com backup e ensaio de restauração. Fontes `537240c` sincronizadas no GitHub e no Git dedicado da VPS, com [CI integral aprovada](https://github.com/karma352431231-ship-it/0xDMme/actions/runs/37377206631). Os arquivos pessoais de instruções e testes manuais foram preservados fora do commit; o deploy usa checkout limpo local.

O executor existente aceita somente a transição de aplicação `793bf21` → fontes de `537240c`, 025 → 027. Preserva as 48 tabelas anteriores, objetos, checksums 001–025, runtime/lockfile/Node e contabilidade de uso. As duas tabelas novas contêm apenas preferências e entram no ledger. Novas chamadas não criam histórico nem fila durável. Testes do executor cobrem fontes/predecessor inexatos, alterações em SQL antigo, ledger, retorno antes da abertura e preservação de escritas após abertura. Foram aprovados 91 testes locais.

Coturn 4.18.0 é preparado em Linux temporário no computador de desenvolvimento, separado dos pacotes da VPS. Não trocar pela versão 4.6.1 disponível no host nem atualizar pacotes compartilhados. A preparação constatou `noexec` no volume de dados e parou sem iniciar serviços, trocar release ou aplicar migrações. O proprietário então escolheu `/opt/0xdmme-turn`: diretório exclusivo, até 8 MB, controlado pelo root e somente leitura para o serviço. Preservar `noexec` no volume atual. TURN e emissor ficam em usuários, namespaces e unidades próprios na slice existente; filtros por UID precedem a saída externa. Web conserva `PrivateNetwork=yes` e `IPAddressDeny=any`, comunica por socket Unix e nunca recebe VAPID privada. Evidências, acesso, IPs, chaves, certificados e configuração concreta ficam exclusivamente em `.local/` e arquivos privados do host.

**Ponto importante:** aprovação operacional não comprova ativação. Exigir filtros/permissões efetivos, relay UDP/TCP/TLS, bloqueio de destinos proibidos, hashes públicos, saúde e fingerprints antes/depois. A publicação de código usa exclusivamente `npm run deploy:staging`; a preparação de infraestrutura não pode aplicar migrações nem trocar a release. Aceite físico e entrega real de push em aparelhos permanecem necessários.

## Ativação de chamadas, push e grupos — 05/10/2026

**Resultado:** release `44af35f` ativa após [CI integral do commit exato](https://github.com/karma352431231-ship-it/0xDMme/actions/runs/37381079067), pelo `npm run deploy:staging` existente. Build de 8.313.691 bytes preparado no Mac, dentro do teto de 16 MiB. Migrações 026–027 aplicadas com backup privado e ensaio transacional de restauração; 48 tabelas anteriores e objetos preservados, schema 001–027, 50 tabelas e ledger conferidos. Os 38 arquivos públicos servidos, incluindo fontes/licenças, passaram nos hashes do manifesto. Release anterior e backup ficam retidos; depois da reabertura, não restaurar banco antigo sobre novas gravações.

TURN, emissor e filtros próprios estão ativos. Coturn 4.18.0 em `/opt/0xdmme-turn`, root, até 8 MB, somente leitura para o serviço; `noexec` do volume de dados preservado. Chrome com áudio sintético confirmou conexão e tráfego nas duas direções por UDP, TCP e TLS, com candidatos locais/remotos somente `relay` e sem perda registrada. Cadeia e hostname TLS passaram. O utilitário nativo passou UDP/TCP, mas apresentou perda no teste TLS; essa prova isolada não foi registrada como aprovada. A validação WebRTC exercitou o fluxo do navegador e o snapshot de candidatos com o prazo usado pelo app.

Namespaces reais/sintéticos com as propriedades das unidades confirmaram banco, objetos, ambiente privado do web e sockets alheios inacessíveis aos auxiliares. Filtros bloquearam localhost, porta alheia no endereço próprio e destino externo fora dos conjuntos; o push alcançou TLS do provedor permitido. Web mantém rede privada, chave VAPID privada somente no emissor e socket 0660 acessível pelo grupo próprio. Credencial errada, chave pública incompatível e payload com identificadores foram recusados, sem envio externo. Saúde, configurações/processos e sites do outro projeto foram preservados. As quatro exceções de entrada e duas tabelas por UID são próprias; nenhuma regra antiga foi removida ou substituída.

TURN e push estão habilitados no boot, com filtros como dependência. A rotina já existente de renovação do certificado próprio agora atualiza a cópia TLS do TURN; certificado/chave, linhagem própria, permissões e tamanho são validados antes da troca. Só reinicia TURN se a cópia mudar, podendo interromper chamadas ativas nesse momento. Sete provas sintéticas cobriram idempotência, par correspondente, linhagem/permissões/symlink inválidos e retorno do par anterior após falha parcial. Nenhuma renovação ou recarga compartilhada foi executada nesta ativação. Conjuntos de IPs dos provedores de push continuam exigindo revisão conforme DNS; mudança de CDN não amplia destinos automaticamente e pode impedir avisos até atualização revisada.

**Ponto importante:** esta ativação inclui chamadas individuais, push dedicado, grupos gratuitos sem teto de quantidade por conta e cotas de 1 GB pessoal/2 GB por grupo. A capacidade global não foi ampliada. Os testes não comprovam entrega de notificação em provedores reais, áudio em aparelhos físicos, suspensão ou redes restritas; esses itens continuam no aceite. Dados de acesso, rede, certificados, chaves, logs e evidências ficam exclusivamente na área privada.

### Processador de mídia pública — autorizado em 07/10/2026

O proprietário pediu habilitar também envio e preparação da mídia durante a calibração. A autorização cobre FFmpeg/ffprobe externos com hashes do benchmark, runtime próprio imutável, worker compilado localmente, serviço/socket/slice separados (quatro CPUs/8 GiB) e drop-in limitado ao socket do web. Não instalar dependências globais, alterar o outro projeto, ampliar permissões de objetos privados ou aceitar o candidato de moderação. Revisão e requisitos em [processador](PROCESSADOR_MIDIA_COMUNIDADES.md#worker-isolado-autorizado).

Preparar runtime e unidades próprios com orçamento de disco e rollback das adições, verificar isolamento/handshake/arquivos sintéticos e preservação antes/depois. Esta preparação operacional não executa migrações nem troca a aplicação. A ativação da aplicação e a transição 027→043 continuam no executor existente, a partir de fonte revisada e CI exata aprovada. A galeria e seus casos permanecem no processo independente. Registrar resultado e limitações depois da execução; ativar preparação não estabelece aceite do scanner ou liberação pública.

## Ajuste restrito do limite HTTP — 08/10/2026

O proprietário pediu aumentar o limite de pedidos e distinguir as falhas mascaradas como JSON. O parâmetro escolhido é 30 r/s por IP com `burst=120 nodelay`; preserva as demais diretivas, recursos e concorrência. A proposta concreta, configuração anterior e hashes ficam em `.local/VPS_REQUEST_LIMIT_REVIEW.json`, ignorada pelo Git, arquivo regular 0600. O limite do proxy é defesa de infraestrutura, não cota de mensagens por usuário.

Usar **`npm run deploy:staging -- --request-limit`**, no checkout limpo e publicado com CI aprovada. O executor normal primeiro publica o código com seus controles existentes e, só com a opção explícita, aplica as duas substituições aprovadas. `python3 infra/staging/deploy.py --check --request-limit` prepara e valida a proposta sem alterar o proxy. O módulo `deploy_request_limit.py` integra esse executor; não é outro comando de deploy. Uma publicação comum nunca altera o Nginx.

A ação requer a release exata já publicada, manifesto correspondente e configuração atual igual ao predecessor revisado. Somente o arquivo do site próprio ganha permissão de escrita; o teste de sintaxe usa logs/PID temporários no namespace do validador. Conferir fingerprints, processos e saúde existentes antes/depois. Fazer `nginx -t` e reload gracioso, sem restart do Nginx ou dos outros serviços. A proposta recusa qualquer mudança além de 5→30 r/s e burst 20→120. Guardar configuração anterior e receipt na área privada própria desta transição, separada dos workspaces de código para preservar sua política de retenção, junto à evidência local. Falha devolve somente o arquivo próprio, valida/recarrega e confere retorno; tentativa incompleta ou configuração inesperada exige revisão antes de repetir. CPU 10%, RAM 192 MiB, 32 tarefas e duração 240 s do executor permanecem.

**Ponto importante:** 429 ainda não foi confirmado como a causa da captura. O novo diagnóstico identifica a operação e o status das próximas falhas sem conteúdo privado. O teto de concorrência do site permanece; não há benchmark de capacidade ou garantia de eliminar toda indisponibilidade.

A release anterior já ocupava as 512 entradas do manifesto. A exceção técnica admite somente as duas entradas `src/client/api-response/index.ts` e `infra/staging/deploy_request_limit.py` além das 512 existentes, total máximo 514 quando ambas estiverem presentes. Qualquer crescimento adicional continua recusado. Os limites de bytes do manifesto, pacote de 16 MiB, extração de 128 MiB, fontes públicas e recursos não aumentam; a regressão cobre a recusa de um terceiro arquivo adicional e de um manifesto excedido sem esses módulos.

## Preparação local do ranking — 08/10/2026

A implementação local dos cortes 1–8 acrescentou dez arquivos de execução ao
manifesto. Sob a autorização de decisões técnicas autônomas, o executor
existente admite somente os dez caminhos enumerados em `RANKING_SOURCE_FILES`,
além das duas exceções anteriores de diagnóstico HTTP. Arquivos adicionais não
revisados continuam sujeitos ao teto base de 512 entradas. Limites de arquivo,
extração, runtime, hashes, fontes correspondentes e compatibilidade permanecem
ativos. A preparação foi verificada em snapshot Git sintético temporário, sem
commit no checkout do proprietário, SSH ou ativação.

**Ponto importante:** essa exceção permite preparar as fontes; não autoriza a
transição de banco 043→047, não cria uma autorização de release e não muda
serviços da VPS. Migrações 044–047 foram aplicadas somente no banco exclusivo de
testes. Ativação futura exige revisão operacional e autorização próprias,
checkout limpo/enviado, CI do commit exato, preservação e rollback pelo comando
já existente. Parâmetros e verificação no [plano do ranking](RANKING_COMUNIDADES_TRENDING.md).

### Ranking, visualizações e workers — autorização de 08/10/2026

O proprietário autorizou concluir os cortes 1–10, visualizações públicas,
commits separados, push ao GitHub e Git dedicado da VPS e ativação. Reusar
`npm run deploy:staging`, com checkout limpo, fontes exatas e CI aprovada.
`deploy_background.py` é um módulo interno do mesmo executor, sem novo comando
alternativo. A revisão é restrita ao predecessor registrado e fontes de aplicação
fixadas no módulo, schema 043→049, sem dependências/Node novos. As exceções do
manifesto enumeram exatamente os caminhos adicionais; limites de arquivo,
extração, bytes e runtime continuam os mesmos.

O executor instala somente três unidades próprias, bytes duráveis no volume do
0xDMme e links administrados pelo systemd, mais `40-background.conf` no drop-in
existente do nosso web. O deploy pode escrever nesse diretório próprio; nenhuma
permissão adicional para configuração de outros projetos. Recarrega o inventário
do systemd e habilita somente esses serviços, preservando configurações e PIDs
registrados dos serviços existentes. Nenhum reload do Nginx é necessário.

O web para antes do backup/migração; workers novos ainda não estão ativos. A
abertura exige schema/dados/objetos preservados, web saudável e três travas
exclusivas PostgreSQL. Rollback antes de abrir restaura backup validado, release
e nossas adições. Depois de abrir, preservar novas escritas e parar somente
nossos escritores para revisão. Releases seguintes de código também reiniciam
os três workers próprios para evitar processos executando arquivos da release
anterior. CPU/RAM/tarefas do slice compartilhado do 0xDMme permanecem limitados.
Acesso, hashes privados, backups e evidências operacionais ficam em `.local/`.

Fontes da transição inicial fixadas em `a2ed2c32cb63abd85311fc381b691fe1c6d6ce37`; predecessor exclusivo
`2921232287a929477e6d7cf18e7f82ff9d0fcddd`. Os primeiros commits posteriores
acrescentam documentação e executor. A correção de consulta descrita abaixo
tem sua própria revisão de fontes, sem novas migrações.

Na primeira tentativa desta transição, o validador systemd tentou criar seu
diretório temporário no filesystem somente leitura do executor. O rollback
restaurou o schema 43, mas o limite de 240 segundos interrompeu seu retorno de
arquivos. A revisão confirmou escritores fechados, backup válido, fontes exatas
e preservação; o retorno da release anterior foi concluído e sua saúde validada.
A tentativa e o backup permanecem privados para revisão, sem retry automático.

O executor de ativação agora oferece `/tmp` privado de 16 MiB, sem execução,
e define `TMPDIR`. Validação das unidades ocorre antes de parar o web ou migrar.
**Ponto importante:** CPU, RAM, processos, timeout, banco e infraestrutura
compartilhada conservam seus limites; esta correção não altera fontes da aplicação.

Falhas de transição também registram fase, tipo e mensagens controladas dos
guards no recibo/stderr privado antes do rollback. Não incluir SQL, argumentos,
credenciais ou conteúdo. Assim o rollback conserva a causa diagnosticável,
inclusive quando o limite do executor interrompe sua conclusão.

### Correção da consulta de ranking — 08/10/2026

Sob a autorização de concluir e ativar a entrega, a medição de ranking passa a
usar transação curta de somente leitura e `SET LOCAL jit=off`. A opção termina
com a transação, inclusive após erro; limites de consultas, CPU e RAM permanecem.
Não alterar a configuração global do PostgreSQL nem executar novas migrações.

O mesmo executor admite somente o diff de `community-ranking-metrics.ts` entre
o predecessor `0139e1d0f04681555e1dffea23f77cdf367c70d3` e a fonte revisada
`04a02dad65d480ad662f0a0f93e58da884518a5f`, comparando o diretório inteiro do banco.
SQLs aplicados, demais módulos, dependências e Node devem permanecer idênticos.
Commits posteriores podem acrescentar esta guarda/documentação sem mudar a
projeção aprovada. Build no Mac, CI exata, publicação pelo `npm run deploy:staging`,
reinício dos serviços próprios, preservação e rollback de código continuam
obrigatórios. Evidências e consumo reais ficam exclusivamente em `.local/`.

## Integração de branches e rollback da conta — 11/10/2026

O proprietário pediu integrar as branches pendentes na `main`, preservando os
commits de `claude/split-account` por fast-forward ou merge normal, sem squash
nem rebase. Essa branch contém `3939925` (configurações iniciais e tela sem
wallet) e `bb77088` (divisão do módulo de conta).

Se uma regressão de login exigir desfazer somente a divisão, preservar as
configurações iniciais:

```sh
git revert bb77088
```

Se o problema estiver nas configurações iniciais ou na tela sem wallet, desfazer
as duas mudanças, nesta ordem; reverter somente `3939925` pode conflitar com o
trecho movido pela divisão:

```sh
git revert bb77088 3939925
```

Depois de qualquer revert: validar, fazer push, esperar a CI integral do commit
exato passar e publicar novamente com `npm run deploy:staging`. Usar o checkout
integrado e limpo e os controles de preservação/rollback já documentados.

**Ponto importante:** integrar a calibração de moderação no Git não ativa uma
nova política na VPS. A nova identidade do detector exige aceite e transição
revisados, preservando aprovações anteriores e prazos; o merge não substitui
esses controles nem autoriza alterar a configuração ativa automaticamente.

### Ativação solicitada após o merge — 11/10/2026

O proprietário pediu ativar a `main` integrada na VPS. O detector simplificado
precisa de aceite da identidade integral nova; a fusão calibrada e os pesos
permanecem os mesmos da rodada validada. O aceite do próximo hash incorpora
somente o pipeline atual, mantendo as três identidades anteriores explicitamente
revisadas. A lista anterior fica intacta e `HASH_TALK_MODERATION_ACCEPTED_NEXT_HASH`
recebe a identidade nova; a release anterior ignora esse campo quando usa a lista,
conservando compatibilidade de rollback. Não ampliar a lista para hashes arbitrários.

Usar o executor existente a partir de commit integrado, enviado e com CI integral
aprovada. Conferir a configuração em leitura, guardar cópia privada e preparar o
aceite exato antes do comando `npm run deploy:staging`. Esta transição do detector
não altera migrações, a versão pública de formato/pinturas `v2`, aprovações antigas
ou prazos. Novas análises usam somente a identidade atual; decisões anteriores
permanecem registradas, incluindo os itens retidos para revisão prevista.

**Ponto importante:** aceite exato e saúde dos processos não estabelecem precisão
universal. Preservar os controles de release, a infraestrutura do outro projeto,
a proteção de conteúdo aprovado e o rollback da conta documentado acima.

## Modularização do chat — autorização de 12/10/2026

O proprietário pediu executar os cortes do plano temporário e ativar na VPS ao concluir. Integrar somente o trabalho deste chat a partir da release `50ea4c9`; a branch independente com outras alterações não entra neste deploy. Revalidar a main remota antes do push e conferir o diff da release. Contratos e escopo em [Bloco 07](BLOCO_07_MENSAGENS.md#organização-interna-do-chat--12102026).

Exigir checkout limpo/enviado e CI integral do commit exato. Reusar `npm run deploy:staging`, build no Mac, verificações de preservação, prontidão dos serviços próprios e rollback já existentes. São mudanças apenas de organização do cliente e testes/documentação; conservar as 61 migrações, backend, dependências, Node, infraestrutura e configuração ativa. Guardar recibos e acesso exclusivamente em `.local/`.

**Ponto importante:** a autorização cobre esta release do chat. Não autoriza incluir a outra branch, trocar o detector de moderação, migrar banco ou alterar serviços compartilhados.
