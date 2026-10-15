# Experiência dos chats privado e pelo @ — 15/10/2026

O proprietário pediu alinhar a experiência dos chats, preservando as diferenças
já aprovadas, e depois autorizou explicitamente edição também nas DMs pelo `@`.
Essa autorização substitui somente a proibição histórica de edição.

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
consentimento atual e ausência de remoção pessoal. Edições e reações compartilham
o orçamento existente de 64 ações por original, com lock e retry idempotente.
Não há prazo de uma hora no chat privado; esse prazo pertence a posts/replies das
comunidades e não deve ser importado para mensagens. O horário do original é
preservado. Leitores anteriores recebem apenas os tipos que negociaram; o novo
cliente declara `edits: true` e atualiza seu cursor cifrado para reler as ações.

**Ponto importante:** paridade de experiência não funde identidades, chaves,
consentimentos ou contatos. Esta entrega não autoriza ativação na VPS, novas
migrações, dependências, retenção ou análise de conteúdo das DMs pelo servidor.

Os hotspots `communities/dms.ts` e `social-dm/index.ts` conservam a coordenação
existente. Novas responsabilidades ficam em módulos de execução, sincronização
de histórico e composição. Uma separação ampla deve ocorrer em tarefa própria:
primeiro montagem/ciclo de vida, depois projeção de histórico/mídia, por último
transporte/armazenamento; validar navegação, geração de sessão, E2EE, revogação,
remoções, retries e limpeza de mídia em cada corte.
