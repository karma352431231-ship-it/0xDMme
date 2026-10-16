# Perfil público individual e feeds — 10/10/2026

## Discovery module extraction — owner approval on 15/10/2026

The owner approved extracting the existing discovery screen after saving a
verified source checkpoint, including the original checkout's uncommitted work.
The checkpoint and recovery evidence stay private in `.local/`. This work uses
an isolated branch based on current main; it does not edit another session's tree.

First record the existing ranking and refresh-pill behavior in tests, then extract
ranking presentation into `ranking-view.ts`, followed by feed cards into
`feed-card.ts`. Keep filters, loading, cursors, snapshot comparison, session
generations, cancellation, deduplication and media disposal in `discovery.ts`.
Cards reuse the existing voting, reply, sharing, following, preference and
management modules. Pass explicit action/lifetime contracts; do not distribute
the coordinator's mutable state among renderers.

This supersedes the earlier proposal in this document to extract feed
loading/pagination into `discovery-feed.ts` for this task. No rules, copy, routes,
styles, dependencies, backend or schema change. Preserve English and Simplified
Chinese presentation, ranking positions across pages, identical-page node reuse,
late-result rejection, feed return and resource cleanup. Each extraction is a
separate commit after the preceding checks and CI pass; compare full-page and
split-layout previews at desktop and phone widths before any publication.

The remaining coordinator still encloses filters, mounting and page lifecycle in
one large closure. Do not add new screen responsibilities there. A separate
future task can extract `discovery-filters.ts` first and the screen frame into
`discovery-shell.ts` second, leaving request/pagination/session ownership in the
coordinator. Preserve topic/order/period callbacks, search cancellation, guest
gates and mount/leave ordering; verify those contracts and responsive layouts
after each extraction. These further moves are outside the approved two extractions.

**Ponto importante:** a source checkpoint allows code recovery; it is not a
database or VPS backup. This refactor does not change live data or activate a
release. Publication, if requested, uses the existing deployment executor and
the integrated commit's CI and code rollback.

Direção aprovada pelo proprietário. A página pública por `@` reúne somente identidade e atividade públicas. Publicações continuam dentro de comunidades; o perfil apresenta as mesmas publicações e respostas, sem copiar conteúdo ou criar um mural pessoal independente.

## Interações nas publicações — ajuste de 10/10/2026

O proprietário solicitou votos e respostas diretamente nos cards da atividade, como na comunidade. Reutilizar operações assinadas, compositor com anexos e controles de salvar, ocultar, denunciar e opções da publicação. Responder a uma resposta conserva seu pai direto e sua comunidade. Seguir a comunidade não é requisito para participar; arquivamento, sanções e autorização continuam verificados pelo servidor. Visitantes recebem entrada para autenticação e podem abrir a discussão publicamente.

A sequência visual é **Título → Conteúdo (texto e mídia) → Tag → Ações**, também nos cards do feed e da comunidade. Votos atualizam só o placar/contagem do card, preservando uma resposta em edição. Permissões são revalidadas quando a pessoa usa os controles. Desde o ajuste de 12/10/2026 abaixo, páginas assinadas também projetam votos/compartilhamentos do leitor em lote na leitura inicial; visitantes continuam sem esses campos. Um envio aceito mantém confirmação e link da resposta mesmo se a rechecagem da contagem falhar. A página bloqueia a atualização automática do app durante operações e rascunhos de resposta.

**Ponto importante:** responder pelo perfil publica na discussão original; não cria uma publicação pessoal nem concede participação por seguir o perfil. A correção não altera banco, migrações, dependências ou infraestrutura.

Revisão de responsabilidades: `activity-posts.ts` concentra os controles dos cards da atividade; `post-reply.ts` é o compositor compartilhado necessário a esta correção. Os closures existentes de `posts.ts` e `discovery.ts` continuam hotspots; a lógica do perfil ficou no módulo novo. Proposta para tarefa separada: extrair primeiro leitura/paginação da árvore para `post-thread.ts` e renderização para `post-card.ts`; depois separar leitura/paginação do feed em `discovery-feed.ts` e ranking em `ranking-view.ts`. Validar gerações/cancelamento, cursores, descarte de mídia e permissões com as integrações e os testes de snapshot. O principal risco é atualizar uma tela antiga ou conservar recursos após sair dela.

## Escolha de seguir no feed mobile — 12/10/2026

O proprietário escolheu manter o botão compacto “+ Seguir” nos cards do Feed e
Seguindo. Até 700 px, tocar abre um popup com a comunidade e o autor, identificados
pelo nome e pelo `@`; só a escolha explícita altera o vínculo correspondente.
Consultar estados privados apenas ao abrir, com as operações assinadas existentes.
Mostrar “Deixar de seguir” para vínculos existentes; o próprio perfil e um autor
indisponível não podem ser seguidos. Fechar, tocar fora ou sair da tela cancela a
escolha. Desktop e os controles da comunidade e do perfil conservam seu fluxo.

**Ponto importante:** seguir comunidade e seguir autor são escolhas independentes.
Esta etapa não altera ordenação ou distribuição de respostas na timeline. As
correções ficam no Git, sem sincronização de fontes ou ativação na VPS.

Validação local: 20 testes de perfil/follow/feed/tema, lint, tipos, fronteiras,
licenças, formatação e build web passaram. A conferência em Chromium usou cards,
controladores assinados e validadores reais com transporte/dados fictícios:
320/390/700 px com escolha independente, seguir/deixar de seguir, cancelamento,
toque fora, Escape, erro e saída durante leitura; 701/1.280 px com ação direta;
próprio perfil/autor removido, visitante e Seguindo. Nenhuma carteira ou conta
real foi usada; evidências ficam em `.local/`.

Responsabilidades: o popup e seu estilo ficam em `feed-follow-choice.ts` e
`feed-follow.css`; o controle em `feed-follow.ts` e o acesso social em
`public-profile/follows.ts`. Os hotspots existentes recebem apenas a ligação.
Para tarefa separada, extrair primeiro paginação/leitura para `discovery-feed.ts`
e depois ranking para `ranking-view.ts`; em `startCommunities`, separar diretório
para `community-directory.ts` e depois detalhe/governança para `community-page.ts`.
Riscos: respostas de uma geração antiga, cursores, descarte de mídia e ciclo das
DMs. Validar snapshots, paginação, navegação/saída, sessão e permissões após cada
extração, sem misturá-la ao seletor.

## Perfil e métricas

**Atualização de 15/10/2026:** Posts e Respostas passam a ocupar separadamente as
duas primeiras métricas. O contador de conversas geradas deixa de aparecer; o
contrato antigo do resumo é preservado para compatibilidade. Até três comunidades
seguidas mostram foto e nome diretamente. Acima disso, conservar até cinco fotos
e a lista paginada, com botão compacto de texto em uma linha. Essa regra substitui
a compactação incondicional descrita em 12/10/2026. Seguidores em comum de usuários
já usam a direção visitante → pessoa seguida → perfil visitado, com leitura
assinada, paginação e bloqueios bilaterais entre os três participantes.

DM pelo `@` passa a abrir diretamente, sem solicitação/aceite ou follow. O endpoint
legado de pedido abre a conversa; aceitar também permanece compatível. Recusar um
pedido legado informa que esse fluxo foi desativado e orienta usar Bloquear, sem
simular uma recusa que permitiria mensagens. Abrir promove pedidos/recusas antigos
sem bloqueio uma vez, sem reescrever relações já abertas. Não apaga histórico nem
remove bloqueios. E2EE, dispositivos/chaves disponíveis, cotas, mídia permitida,
recibos e consentimento do chat por wallet permanecem.

**Ponto importante:** só DMs pela identidade pública dispensam aceite; isso não
expõe mensagens ao público nem compartilha identidade/dados do perfil privado.

Validação local: verificação completa (lint, tipos, fronteiras, licenças,
formatação, idiomas, build e testes), 33 integrações de perfil social/controles/DMs
em banco temporário exclusivo e nove regressões finais do cliente, incluindo
troca de conversa antes de abrir uma DM. Prévia sintética no navegador a 320 e
1280 px confirmou métricas, nomes imediatos, expansão/recolhimento e ausência de
rolagem horizontal. O botão View names mediu aproximadamente 98 × 36 px a 320 px.
Não substitui aceite em aparelho físico nem implica publicação na VPS.

Revisão de responsabilidades: `public-profile/page.ts` e `communities/dms.ts`
continuam hotspots. Esta alteração reduz suas regras existentes; abertura de DM
fica em `dm-opening.ts` e a persistência da abertura em `social-conversations.ts`.
Separação futura, em tarefa própria: primeiro identidade/ações do cabeçalho em
`profile-header.ts`, depois abas/paginação em `profile-activity.ts`, deixando a
página coordenar o ciclo de vida. Nas DMs, separar montagem/ciclo de vida antes de
histórico/mídia. Riscos: respostas antigas, permissões, rolagem e descarte de URLs;
validar navegação, snapshots, bloqueios, rascunhos, E2EE e limpeza em cada corte.

- Visão geral combina posts, respostas e compartilhamentos por data; Posts e Respostas filtram apenas o conteúdo escrito pelo perfil. Respostas conservam comunidade, postagem original e destino da resposta. Conteúdo excluído/retirado e respostas cujo original não está visível não compõem atividade ou métricas públicas.
- Posts mostra o total de posts elegíveis do perfil.
- Respostas mostra o total de respostas elegíveis do perfil.
- Idade conta a criação do perfil público, não o início da conta privada. Registrar futuras criações; manter desconhecida nos perfis existentes, sem usar primeiro post, UUID ou data da migração como idade.
- Comunidades mostra o total e a lista completa das comunidades seguidas, paginada. O proprietário escolheu esta exposição mesmo sem publicar nelas. Esta regra substitui a lista privada dos cortes 3/6 de comunidades; salvos, ocultos e votos individuais mantêm a proteção anterior.

Seguir perfil usa identificador público estável, nunca o `@` reutilizável como vínculo durável. Exige conta/perfil e aparelho autorizados, é reversível e idempotente com revisão. Não concede DM, não cria aviso de follow e não expõe listas de seguidores/perfis seguidos a visitantes. Contador agregado de seguidores pode acompanhar o botão sem substituir as quatro métricas.

Banner é uma imagem independente do avatar. Preparo PNG/JPEG/WebP no cliente, resultado PNG/JPEG sem metadados, até 3 MB/2.048 px, proporção preservada nos bytes. Exibição ocupa faixa com recorte visual central. Candidato restrito ao dono, hash/alvo/revisão vinculados à análise; URI conhecida não libera pendente/rejeitado/expirado. Remoção, troca e nova política invalidam a referência anterior. Aplicar retenção, contestação, capacidade global e coleta já existentes; sem acesso a dados privados.

Descrição (10/10/2026, pedido do proprietário) é texto do próprio dono, público assim que salvo, como o `@`: até 280 caracteres e cinco linhas, texto e emoji com menções internas a usuários/comunidades desde 12/10/2026 (demais marcações e URLs da descrição continuam literais). Quebras são normalizadas, sequências de linhas em branco viram uma, e caracteres invisíveis que escondem ou invertem texto são recusados; o joiner de emoji é aceito. Fica em tabela própria (migração 053) com revisão contra edição concorrente entre aparelhos e cobrança na capacidade global, no mesmo molde do banner. Não passa por análise automática: o plano não modera texto público automaticamente, e a descrição segue a regra do `@`.

Revisão de 11/10/2026: tocar no banner/foto ou editar a descrição prepara um rascunho local; só “Confirmar alterações” envia. A prévia mostra a cópia do dono, inclusive arquivo em análise após confirmação. Avisos aparecem só quando o arquivo fica fora do público (recusado, incerto, falha, prazo encerrado). [Contrato atualizado](CONTROLES_SOCIAIS_E_BADGES.md).

## Feed e Seguindo

**Revisão aprovada em 11/10/2026:** Postar abre um diálogo sobre a timeline: primeiro escolher a comunidade (seguidas ou todas), depois usar o formulário completo compartilhado de título, texto, tag e mídia. Dentro da comunidade, o diálogo abre com ela selecionada. Fechar, clicar no fundo ou Escape exige confirmar **Descartar** se existir qualquer texto, inclusive um caractere, tag ou arquivo; Continuar editando conserva o rascunho. Durante o envio, o diálogo aguarda o resultado e conserva o ID para retries. Não persistir rascunhos por este fluxo.

Abrir um post por Descobrir/Seguindo conserva em RAM filtros, cursor da página, posição e post de referência. Voltar pelo botão do post ou pelo histórico relê a página no servidor e restaura a posição, inclusive após a chegada das imagens. Se a referência tiver sido removida, conservar a posição possível sem exibir conteúdo retirado. Escolher Feed/Descobrir/Seguindo explicitamente, mudar filtros ou F5 reinicia o feed. Troca de sessão descarta o retorno; a compensação de layout termina ao interagir, sair ou após 15 segundos.

Na aba Mensagens @, a lateral lista conversas públicas no lugar de Seguidas, que pertence à aba Comunidades. Miniperfis por foco/ponteiro exibem a descrição pública e o banner em miniatura: imagem aprovada no perfil individual e na comunidade, com faixa gerada como padrão. A prévia reutiliza o banner aprovado já existente de cada entidade; a comunidade sem imagem mantém sua faixa gerada, sem armazenamento novo.

**Ponto importante:** bloqueio automático de um anexo retira o post/resposta inteiro das listas públicas e dos feeds de todos; o permalink conserva só marcador. O autor mantém acesso restrito para corrigir ou contestar. Essa decisão substitui a exposição pública de texto junto de mídia bloqueada prevista nos cortes anteriores, sem mudar retenção. Nenhum detector, migração, dependência ou serviço da VPS é ativado nesta revisão.

Feed principal: publicações recentes das comunidades em geral, replies elegíveis e posts públicos em alta, com os limites aprovados em 12/10/2026 abaixo. Ordenação Destaques determinística e paginada, sem duplicar o mesmo ID; os atalhos Recentes/Mais votados/Mais comentados continuam disponíveis. A prioridade inicial combina `1 + ln(1 + max(placar, 0) + atividade da discussão)` com bônus 3 para autor seguido, dividido por `(2 + idade em dias)^1,5`; escala inteira de um milhão para o cursor. Considera engajamento público atual e decaimento pela idade da publicação, sem alegar timestamps de votos históricos, perfilar leitores ou divulgar votantes. Não é ranking de pessoas, selo de qualidade ou proteção completa contra coordenação. Parâmetros são escolha técnica inicial para avaliação, não promessa de personalização por aprendizado.

Seguindo: posts originais das comunidades seguidas **ou** posts de perfis seguidos, mesmo em comunidades não seguidas; replies entram uma vez por original, o mais antigo entre autores seguidos, conforme o ajuste de 12/10/2026. Uma publicação que corresponde aos dois caminhos aparece uma vez. Respostas exigem original público elegível. Ocultações pessoais continuam retirando itens dos feeds pessoais; salvos/ocultos mantêm seus acessos próprios. Sem seguir nada, Seguindo mostra estado vazio; leitura pública do Feed permanece disponível sem conta/perfil.

Consultas limitadas e projeções em lote. Cursores de atividade vinculam perfil, aba e corte temporal; os de feeds vinculam filtros e corte temporal. Feeds pessoais vinculam também a identidade pública do leitor, sem incluir a identidade privada da conta. A lista de comunidades pagina por UUID da comunidade. Não guardar cópias de conteúdo excluído, inventar histórico ou varrer todo o histórico por item. Métricas seguem conteúdo atual e não prometem snapshot histórico durante paginação.

**Ponto importante:** tornar as comunidades seguidas públicas é mudança de privacidade explicitamente aprovada. A gestão do perfil deve informar essa exposição. A data antiga não comprovada continua desconhecida. Implementação e migrações locais não autorizam ativação na VPS; publicação do banner conserva a exigência de scanner aceito.

## Implementação local e validação

A página usa `#publico?handle=...`, com abas e listas paginadas. A gestão em Perfil mantém avatar e banner separados. Rotas públicas novas `/page`, `/activity` e `/communities` conservam o contrato compacto anterior em `/api/public-profiles/:handle`; operações de seguir e editar banner passam pela sessão e prova assinada do aparelho. Consultas não projetam identidade privada, carteira ou dados de chat.

Migrações 051 e 052 adicionam idade comprovada para futuras criações, vínculos de seguir perfis, candidato de banner com cobrança de capacidade e índices para atividade por autor/conversas com respostas. A 052 mantém imutável a 051 já aplicada no banco local de testes. A migração 050 e as alterações de moderação de vídeo já estavam em andamento antes deste trabalho; não foram substituídas nem ativadas aqui. Em 10/10/2026 o proprietário autorizou incluir somente o SQL 050 com default `before`, preservando a sequência já usada localmente; as novas regras e o detector de vídeo ficam fora da release. A transição 049→052, backup e manutenção próprios foram especificamente autorizados para publicação com CI integral aprovada, conforme [Git e envio à VPS](GIT_E_DEPLOY.md#página-pública-individual--publicação-autorizada-em-10102026).

Na preparação isolada da publicação, passaram 18 testes unitários e 27 testes de integração relacionados, incluindo autorização/revisão/idempotência de follows, atividade em comunidade não seguida, comunidades públicas sem posts, idade antiga desconhecida, exclusão do original, salvos/ocultos, isolamento dos cursores, página cheia de respostas aninhadas, banner pendente/aprovado/removido e expiração com liberação de bytes. As integrações usam banco novo e exclusivo, removido ao finalizar. Lint, tipos, fronteiras, licenças, formatação e build web também passaram. A projeção de até 48 ancestrais respeita o limite de 24 posts por leitura em até dois lotes.

Conferência visual com dados fictícios e componentes reais: desktop de 1.280 px e larguras móveis de 390/320 px, quatro métricas, abas, seguir/deixar de seguir e preparo/remoção de banner. Teste de interface usa API sintética; não substitui aceitação com carteira/aparelho real nem validação do scanner de produção. Evidências ficam em `.local/`, fora do Git.

Na preparação da publicação, uma nova prévia com componentes reais confirmou que avatar e `@` do autor abrem a página individual, com as quatro métricas, comunidades, abas e seguir/deixar de seguir. As respostas conservam o link da discussão e o contexto da comunidade. A entrada do avatar na comunidade agora é um link com nome acessível.

## Feed e árvore de discussão — critérios aprovados em 12/10/2026

- Descobrir → Destaques conserva posts originais seguidos e não seguidos. Replies só entram com pelo menos cinco votos líquidos ou três outros perfis participantes na sua ramificação. Entre elegíveis, autor seguido recebe o bônus existente. Selecionar apenas um reply por original/autor antes do cursor; salvos, ocultos e atividade do perfil conservam seus contratos próprios.
- Seguindo conserva posts originais elegíveis e apenas um reply por original: o mais antigo entre autores seguidos, inclusive em comunidades não seguidas. Um original não elimina seu reply representante. Ocultações e filtros são aplicados antes dessa seleção.
- Dentro da discussão, comentários diretos começam em Mais discutidos; opções Mais votados, Recentes e Mais antigos. A atividade inclui todos os descendentes visíveis e atribuídos, excluindo o próprio autor do comentário: primeira contribuição de cada outro perfil vale cinco pontos, segunda vale mais um, demais repetições não acrescentam pontos. É uma escolha técnica inicial que prioriza diversidade, sem alegar resistência a contas coordenadas.
- Respostas dentro de cada ramificação priorizam o maior placar líquido de votos, conforme a correção esclarecida pelo proprietário em 12/10/2026; empates seguem data mais recente e ID. A árvore preserva quem respondeu a quem, com linhas de parentesco, recolher/expandir e outras respostas em grupos de três. Páginas de comentários têm 24 itens. Profundidade inline de três níveis e orçamento de 120 nós por tela conservam acesso aos demais replies pelo link Continuar este fio, que abre a subdiscussão inicialmente em Mais votados. Recolher descarta mídia e a página da ramificação. Votar atualiza o placar sem descartar a árvore ou o texto em edição.
- Migração 062 mantém agregados por ancestral/perfil na mesma transação das alterações, com cobrança de 256 bytes por par no ledger global, sem cópia de texto, histórico de leitores ou posições individuais de voto. Leituras usam agregados; custo de escrita e backfill cresce com a profundidade da árvore. Revisar volume/capacidade e duração do backfill antes de qualquer ativação.
- Cursores novos vinculam comunidade, pai e ordenação; o endpoint sem `order` conserva paginação anterior. Placar e atividade permanecem vivos, portanto mudanças de engajamento entre páginas podem mover itens; não é snapshot histórico imutável.

**Ponto importante:** implementação e validação locais; fontes e migração não devem ser enviadas ou ativadas na VPS nesta etapa. Aceite visual em aparelho real e desempenho com volume real ficam pendentes.

A nova responsabilidade de árvore está em `post-thread.ts`/`post-thread.css`, e seleção/ranking em `community-feed-policy.ts`; conexões pequenas nos hotspots existentes. Em tarefa separada, extrair renderização/ações do card para `post-card.ts`, depois leitura/paginação do feed para `discovery-feed.ts` e ranking visual para `ranking-view.ts`, nessa ordem; testar gerações, cursores, descarte de mídia e autorização. Não dividir os closures completos nesta alteração.

Validação local: nove contratos unitários e 51 testes de integração relacionados, incluindo migração/backfill, ledger, moderação/restauração, exclusão de conta, autorização, deduplicação anterior ao cursor e empate de IDs entre perfil/post. Prévia com componentes reais em Chromium a 320, 390 e 1280 px: ramos, votos com rascunho aberto, outras respostas, limite de 120 nós, seletor após falha e navegação durante leitura. Lint, tipos, fronteiras, licenças, formatação e build verificados. O pacote de fontes inclui o novo módulo compartilhado; o empacotamento USTAR/gzip da main conserva todas as fontes, seguindo a remoção já aprovada do teto individual de 2 MiB. Esses ensaios sintéticos não substituem aceite no aparelho nem medição com volume real.

## Respostas, comunidades do perfil e menu "..." — 12/10/2026

Pedido do proprietário: diferenciar post de resposta, mostrar o post respondido ao abrir uma resposta, resumir as comunidades seguidas com fotos e melhorar o visual do menu "...".

- **Resposta nos feeds e no perfil:** perde o título genérico "Resposta" e ganha o selo **↩ Resposta** ao lado do `@`. Acima do texto aparece "Em resposta a @…" e o post respondido inteiro (título, texto com "Ver tudo" e mídia), num quadro destacado que abre aquela postagem. Quando a resposta é a outra resposta, há também o link para a postagem original. Usa o contexto que o servidor já enviava (`context.root` e `context.parent`, completos), sem leitura nova.
- **Resposta aberta:** a tela da discussão mostra o post respondido acima da resposta, lido do mesmo jeito que a resposta (leitura pública para visitantes, leitura assinada para membros). O link "↑ Resposta anterior" saiu, porque o próprio quadro leva até lá; "Postagem original" continua quando há mais de um nível. Falha nessa leitura mostra um aviso e mantém a resposta legível.
- **Comunidades do perfil:** até 5 fotos e um botão **+N** com o restante (a partir do total do perfil). Ele abre a lista completa com foto e nome; "Mais comunidades" lê a próxima página do endpoint público e "Mostrar menos" volta ao resumo. Comunidade sem foto mostra as iniciais.
- **Menu "...":** painel flutuante ancorado na linha de ações (não passa da borda do card nem no celular), com ícones, ações destrutivas em vermelho, divisor entre as ações de quem vê e as de autor/moderação e seta nos itens que abrem formulário. Os formulários (denunciar, editar, excluir, ocultar pela moderação) abrem dentro do painel, com campo de 16 px e botão à direita. Vale também para o "..." do cabeçalho do perfil.

Arquivos: `communities/reply-context.ts` e `.css`, `communities/post-menu.css`, `public-profile/communities-panel.ts`, mais ligações curtas em `activity-entry.ts`, `discovery.ts`, `posts.ts`, `discovery-controls.ts`, `post-forms.ts`, `social-controls.ts` e `page.ts`. Sem mudança no servidor, banco ou permissões.

Validação: lint, tipos, limites de módulos, formatação, build e testes unitários (um teste novo cobre o card de resposta: selo, post respondido antes do texto e links para a resposta respondida e para a original). Prévia local com dados fictícios e o CSS real conferiu o card, o painel compacto e expandido e o menu com formulários. A tela de resposta aberta com servidor real não foi vista; ela reutiliza o mesmo quadro.

`posts.ts` (um `startCommunityPosts` de cerca de 870 linhas) e `discovery.ts` continuam hotspots; aqui receberam só chamadas aos módulos novos. A proposta de divisão registrada acima segue válida.

Na revisão para publicar em 12/10/2026, o menu do cabeçalho escapava para fora da tela em 320 px quando os botões quebravam de linha; o recorte do cabeçalho também escondia a segunda ação. O painel agora se ancora no grupo de ações e limita a largura ao próprio grupo. Com o menu aberto, o cabeçalho deixa as opções aparecerem abaixo; o próprio banner conserva seus cantos arredondados. Conferir a expansão das comunidades e o menu aberto em desktop e celular antes da ativação.

## Compartilhamento, atalhos e seleção de interações — 12/10/2026

Pedido do proprietário: compartilhar ao lado de responder, publicar a referência no próprio perfil e distinguir visualmente quem compartilhou do autor original. A Visão geral mostra apenas o selo **Compartilhou** acima do original numa moldura cinza, sem a legenda repetida “Postagem compartilhada”, conservando autor, mídia, edição e link da discussão. Compartilhar de novo retira a referência. Cada par perfil/post tem uma referência com revisão CAS; repetições da mesma operação não duplicam a atividade nem a cobrança global de 256 bytes. Não há cópia do texto, arquivo ou histórico, nem expiração da referência. Excluir/retirar o original e bloquear o autor fecham a exibição correspondente. Compartilhamentos não aumentam métricas de autoria nem entram nas abas Posts/Respostas.

Votos e compartilhamentos próprios são carregados em lote nas leituras assinadas do feed, perfil, discussão e respostas. Leituras anônimas não recebem os campos do leitor. Somente os ícones de upvote e compartilhar ativos ficam brancos, sem mudar o fundo dos botões; downvote ativo fica vermelho alaranjado. As operações continuam assinadas e revalidam autorização/revisão no servidor.

Ao lado de **Postar**, o cabeçalho compartilhado das comunidades oferece foto pública com link para o próprio perfil, tanto dividido quanto isolado. Sem foto usa as iniciais públicas; sem perfil público o atalho fica oculto. A leitura desse atalho não sobrescreve uma edição do perfil que esteja em andamento.

Migrações 059/060 criam as referências, sua contabilização/índice de atividade e o índice dos seguidores que ativaram o sininho. Nenhuma migração ou ativação na VPS faz parte da implementação local. Os hotspots `posts.ts`, `discovery.ts` e `app/index.ts` recebem integrações pequenas; compartilhamento, moldura, atalho e decisão de atualização ficam em módulos próprios. Segue a proposta de separar leitura/paginação/renderização dos dois primeiros em tarefa própria; para `app/index.ts`, separar montagem do Perfil e coordenação da sessão depois, validando login/logout, rotas, rascunhos e cancelamento de leituras.

**Ponto importante:** compartilhar expõe a referência no perfil público; a autoria e o controle do conteúdo continuam com quem publicou o original.

Validação local deste ajuste: 550 testes unitários e 28 integrações relacionadas aprovados, incluindo CAS/idempotência/cobrança, leitura privada dos controles, edição e exclusão do original, bloqueios, preferência por aparelho, push, vínculo e chamadas. Lint, TypeScript, limites de módulos, licenças, formatação e os três builds passaram. Também passaram 193 testes do executor de deploy e 48 da avaliação/coleta, sem executar deploy. O smoke com servidor e wallet fictícios conferiu Perfil visitante, login, atualização explícita em mobile/desktop, atalho nos modos dividido e isolado, compartilhamento no perfil e cores ativas. O refinamento solicitado em seguida retirou o fundo da seleção e a legenda repetida; lint, tipos, fronteiras, formatação, build e 12 testes do cliente passaram novamente, com conferência visual em desktop e 390 px sem rolagem horizontal. Evidências somente em `.local/`. Push no SO e abertura pela câmera física ainda precisam do teste no aparelho após publicação.

**Ajustes de 12/10/2026:** fotos/GIFs aprovados carregam bytes completos ao se aproximar da tela, sem miniatura esticada. Sair da área aborta leituras e libera URLs; clicar abre ampliação local com ajuste à tela/zoom, Escape e botão Fechar. Vídeos mantêm seu fluxo próprio. Texto do feed usa o mesmo primeiro plano do post aberto, sem alterar a moldura do original compartilhado. Troca entre prévias de perfil/comunidade descarta o timer de fechar anterior. Seguidores em comum mostram pessoas que o visitante segue e que seguem o perfil visitado; resumo de três fotos/@ com contagem e lista paginada de 24 por chamada assinada. A projeção respeita bloqueios bilaterais entre os três participantes e não entra no resumo anônimo/cache de hover. Reutiliza os índices/identidades moderadas existentes, sem nova tabela para follows. Módulos próprios para imagens, privacidade, seguidores em comum e leitura das DMs; hotspots de app e tela de DMs recebem somente integração pontual. Divisão posterior sugerida para DMs: sessão/navegação, projeção de conversa e ações de consentimento, com testes de preservação de mídia/scroll.

Validação local deste lote: 554 testes unitários, 50 integrações dirigidas únicas (perfil social, mensageiro e DMs), lint, tipos, fronteiras, licenças, formatação e build. No navegador loopback com contas/mídias sintéticas: foto de 1.280 px sem filtro, ampliação/zoom/fechar, foto/@ em seguidores em comum e Preferências de leitura salvas na categoria Privacidade, incluindo 390 px. Não substitui aceite em aparelhos físicos. Evidência visual e dados temporários ficam exclusivamente em `.local/`. Migração 061 e as anteriores deste lote ainda não aplicadas na VPS.

**Listas e editor — 12/10/2026:** clicar no número/texto de seguidores da comunidade abre uma página própria com Todos os seguidores e Perfis que você segue. Não adicionar um botão separado. Todos são públicos; a aba personalizada exige sessão assinada e cruza follow do visitante com membership da comunidade. Paginação de 24, projeção de fotos moderadas/@, sem wallet/nome privado. Leitura assinada omite bloqueios bilaterais; a comunidade mostra também uma prévia de até três perfis em comum. Clipe e GIF ficam no canto inferior direito da área de texto de posts, edição e replies, inclusive feed e perfil público. O catálogo externo é KLIPY, sujeito à configuração e ao consentimento existentes; a escolha acrescenta o link ao rascunho e não publica. Leitores só carregam GIFs com sua própria preferência. Menus de mensagens privados/grupos e DMs pelo @ são compactos, ancorados e não modais; ações e autorização continuam próprias de cada contexto. Na DM pelo @, o menu novo oferece a cópia do texto/legenda, preservando a ausência das ações privadas ainda não implementadas ali.

Validação deste lote: 557 testes unitários, 21 integrações dirigidas, 197 testes do executor e verificações de lint/tipos/fronteiras/licenças/formatação/build. Navegador sintético: clique na contagem abre a lista, menus privados e pelo @ abrem junto à mensagem sem modal, clipe/GIF dentro do editor. A fixture de atualização da comunidade ganhou os contratos do DOM usados pelo editor; os testes de rascunho e respostas atrasadas continuam ativos. CI integral e aprovação específica das migrações são requisitos para ativação, ainda não comprovada por esta validação.

**Encaixe da ampliação — 12/10/2026:** a abertura do visualizador usa uma grade com barra de altura automática e região `minmax(0, 1fr)`. A grade da imagem também tem trilhas limitadas, eliminando a altura intrínseca que antes fazia uma foto de 913 px ultrapassar os 602 px disponíveis. Foto centralizada e inteira, proporção preservada, controles dentro da tela e reajuste por CSS ao redimensionar/orientar. O modo Ampliar mantém rolagem interna para detalhes; Ajustar à tela retorna ao encaixe. Correção restrita ao stylesheet do visualizador.

Regressão visual conferida no navegador com o CSS compilado e imagens sintéticas verticais/horizontais: 1280×720, 390×844 e 844×390, redimensionamento com o visualizador aberto, zoom e retorno ao encaixe. Antes, a imagem tinha 913 px numa região de 602 px; depois, cabe nos 606 px disponíveis no desktop e em 332 px de largura no mobile, sem rolagem no modo de encaixe. Lint, tipos, fronteiras, formatação e build aprovados. Não muda SQL, dependências, conteúdo ou leituras de mídia.

**Foto do atalho e texto — 12/10/2026:** o atalho público só coloca iniciais se não houver avatar; sua grade limitada mantém a foto inteira dentro do círculo. O corpo `.community-text` usa `--post-text` em todos os contextos, com seletores próprios que prevalecem sobre o cinza antigo do feed dividido e as cores do post aberto. Títulos e metadados conservam sua hierarquia; a moldura cinza dos compartilhamentos permanece. Limite do título segue em 200 caracteres, conforme a correção posterior do pedido pelo proprietário. Sem migração nova.

Validação do refinamento: 15 testes direcionados (perfil, temas e contrato do título), lint, tipos, fronteiras, formatação e build. Regressores do avatar conferem os dois atalhos, ausência de iniciais quando existe foto, fallback sem foto e liberação dos URLs ao trocar. Navegador em 1280 px e 390 px: corpo `rgb(224,224,229)` consistente nos três modos do tema Preto, título `rgb(244,244,245)`, foto ocupando 38×38 px sem texto sobreposto. A correção de encaixe permanece no mesmo pacote; título/API/SQL continuam em 200 caracteres.

## Integração de feed/postagem e discussão — 12/10/2026

O proprietário pediu revisar o feed/postagem pendente, juntar com este chat e atualizar a main para envio à VPS. Isso substitui a restrição anterior de manter este lote somente no Git. A base publicada é `e22b5e3`; preservar seus bloqueios, votos/compartilhamentos privados, tags múltiplas, descrição/banner, moderação sem julgamento de pose e organização modular da sincronização.

O compositor usa o formulário vigente (título, até cinco tags e mídia), conserva o consentimento de GIFs externos do Perfil, detecta rascunhos também nos chips/miniaturas e conserva botões originalmente indisponíveis durante envios. Prévia de perfil/comunidade usa o único controlador de hover existente. Os ramos consultam a API assinada quando autenticados, preservam a página/árvore quando a resposta é idêntica e continuam ordenando seus filhos pelos votos. Leituras públicas não recebem votos individuais.

A migração 062 conserva 001–061 byte a byte, cria os agregados/participantes e liga o bloqueio de anexos ao engajamento: retirada automática desconta a contribuição; aprovação ou substituição válida pode restaurá-la. Backfill visita ancestrais uma vez e cobra 256 bytes por relação ancestral/perfil. O executor existente revisa a transição 061→062 com fontes exatas, hashes das linhas antigas, ledger esperado, contadores/participantes reconstruídos, backup e rollback.

**Ponto importante:** preparar/enviar fontes e atualizar main não equivale a ativar a migração. Em 12/10/2026 o proprietário aprovou explicitamente ativar o pacote completo, incluindo a transição 061→062. Conservar volume/capacidade revisados, CI do commit final, backup com ensaio de restauração e rollback, e manutenção breve somente nos serviços próprios. Aceite em aparelhos reais e desempenho com volume real continuam pendentes.

Validação da integração: análise estática, tipos, fronteiras, licenças, formatação e build; 605 unitários com o ensaio ZK repetido após preparar os artefatos fixados, mais a nova regressão de âncora; 200 testes de deploy com o Python 3.14 já instalado e 48 de moderação. Integrações dirigidas cobrem feeds/posts/votos, rankings, perfil social, retirada automática, backfill e o verificador real de preservação. No navegador sintético a 320/390/1280 px: compositor, descarte por texto/tag/arquivo, limite de tags, árvore, paginação, votos com rascunho, falhas e cancelamento. A conferência de GIFs no navegador confirmou zero consultas ao catálogo quando recusados e abertura depois do consentimento. O teste de mídia foi alinhado ao contrato aprovado: texto continua restrito ao autor após descarte, e corrigir o anexo não reabre reply de original excluído. A CI também revelou colisão da porta fixa nos ensaios HTTP de mensagens: esses dois listeners usam agora porta livre atribuída pelo sistema, com origem/Host correspondentes à porta atribuída, sem alterar o app. Os 27 testes de mensagens passaram com a antiga porta deliberadamente ocupada. CI do commit final e aceite físico continuam necessários. Hotspots remanescentes (`posts.ts`, `discovery.ts`, coordenador do chat) não receberam uma divisão ampla: propor depois separar leitura/renderização e operações do post, leitura/paginação do feed e composição/áudio do chat, em sequência com os testes de autoridade, rascunho e cancelamento.

## Seguidores no cabeçalho e emoji/GIF nas postagens — 12/10/2026

- **Cabeçalho da comunidade (proposta A, aprovada pelo proprietário):** a linha de seguidores fica dentro do bloco do nome, alinhada com ele, em vez de colada à borda do cartão. Mostra o número em destaque ("**2** seguidores", link para a lista) e, para quem está logado, os perfis em comum na mesma linha depois de um "·", no formato das redes sociais (referência do proprietário: X): até 3 avatares de 28 px sobrepostos e "Seguida por @a, @b e mais N que você segue", em cinza; o trecho inteiro abre a lista de seguidores. Frase longa termina em "…" para não quebrar a linha, com o texto completo no título. No celular os perfis em comum passam para a linha de baixo, sem o "·". A leitura assinada dos perfis em comum é a mesma de antes; falha mostra "Perfis em comum indisponíveis agora."
- **Emoji e GIF em posts e respostas:** o editor ganha o botão de emoji ao lado do GIF, como no chat. Os dois abrem o mesmo painel flutuante do chat (`EmojiPicker`), cada um na sua aba; o emoji entra no cursor do texto e o GIF entra como link numa linha própria. O painel embutido antigo, que perdia o estilo do chat, saiu. Sem KLIPY o painel de emoji abre normalmente, só sem a aba GIF; o botão GIF avisa que a busca está indisponível. Consentimento de mídia externa e envio continuam iguais: escolher só muda o rascunho.

Validação: lint, tipos, limites de módulos, formatação, build e testes unitários; o teste do editor passou a cobrir a abertura na aba certa, o GIF inserido sem publicar e o emoji no texto. Prévia local com dados fictícios conferiu o cabeçalho (desktop e largura de celular) e a abertura do painel; emojis e GIFs reais dependem do servidor e não foram vistos nesta prévia.

### Menções e avisos — 12/10/2026

Digite @ e ao menos duas letras no título/texto do post, reply ou descrição. Sugestões distinguem Usuário e Comunidade e mostram fotos públicas aprovadas; busca por prefixo limita oito de cada tipo, espera 250 ms e cancela a consulta anterior. Seleção conserva referência pública estável em texto próprio; o editor mostra só @nome. Edições fora da menção preservam a referência; editar o nome remove o vínculo. Links de usuário resolvem o UUID público antes do handle atual e verificam que a página ainda pertence a esse UUID. Perfil removido permanece indisponível mesmo se seu @ for reutilizado. URLs executáveis e outras marcações não viram links. Prévia não corta uma referência ao meio.

Nomes de comunidades são únicos conforme a decisão central; a migração 063 falha diante de colisões existentes. Data criada vem de communities.created_at (044), sem backfill inventado. A política global só é exibida como aviso de criação; a comunidade mostra regras locais específicas. Preto é o padrão, preservando preferências explícitas.

Postar usa fotos/nomes em cards e mantém o painel de emoji/GIF compartilhado com os chats. Avisos de publicações reconhecidos ao abrir continuam cinza na Atividade; a leitura individual controla o cinza, e novidades desde a abertura da caixa controlam o sino (revisão de 13/10/2026). Análises de moderação levam ao registro exato e à contestação, conforme o contrato de moderação. **Ponto importante:** migração/ativação deste lote pendentes na VPS.

**Hotspots para revisão própria:** startActivity (activity/index.ts) reúne snapshot, grupos e ciclo da tela; startCommunities (communities/index.ts) reúne diretório, gestão, navegação e sessão; startProfileEditor reúne mídia e descrição. Os novos seletores, leitura de aviso, análise e informações da comunidade têm módulos próprios. Uma tarefa separada pode extrair primeiro a projeção dos grupos da Atividade, depois snapshot/ciclo de sessão; separar diretório/gestão de comunidades em seguida e mídia/descrição do editor de perfil por último. Riscos: perder rascunhos, reaplicar respostas antigas e deixar mídia privada após troca de conta. Validar contadores/leitura, cancelamento, troca de sessão, descarte/continuidade de rascunhos e liberação de URLs antes de integrar.

### Contador de novidades e notificações de menção — 13/10/2026

O sino representa chegadas ainda não vistas na caixa. Abrir Atividade reconhece todos os IDs carregados e zera o sino imediatamente, com reconhecimento local por conta/aparelho limitado a 512 IDs. Isso não altera leitura individual, não aceita convites e não abre conteúdo. Ao sair e receber outro ID, o contador sobe novamente; abrir um item confirma a operação responsável e só esse item fica cinza. O corpo dos avisos e o link Abrir conduzem ao mesmo destino, preservando os controles internos. Sem botões de leitura em lote.

A aba Menções mostra “@autor mencionou você”, a origem (post, reply ou descrição) e uma prévia pública atual, sem cópia de conteúdo na tabela de avisos. Links selecionados para usuários geram aviso nos quatro contextos; links de comunidade não avisam toda sua audiência. Replicar a referência no mesmo texto não duplica, retry não recria e alteração que mantém a referência não zera a leitura. Autoaviso, perfis inexistentes e bloqueios não geram novo aviso; listagens escondem conteúdo com moderação/ancestrais ocultos. Remover a referência ou excluir sua origem retira a associação, sem retenção de texto antigo.

A listagem e abertura exigem a sessão/diretório/assinatura atual do destinatário. A migração 064 acrescenta índices de destinatário/origem, autovacuum vigente e cobrança global por registro. Página limitada a 24 com cursor estável; não há teto total arbitrário nem expiração automática. A conferência de avisos públicos existente passa a consultar moderação e menções juntas em aba visível; nenhum histórico privado participa. **Ponto importante:** execução e migrações deste lote ainda locais, sem envio à VPS.

Validação local desta revisão: 620 casos unitários; 14 verificações dirigidas em PostgreSQL 16.13 descartável, incluindo unicidade, autorização/leitura, moderação atual, paginação sem duplicação e rollback conjunto de origem/aviso; lint, tipos, fronteiras, formatação e build. No navegador sintético em 320/390/1280 px: sino zerado ao abrir a caixa sem avisos cinza, abertura pelo corpo/link, cinza apenas no escolhido, nova chegada após sair, reconhecimento preservado ao retomar a conta e ausência de ações em lote. Evidência apenas em `.local/`, sem dados de usuários reais ou ativação na VPS.

A caixa paginada antiga de Comunidades conserva as páginas, mas também abre e confirma só o aviso clicado; o botão “Marcar esta página como lida” foi retirado. A regra de cinza não tem mais uma exceção em lote nesse caminho.

**Correções de mídia e ramos — 13/10/2026:** foto no seletor de comunidade do compositor ocupa a moldura completa. GIF reconhecido aparece abaixo do texto, alinhado à esquerda e sem duplicar URL/legenda, inclusive nos avisos de publicação, em contexto de resposta, compartilhamento, atividade do perfil e mensagens com texto. A apresentação usa módulos próprios de reconhecimento e renderização no diretório gif-search; não acrescenta responsabilidades ao coordenador do chat. Reutiliza somente KLIPY e a preferência vigente, com link como alternativa se recusado/revogado/indisponível; fontes desconhecidas continuam links e não são consultadas. Fotos próprias usam a mesma posição abaixo do texto. Ramo sem filhos elegíveis informa indisponibilidade; votos/paginação e ocultação por moderação permanecem. **Ponto importante:** o exemplo reportado tinha um anexo retido por incerteza e outro aprovado, ocultando a resposta inteira. Não houve revisão do detector ou liberação de conteúdo neste lote. Os lotes anteriores de menções/notificações/seguidores foram ativados na release bc008dc; estas correções são posteriores. Hotspots posts.ts, discovery.ts e groups/index.ts recebem somente conexões pontuais. Proposta separada: extrair projeção/ações do post, leitura/paginação do feed e ciclo/projeção do grupo nessa ordem, validando rascunho, autorização, cancelamento, preservação de mídia e posição.

**Verificação da publicação — 13/10/2026:** a CI do commit 352f3d7 passou integralmente na branch do chat, mas a execução na main falhou ao iniciar o teste antigo de recuperação e ficou presa até o timeout. A reprodução local com a porta 45118 ocupada confirmou EADDRINUSE e conexões sem limpeza. A fixture usa agora porta atribuída pelo sistema, origem/Host correspondentes e limpeza registrada antes da inicialização; repetir o mesmo fluxo de recuperação com a porta antiga deliberadamente ocupada. Não muda o fluxo de recuperação da aplicação nem relaxa verificações. A credencial existente recusou a repetição isolada pela API do GitHub; exigir nova CI integral do commit final integrado antes da ativação.

## Responder no feed e na discussão — correção de 13/10/2026

O proprietário confirmou o comportamento: no feed completo ou dividido, Responder abre o compositor em popup e conserva o feed. O corpo do card abre o post; o botão separado Abrir discussão foi retirado por pedido posterior do proprietário em 13/10/2026. O feed autenticado estava usando ainda o link antigo de comentários; o compositor modal aparecia apenas depois de entrar na discussão. A ligação agora pertence a feed-reply.ts, com prévia do pai imediato e o formulário compartilhado. Depois de confirmar a resposta, mostrar confirmação/link e atualizar a contagem do pai; uma falha nessa consulta mantém a confirmação. Visitantes recebem entrada para autenticação no botão de responder e continuam podendo abrir a discussão.

Dentro da discussão, inline-post-reply.ts expande o formulário sob o post ou comentário escolhido. Recolher/cancelar conserva o rascunho para retomar; fechar a página descarta a interface e aborta seus recursos. IDs de tentativa, pai direto, assinatura, revalidação de participação e regras do servidor permanecem nas operações compartilhadas. Enquanto o popup está aberto, atualização automática do feed/app aguarda; não substituir o DOM do rascunho.

**Ponto importante:** filtros, página e posição do feed permanecem depois de responder. Sem mudança de banco, dependência, moderação ou ordem dos ramos. Os hotspots discovery.ts e posts.ts recebem somente as ligações; os compositores e o aviso de confirmação ficam em módulos próprios. A separação futura de leitura/paginação e projeção dos cards continua tarefa própria, com testes de sessão, cursores, rascunho e cancelamento.

Validação: a regressão do navegador falha na release b35b69c por encontrar o link antigo em vez do botão. Com a correção, os renderizadores reais montados com dados/transporte sintéticos passam nos feeds completo/dividido e na discussão, em 320/390/1.280 px: popup sem navegação, editor em linha no post/comentário, rascunho conservado ao recolher, atualização automática adiada enquanto o popup está aberto, pai direto, nova tentativa com o mesmo ID após resposta HTTP perdida, confirmação conservada após falha na contagem e entrada para visitantes. Verificação local completa passou, com análises estáticas/build e testes gerais; depois do cuidado adicional de saída com rascunho, lint/tipos/fronteiras/formatação/build foram conferidos novamente. Evidências visuais ficam privadas em .local/.

### Fechar sem atualizar a tela atrás — 13/10/2026

O popup de resposta é montado dentro do card. Seus cliques no fundo/padding chegavam ao atalho de abrir discussão, trocando a rota e remontando a tela. composer-backdrop.ts agora controla o gesto de fundo nos dois compositores: fechar somente quando o toque começa e termina fora, consumir o clique antes de solicitar o fechamento e encerrar handlers com o ciclo do editor. O atalho do card também ignora todos os cliques originados em dialog, inclusive conteúdo e confirmações. Não bloquear os links/controles internos ou os eventos dos seletores de emoji/GIF.

**Ponto importante:** fechar vazio, confirmar descarte ou publicar conserva os nós do feed, filtros, página e posição; não emitir recarga/navegação como efeito de fechamento. Rascunho continua com confirmação, e o foco da resposta volta ao botão sem forçar rolagem. Atualizações normais do feed e suas permissões permanecem; o editor em linha dentro da discussão continua separado. Os coordenadores hotspot não recebem responsabilidade nova nesta correção; a proposta de separação acima permanece tarefa própria.

Validação desta correção: a reprodução na release e18dbee falha ao clicar no padding do popup, porque o hash muda para a discussão. Na versão corrigida, os mesmos componentes reais com transporte sintético passam nos feeds completo/dividido em 320/390/1.280 px, verificando identidade dos nós, filtros, página, hash e rolagem após fundo vazio, padding, arrastar para fora, confirmação/retomada/descarte, Escape, Fechar e publicação de post/resposta. A prévia anterior de feed/discussão também passou, incluindo tentativa idempotente, falha da contagem e rascunho inline. Passaram 22 testes dirigidos, lint, tipos, fronteiras, licenças, formatação e build; capturas/evidência somente em .local/, sem conversas reais. A publicação segue condicionada à CI integral do commit integrado.

Hotspot identificado: presentation.ts recebeu 16 commits nas últimas duas semanas e reúne ícones, identidade/avatar, horário e navegação do card. Esta correção só acrescenta dialog à exclusão existente; o gesto fica no módulo próprio. Proposta de tarefa separada: extrair primeiro community-icons.ts, depois post-identity.ts (avatar/cabeçalho/horário), por fim post-card-navigation.ts. Preservar importações públicas e interceptação do painel; conferir fotos, links/hover, texto selecionado, mídia, controles, popup e navegação nos dois layouts antes de cada integração. Não executar essa separação junto desta correção ou de outra sessão que edite o arquivo.

### Barra dos posts sem Abrir discussão — 13/10/2026

Remover o botão visível nos feeds completo/dividido e na atividade pública do perfil. Conservar um alvo oculto sem texto ou classe post-action, usado somente pela navegação já existente do card: o painel dividido e o bookmark de retorno continuam interceptando o mesmo destino. **Ponto importante:** o clique no corpo do post abre a discussão, enquanto Responder conserva o popup e a proteção contra navegação ao fechá-lo. Nenhuma regra de interação, permissão, banco ou dependência muda.

A navegação do card prioriza explicitamente o destino da discussão antes do link de comentários: para visitantes sem conta, esse último é a entrada de login e não deve substituir a abertura pública do post. A prévia com componentes reais e transporte sintético passou em 320/390/1.280 px nos feeds completo/dividido e na atividade pública sem login: nenhum botão visível, clique no corpo abre o destino correto, popups conservam DOM/filtros/página/rolagem ao fechar ou publicar. Passaram 21 testes dirigidos, lint/tipos/fronteiras/licenças/formatação/build. presentation.ts recebe somente a prioridade explícita do alvo; sua proposta de separação em tarefa própria permanece registrada acima.

## Owner-only moderation media preview — 14/10/2026

The analysis page removes the generic “Analyzed content” heading and placeholder for profile/community images. The current post identity remains for post reviews. Photos and banners load the complete prepared image without cropping, immediately above the result and appeal. The existing signed post-media viewer continues to support photos, GIFs and videos. Technical analysis failure, uncertainty and explicit rejection keep distinct messages.

`public-profile/moderation-media` accepts only a review ID in the existing signed account protocol. The profile module authenticates the active account/device/directory and derives its public owner. The moderation store resolves only that owner's retained subject; the owning profile/community store verifies the current review binding and content hash. Authorization, retention and binding are checked again after reading. No public URI, operator endpoint, permanent copy or new table is introduced. The original retention deadline is unchanged, and bytes stop being accessible at that deadline even before physical collection. Approved current bytes keep their existing lifetime.

The client renders localized loading, private-image accessibility text, unavailable and retry states. It releases blob URLs on refresh, navigation and account/session changes and removes an unapproved preview at its original deadline. Replaced/removed/expired bytes produce an unavailable explanation rather than displaying another image or attempting recovery. The endpoint does not alter approval, warnings, appeals, community-manager powers or the model identity.

Validation covers bilingual rendering and cleanup, deadline/late-response behavior, signed owner isolation, all four image kinds, failed/held/rejected candidates, replacement, hash mismatch, expiry and unchanged public projection. Browser smoke uses synthetic media only; it does not inspect the owner's restricted file. Deployment follows the subsequently approved exact banner-pipeline acceptance and existing executor.

The existing `server/main.ts` and `server/web-mobile.ts` are startup hotspots (28 and 23 changes over the preceding two weeks). This fix adds only composition calls; preview rules live in the new focused module. A separate reviewed task should first extract shared service construction into `server/application-services`, then scheduler initialization and shutdown into `server/application-lifecycle`, leaving environment selection in the two entry points. Preserve dependency/start/close ordering; validate HTTP readiness, partial-start failures, scheduler cleanup and graceful shutdown for normal and mobile hosts after each extraction. That refactor is outside this repair.

### Community image clipping — 14/10/2026

Community banner images fill the complete rectangular band using centered cover cropping. The community photo uses only the rounded clipping of its enclosing frame, avoiding the gap caused by applying the outer corner radius again inside a border. Loaded images replace the generated gradient with the existing theme surface; missing images retain their generated tone. Personal profile photos fill their frame independently of the loader status element, preserving the circular frame outline. Personal banners remain rectangular.

The manual browser regression in `tests/fixtures/public-image-frames-browser.ts` uses the real public image loader with synthetic PNG responses and the bundled app CSS. Mount `publicImageFramesFixture(root, language)`, wait for its seven images to decode, then call `verify()` and `close()`. It checks image coverage at visible corners, the inner photo border, neutral backing, missing-image fallback, overflow and cleanup. Exercise 320/390/1280 px, English/Chinese and Black/Navy/White. The uncorrected stylesheet fails on the oval banner and the partial-height personal photo; the corrected stylesheet must pass all frames. Validation passed in all 18 viewport/language/theme combinations, plus nine targeted theme/media tests, lint, types, dependency boundaries, formatting, localization and the web build. Browser evidence uses synthetic images only.

`community.css` and `profile.css` remain existing stylesheet hotspots. The former spans directory, posts, hero and management; the latter spans the public header, followed communities and profile editing. This repair changes its existing image rules only. A separate reviewed task should extract directory/avatar styles first, hero/management second, and post/reply styles last, preserving cascade order and specificity. For `profile.css`, extract the public header first, followed communities second and the profile editor last. Check full page/panel/mobile layout, placeholders, image clipping, menus and focus after each extraction; do not mix either refactor into this repair.

The owner initially chose “Manter só na branch”. Later on 14/10/2026, the owner explicitly requested main integration and VPS activation for the completed image repairs, superseding that delivery restriction. Publish through the existing executor with exact-commit CI and preservation checks; see [release authorization](GIT_E_DEPLOY.md#owner-image-editor-repairs--activation-authorized-on-14102026).

**Ponto importante:** image bytes, public visibility, loading and synchronization stay unchanged; this correction affects their presentation.

### Replace and remove owner images without editor redraws — 14/10/2026

The owner reported failed replacement of community/public-profile photos and banners, unreliable remove targets, and whole-screen flashes. The community management recheck rebuilt its editor even for identical state; a file selection waiting behind that read could finish against a disposed slot. Public-profile actions were dropped while a background read was active. Generic settings-button rules also overrode the image controls' padding, corners and minimum height.

Both screens now use the existing bounded interaction queue from `client/interaction-queue`: one active operation and at most one user action waiting behind an automatic read, canceled on navigation/session changes. Local image preparation disables only editor controls and keeps the displayed image opaque. The selected public-profile slot is captured before waiting. Selecting or removing remains a local draft until Confirm changes.

`image-editor-preview/index.ts` owns one URL per image, preserves identical bytes across paints/reads and clears URLs and image elements at removal or disposal. Community confirmation updates the existing presentation editor and its saved revision; only the small identity header is replaced. Identical management reads preserve all nodes; a newer revision preserves a dirty presentation while retaining its original write revision so the server can reject a conflict. Loss of management role, archival or failed authorization still replaces/discards that view. Public-profile image drafts also retain their write revision across background reads. Confirmation retains the existing sequential-write behavior: successful parts are cleared and an unsaved part survives an error.

Image controls use feature-owned selectors that outrank generic settings styles. Photos/banners fill their controls without extra padding; removal has an independent 36–40 px hit area above the image. The public-profile hover hint uses the already translated accessible label. No upload format, image processing budget, signed operation, database, publication policy or dependency changes.

Browser regression: `tests/fixtures/image-editors-browser.ts` mounts the real screens with synthetic authority and loopback API responses. Check actual file-picker clicks, a pending state read on return, replacement without deletion, remove-then-replace, two successive confirmations, unchanged preview URLs and editor-node identity at 320/390/1280 px in English/Chinese. The APIs must model current revisions and prepared PNG bytes; no real account, signing key or user media is used. Targeted tests cover the interaction queue, preview URL lifecycle, management drafts and authorization loss.

The existing `communities/index.ts`, `public-profile/index.ts`, `profile-editor.ts`, `community.css` and `profile.css` remain hotspots. This change extracts shared queue/preview responsibilities and limits screen connections to existing state flows. In a separate reviewed task, extract management navigation/lifecycle into `community-management-screen.ts` first, public-profile session/notification coordination into `public-profile-session.ts` second, and description/draft persistence into `profile-description-editor.ts` third. Validate authorization, partial-save recovery, cancellation, draft preservation and URLs after each step; stylesheet separation remains as proposed above.

Validation passed: 39 targeted state/media/theme tests, two public-source packaging tests, types, lint, module boundaries, formatting, localization and the web build. The synthetic browser passed 24 slot/language/viewport cases, including concurrent state reads; desktop checks additionally passed failed-save retry, confirmed removal and public-profile partial-save recovery without resending a successful part. No real account or user media was exercised.

**Ponto importante:** the owner subsequently authorized main integration and VPS activation on 14/10/2026. Require the exact integrated commit to pass CI and the existing deployment checks. Owner drafts are never published by selection or removal alone, and a failed save is never reported as success.

### Smaller reply media — 15/10/2026

Inline reply photos and GIFs are 30% smaller than the previous presentation:
external GIF containers are capped at 448 px instead of 640 px and 70% of the
available width; approved photo/GIF figures use 70% of their existing gallery
slot. Their height limits scale by the same factor. The selected reply is marked
consistently with feed replies, so opening it does not restore the larger size.
Direct-child selectors leave the quoted parent, original posts, reply-editor
previews, private chats, ordinary videos and full image viewer unchanged.

The manual browser fixture uses real app CSS and the public picture/viewer
lifecycle with synthetic media. At 320, 390 and 1280 px in both languages, compare
reply dimensions with an original-post control, including GIF image/video
rendering, and verify that clicking an approved picture still opens the full
image. This layout check does not assess GIF providers or real user uploads.

### Edit confirmation and complete reply branches — 15/10/2026

A successful `post-edit` response replaces only the affected visible card.
Previously the client discarded that response and reread the selected post and
its first reply page; edits deeper in an expanded branch could leave both
snapshots unchanged and the old text visible until reload. The confirmed state
now renders immediately and updates public projection snapshots. Expanded
children remain siblings of the replaced card, and unrelated drafts/media keep
their DOM. Errors retain the old card and draft; navigation/session guards
reject late results. Edited posts and replies show **Edited** / **已编辑**, with
no public content diff. Existing moderation history is a separate private action.

Edit-menu textareas and media tools occupy separate rows. GIF/emoji/attachment
buttons retain their compact width and GIF labels cannot wrap. New-post/reply
composers keep their existing layout. Tree connectors use `--line-strong`, descend
from the parent's actions, turn into the child's avatar and stop at the last
sibling rather than trailing below it. No extra collapse icon is introduced.

One branch action expands its eligible descendants, including additional pages,
in vote order. The view retains at most 120 reply nodes, one pending 24-item page
per branch and a maximum of 120 sequential reads per expansion, with a 20-second
scheduling window between reads and existing per-request deadlines. Larger or
slow subtrees expose continuation/loading controls. Indentation is capped after
three nested branch steps; content remains expandable beyond that depth.
Collapsing releases descendant media and branch state; disposal rejects late
reads. Reader-specific authorization, blocks, moderation and API pagination are
unchanged. No schema, dependency or publication rule is added.

The existing `posts.ts` coordinator and `presentation.ts` remain hotspots. Only
mutation-result integration and the edited marker change there; replacement and
snapshot reconciliation belong to the dedicated edit-update module. A separate
reviewed split should extract post projection first, then screen reading/paging;
separately extract icons, identity/time and card navigation from presentation.
Validate authority, revision failures, drafts, cancellation, media cleanup and
scroll after each step, with no concurrent edits of the same coordinator.
