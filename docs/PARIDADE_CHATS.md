# Experiência dos chats privado e pelo @ — 15/10/2026

O proprietário pediu alinhar a experiência dos chats, preservando as diferenças
já aprovadas, e depois autorizou explicitamente edição também nas DMs pelo `@`.
Essa autorização substitui somente a proibição histórica de edição.

O pedido seguinte acrescentou prévias na lista dos dois contextos: mostrar a
última mensagem enviada ou recebida, sem exigir abrir cada conversa, com checks
somente nas enviadas e leitura verde apenas quando compartilhada pelo destinatário.
A exibição da lista confirma recebimento quando necessário, sem marcar leitura.
Horários das bolhas e prévias usam `hh:mm AM/PM` nos dois idiomas; mensagens antigas
sem horário autenticado não recebem um horário inventado. Prévia de mídia é o
tipo e a legenda, sem baixar o arquivo somente para compor a lista.

No privado, um endpoint autenticado retorna em lote até 16 originais mais recentes
por contatos solicitados. Seus pacotes, edições, entrega e recibos usam os leitores
existentes e exigem confirmação final do snapshot. A DM pelo `@` sincroniza seu
histórico cifrado, lê somente o original mais recente por conversa e suas ações,
carrega remoções uma vez por lote e consulta os checks próprios em lotes de 16.
Confere novamente o snapshot antes de publicar a prévia. A lista pública mantém
seu stream quando nenhum chat está aberto, reutiliza fotos/linhas e encerra o
ciclo de vida quando a vista deixa de existir. Prévia privada permanece somente
em memória da sessão; o armazenamento existente continua cifrado. Não enviar
texto de prévia ao backend, telemetria, notificações externas ou logs.

Validação local: regressões de fila/navegação, invalidação e reutilização de foto,
edição/autoria/backup, lista sem confirmação de leitura e horários nos dois
idiomas; 45 testes PostgreSQL/HTTP dos dois mensageiros passaram. A conferência
visual usa somente dados fictícios e não substitui o aceite em celular físico.

**Ativação solicitada:** o proprietário pediu concluir os dois lotes, integrar tudo
à main e ativar na VPS. Exigir CI integral do commit exato integrado, build local,
executor `deploy:staging` existente, preservação, prontidão e rollback. Esta
autorização substitui somente o limite de ativação deste documento; não inclui
nova dependência, migração ou infraestrutura compartilhada.

| Comportamento                                                            | Chat por wallet                        | DM pelo @                                                 |
| ------------------------------------------------------------------------ | -------------------------------------- | --------------------------------------------------------- |
| Apresentação, compositor, Enter, prévia, emoji/GIF e áudio gravado       | Mesma base de interface                | Mesma base de interface                                   |
| Texto, foto/GIF, áudio e links                                           | Permitidos                             | Permitidos                                                |
| Edição                                                                   | Texto próprio, sem editar anexos       | Texto próprio, sem editar anexos                          |
| Reações, horário e confirmação de leitura                                | Conforme privacidade                   | Conforme privacidade                                      |
| Identidade e foto                                                        | Privadas, conforme consentimento       | Somente @ e avatar públicos                               |
| Consentimento, bloqueio e chaves                                         | Contexto privado                       | Contexto próprio; não herda os privados                   |
| Chamadas, grupos, cartão privado e encaminhamento para contatos privados | Regras privadas existentes             | Não disponíveis                                           |
| Vídeos enviados                                                          | Fora da V1                             | Não permitidos                                            |
| Transações e contratos/acordos                                           | Somente recursos privados já aprovados | Não permitidos                                            |
| Links externos de vídeo                                                  | Consentimento geral e toque            | Mesmo consentimento e toque; não autoriza upload de vídeo |
| Cofre, recuperação, remoções e cotas                                     | Contratos existentes                   | Inclui explicitamente as DMs E2EE, sem cota adicional     |

Edições usam a relação assinada `edit` e o conteúdo Megolm existente. O servidor
exige o autor original, texto como alvo, hash imutável, mesmos participantes,
conversa aberta sem bloqueio e ausência de remoção pessoal. Edições e reações compartilham
o orçamento existente de 64 ações por original, com lock e retry idempotente.
Não há prazo de uma hora no chat privado; esse prazo pertence a posts/replies das
comunidades e não deve ser importado para mensagens. O horário do original é
preservado. Leitores anteriores recebem apenas os tipos que negociaram; o novo
cliente declara `edits: true` e atualiza seu cursor cifrado para reler as ações.

**Ponto importante:** paridade de experiência não funde identidades, chaves
ou contatos. Em 15/10/2026, o proprietário retirou solicitação/aceite somente
das DMs pelo `@`; bloqueios e o consentimento do chat por wallet permanecem.
A ativação do lote anterior foi autorizada sob as condições acima,
sem novas migrações, dependências, retenção ou análise de conteúdo das DMs pelo servidor.

Os hotspots `communities/dms.ts` e `social-dm/index.ts` conservam a coordenação
existente. Novas responsabilidades ficam em módulos de execução, sincronização
de histórico e composição. Uma separação ampla deve ocorrer em tarefa própria:
primeiro montagem/ciclo de vida, depois projeção de histórico/mídia, por último
transporte/armazenamento; validar navegação, geração de sessão, E2EE, revogação,
remoções, retries e limpeza de mídia em cada corte.
