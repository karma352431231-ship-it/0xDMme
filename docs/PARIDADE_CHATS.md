# Experiência dos chats privado e pelo @ — 15/10/2026

## Public DM connection continuity — 16/10/2026

The owner reported `DM session changed.` while opening handle messages on
Chrome Android, blocking the comparison of text-send responsiveness. A controlled
test reproduces that exact message with the real `SocialDms` session guards and
signed list transport: a stream-state callback cancels the request while the UI
generation remains current, so the coordinator presents the obsolete operation's
cancellation as a session failure. A screenshot alone does not identify which
stream or browser event occurred on the physical device.

Initial connection notifications no longer invalidate an operation solely because
the stream is not connected yet. Losing an established stream still immediately
invalidates the directory/history, cancels the controller operation and schedules
one coalesced recheck. Deferred rechecks wait for an active stream handshake to
settle; polling remains available if it fails. A verification token prevents an
obsolete operation or preview from replacing the current view with its result or
error. Suspension, logout and actual authorization changes keep their existing
invalidation and signed verification requirements. Genuine request failures remain
visible; there is no synthetic success, new retry loop or authorization cache.

Regression coverage includes initial connection, established-stream loss during
a signed list request, handshake recovery, suspension/return, logout and a genuine
HTTP failure. The existing navigation and immediate-removal tests remain required.
The coordinator remains the existing hotspot; this repair changes its current
continuity/error boundaries and does not add another feature responsibility.
Keep the separate extraction order below.

**Ponto importante:** these tests establish a reproducible cancellation defect,
not a physical performance measurement. VPS activation and Android acceptance
remain separate. The interval between consecutive message submissions is a
distinct investigation and is not fixed by this continuity repair.

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
