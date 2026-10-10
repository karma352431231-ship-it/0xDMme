# Perfil público individual e feeds — 10/10/2026

Direção aprovada pelo proprietário. A página pública por `@` reúne somente identidade e atividade públicas. Publicações continuam dentro de comunidades; o perfil apresenta as mesmas publicações e respostas, sem copiar conteúdo ou criar um mural pessoal independente.

## Interações nas publicações — ajuste de 10/10/2026

O proprietário solicitou votos e respostas diretamente nos cards da atividade, como na comunidade. Reutilizar operações assinadas, compositor com anexos e controles de salvar, ocultar, denunciar e opções da publicação. Responder a uma resposta conserva seu pai direto e sua comunidade. Seguir a comunidade não é requisito para participar; arquivamento, sanções e autorização continuam verificados pelo servidor. Visitantes recebem entrada para autenticação e podem abrir a discussão publicamente.

A sequência visual é **Título → Conteúdo (texto e mídia) → Tag → Ações**, também nos cards do feed e da comunidade. Votos atualizam só o placar/contagem do card, preservando uma resposta em edição. Permissões e estados privados são consultados quando a pessoa usa os controles, sem carregar um estado privado por publicação na leitura inicial. Um envio aceito mantém confirmação e link da resposta mesmo se a rechecagem da contagem falhar. A página bloqueia a atualização automática do app durante operações e rascunhos de resposta.

**Ponto importante:** responder pelo perfil publica na discussão original; não cria uma publicação pessoal nem concede participação por seguir o perfil. A correção não altera banco, migrações, dependências ou infraestrutura.

Revisão de responsabilidades: `activity-posts.ts` concentra os controles dos cards da atividade; `post-reply.ts` é o compositor compartilhado necessário a esta correção. Os closures existentes de `posts.ts` e `discovery.ts` continuam hotspots; a lógica do perfil ficou no módulo novo. Proposta para tarefa separada: extrair primeiro leitura/paginação da árvore para `post-thread.ts` e renderização para `post-card.ts`; depois separar leitura/paginação do feed em `discovery-feed.ts` e ranking em `ranking-view.ts`. Validar gerações/cancelamento, cursores, descarte de mídia e permissões com as integrações e os testes de snapshot. O principal risco é atualizar uma tela antiga ou conservar recursos após sair dela.

## Perfil e métricas

- Visão geral combina posts e respostas por data; Posts e Respostas filtram esse mesmo histórico. Respostas conservam comunidade, postagem original e destino da resposta. Conteúdo excluído/retirado e respostas cujo original não está visível não compõem atividade ou métricas públicas.
- Conversas geradas conta posts visíveis do autor com ao menos uma resposta visível de outro perfil, uma vez por post. Auto-resposta não pontua; não é certificação de qualidade ou de pessoas únicas.
- Participação mostra totais de posts e respostas elegíveis separados.
- Idade conta a criação do perfil público, não o início da conta privada. Registrar futuras criações; manter desconhecida nos perfis existentes, sem usar primeiro post, UUID ou data da migração como idade.
- Comunidades mostra o total e a lista completa das comunidades seguidas, paginada. O proprietário escolheu esta exposição mesmo sem publicar nelas. Esta regra substitui a lista privada dos cortes 3/6 de comunidades; salvos, ocultos e votos individuais mantêm a proteção anterior.

Seguir perfil usa identificador público estável, nunca o `@` reutilizável como vínculo durável. Exige conta/perfil e aparelho autorizados, é reversível e idempotente com revisão. Não concede DM, não cria aviso de follow e não expõe listas de seguidores/perfis seguidos a visitantes. Contador agregado de seguidores pode acompanhar o botão sem substituir as quatro métricas.

Banner é uma imagem independente do avatar. Preparo PNG/JPEG/WebP no cliente, resultado PNG/JPEG sem metadados, até 3 MB/2.048 px, proporção preservada nos bytes. Exibição ocupa faixa com recorte visual central. Candidato restrito ao dono, hash/alvo/revisão vinculados à análise; URI conhecida não libera pendente/rejeitado/expirado. Remoção, troca e nova política invalidam a referência anterior. Aplicar retenção, contestação, capacidade global e coleta já existentes; sem acesso a dados privados.

Descrição (10/10/2026, pedido do proprietário) é texto do próprio dono, público assim que salvo, como o `@`: até 280 caracteres e cinco linhas, só texto e emoji, exibida como texto (sem marcação nem links clicáveis). Quebras são normalizadas, sequências de linhas em branco viram uma, e caracteres invisíveis que escondem ou invertem texto são recusados; o joiner de emoji é aceito. Fica em tabela própria (migração 053) com revisão contra edição concorrente entre aparelhos e cobrança na capacidade global, no mesmo molde do banner. Não passa por análise automática: o plano não modera texto público automaticamente, e a descrição segue a regra do `@`.

Configurações editam o perfil onde ele é visto: tocar no banner ou na foto troca o arquivo, e a descrição é salva ao sair do campo. A prévia mostra a cópia do dono, inclusive um arquivo ainda em análise. Avisos de análise aparecem só quando o arquivo fica fora do público (recusado, incerto, falha, prazo encerrado); aprovado, pendente ou substituído não geram aviso.

## Feed e Seguindo

Feed principal: publicações recentes das comunidades em geral, posts/respostas dos perfis seguidos e posts públicos em alta. Ordenação Destaques determinística e paginada, sem duplicar o mesmo ID; os atalhos Recentes/Mais votados/Mais comentados continuam disponíveis. A prioridade inicial combina `1 + ln(1 + max(placar, 0) + 2 × respostas)` com bônus 3 para autor seguido, dividido por `(2 + idade em dias)^1,5`; escala inteira de um milhão para o cursor. Considera engajamento público atual e decaimento pela idade da publicação, sem alegar timestamps de votos históricos, perfilar leitores ou divulgar votantes. Não é ranking de pessoas, selo de qualidade ou proteção completa contra coordenação. Parâmetros são escolha técnica inicial para avaliação, não promessa de personalização por aprendizado.

Seguindo: posts originais das comunidades seguidas **ou** posts/respostas dos perfis seguidos, mesmo em comunidades não seguidas. Uma publicação que corresponde aos dois caminhos aparece uma vez. Respostas exigem original público elegível. Ocultações pessoais continuam retirando itens dos feeds pessoais; salvos/ocultos mantêm seus acessos próprios. Sem seguir nada, Seguindo mostra estado vazio; leitura pública do Feed permanece disponível sem conta/perfil.

Consultas limitadas e projeções em lote. Cursores de atividade vinculam perfil, aba e corte temporal; os de feeds vinculam filtros e corte temporal. Feeds pessoais vinculam também a identidade pública do leitor, sem incluir a identidade privada da conta. A lista de comunidades pagina por UUID da comunidade. Não guardar cópias de conteúdo excluído, inventar histórico ou varrer todo o histórico por item. Métricas seguem conteúdo atual e não prometem snapshot histórico durante paginação.

**Ponto importante:** tornar as comunidades seguidas públicas é mudança de privacidade explicitamente aprovada. A gestão do perfil deve informar essa exposição. A data antiga não comprovada continua desconhecida. Implementação e migrações locais não autorizam ativação na VPS; publicação do banner conserva a exigência de scanner aceito.

## Implementação local e validação

A página usa `#publico?handle=...`, com abas e listas paginadas. A gestão em Perfil mantém avatar e banner separados. Rotas públicas novas `/page`, `/activity` e `/communities` conservam o contrato compacto anterior em `/api/public-profiles/:handle`; operações de seguir e editar banner passam pela sessão e prova assinada do aparelho. Consultas não projetam identidade privada, carteira ou dados de chat.

Migrações 051 e 052 adicionam idade comprovada para futuras criações, vínculos de seguir perfis, candidato de banner com cobrança de capacidade e índices para atividade por autor/conversas com respostas. A 052 mantém imutável a 051 já aplicada no banco local de testes. A migração 050 e as alterações de moderação de vídeo já estavam em andamento antes deste trabalho; não foram substituídas nem ativadas aqui. Em 10/10/2026 o proprietário autorizou incluir somente o SQL 050 com default `before`, preservando a sequência já usada localmente; as novas regras e o detector de vídeo ficam fora da release. A transição 049→052, backup e manutenção próprios foram especificamente autorizados para publicação com CI integral aprovada, conforme [Git e envio à VPS](GIT_E_DEPLOY.md#página-pública-individual--publicação-autorizada-em-10102026).

Na preparação isolada da publicação, passaram 18 testes unitários e 27 testes de integração relacionados, incluindo autorização/revisão/idempotência de follows, atividade em comunidade não seguida, comunidades públicas sem posts, idade antiga desconhecida, exclusão do original, salvos/ocultos, isolamento dos cursores, página cheia de respostas aninhadas, banner pendente/aprovado/removido e expiração com liberação de bytes. As integrações usam banco novo e exclusivo, removido ao finalizar. Lint, tipos, fronteiras, licenças, formatação e build web também passaram. A projeção de até 48 ancestrais respeita o limite de 24 posts por leitura em até dois lotes.

Conferência visual com dados fictícios e componentes reais: desktop de 1.280 px e larguras móveis de 390/320 px, quatro métricas, abas, seguir/deixar de seguir e preparo/remoção de banner. Teste de interface usa API sintética; não substitui aceitação com carteira/aparelho real nem validação do scanner de produção. Evidências ficam em `.local/`, fora do Git.

Na preparação da publicação, uma nova prévia com componentes reais confirmou que avatar e `@` do autor abrem a página individual, com as quatro métricas, comunidades, abas e seguir/deixar de seguir. As respostas conservam o link da discussão e o contexto da comunidade. A entrada do avatar na comunidade agora é um link com nome acessível.
