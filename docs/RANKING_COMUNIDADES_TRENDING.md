# 0xDMme — plano do ranking de comunidades

Data: 08/10/2026. Estado: cortes 1–10 e visualizações implementados localmente; validação final e entrega operacional em andamento. O proprietário autorizou commits separados, envio ao GitHub/Git da VPS e ativação pelo deploy existente.

Referência central: [decisões, seção 6.4](../DECISOES_E_PLANO_DE_IMPLEMENTACAO.md#64-comunidades-públicas--camada-social-planejada). Contrato atualmente implementado: [corte 6 de comunidades](COMUNIDADES_PUBLICAS.md#corte-6--feed-e-descoberta-local-em-06102026).

## Execução dos cortes 1–8 — autorizada em 08/10/2026

O proprietário autorizou a implementação local dos cortes 1–8 e a continuidade após compactação, reconstruindo o estado antes de continuar. Escolheu a opção B: variação líquida agregada de positivos por post, retenção operacional de até 14 dias, sem histórico de identidades de votantes. Fixou recém-criadas em **até sete dias**. Arquivadas ficam fora de Trending/recém-criadas, mas continuam em Maiores e na listagem completa. Depois autorizou decisões técnicas autônomas, com resumo final para revisão.

Escolhas iniciais sob essa autorização: limite de 500 seguidores e mínimo de três participantes para recém-criadas; idade desconhecida fora desse filtro; padrão Trending/24h; atalhos existentes preservados. Variação de votos usa deltas positivos/negativos agregados por post e milissegundo, sem perfil de votante; retries sem mudança não produzem delta, e retirada/inversão subtrai positivos. Crescimento não é extrapolado quando falta histórico. Dados temporais anteriores à instalação não são inventados. Downvotes mantêm o placar vigente e influenciam apenas quando substituem uma posição positiva. O sinal soma ganhos líquidos positivos por post; uma queda em outro post não penaliza esse ganho. A interface usa “upvotes nos posts em alta”, sem apresentar isso como saldo líquido da comunidade inteira.

Fórmula inicial versionada: transformações logarítmicas locais para participantes/conversas/retorno/autores, distribuição temporal, concentração de autoria e sinal de votos com influência limitada; ganho absoluto e proporcional com base regularizada em 100 e amortecimento de ganho em 50. Limite do bônus de crescimento de 1,5. Testes de calibração verificam a balança escolhida; parâmetros continuam revisáveis pelo proprietário.

Ciclo de vida inicial: agrupamento de avisos por até 100 ms, lotes de 32 comunidades, um produtor global, pendência por revisão na transação original, avisos PostgreSQL sem payload após commit, conexão exclusiva de sinalização além do pool de quatro, próximos vencimentos e fallback de cinco minutos. Gerações pagináveis com validade máxima de cinco minutos e orçamento de cache de 64 MiB; sob pressão, as mais antigas expiram antes e seus cursores exigem recarga, sem truncar o universo. Coleta em lotes de 256 entradas, contador de bytes por lote e publicação atômica; consultas públicas não recalculam métricas. Dados derivados contam no orçamento global existente; falha/capacidade do produtor não é publicada como lista vazia válida. Push comum drena lotes de 16 alvos, preserva limite de três tentativas e agenda retry de 60s somente após falha. Esses parâmetros são escolhas de implementação, não desempenho já comprovado.

A autorização inicial abrangia cortes 1–8. A ampliação abaixo inclui cortes 9–10, visualizações e ativação revisada na VPS. Não inclui novos provedores, persistência de chamadas ou relaxamento de moderação.

## 1. Objetivo e direção definida

Substituir a experiência atual de Explorar comunidades por um ranking que permita descobrir comunidades grandes com participação consistente e comunidades pequenas ganhando engajamento. O produto público continua sendo **0xDMme**, em **https://0xdmme.app**.

Direção definida nesta discussão:

- Reunir Mais ativas e Em crescimento em **Trending**.
- Oferecer **Trending**, **Maiores** e **Comunidades recém-criadas**.
- Usar períodos de **24 horas** e **sete dias** para atividade e crescimento.
- Incorporar os cinco critérios de participação discutidos e **upvotes em posts como sexto critério**.
- Equilibrar volume absoluto e crescimento proporcional: dobrar uma base pequena não pode, por esse percentual sozinho, superar atividade muito maior. Uma pequena com forte aceleração e ganho absoluto relevante pode disputar posições próximas de uma grande. Trending exige score positivo; comunidades sem sinal na janela permanecem em Maiores/listagem completa.
- Manter leitura sem conta e participação sem exigir seguir a comunidade.
- Preservar acesso à listagem completa, inclusive de comunidades sem atividade suficiente para destaque.
- Acionar o processamento principal por eventos confirmados e vencimentos agendados. Verificação periódica fica como fallback de recuperação; aplicar essa direção durante o ranking e revisar os workers existentes depois da entrega, conforme as seções 9.8 e 10.1.
- Não criar saldo, créditos para gastar, compra de exposição ou boost. A mudança é no ranking de comunidades; integração desse cálculo na ordenação do feed geral/For you exige escopo próprio.

Os pesos e limiares discutidos inicialmente abaixo originaram os parâmetros de execução registrados acima, escolhidos sob autorização de decisão autônoma e sujeitos à revisão final do proprietário. A FOMO é referência da experiência de descoberta, não uma fórmula copiada ou uma dependência do projeto.

## 2. Experiência e classificações

| Classificação             | O que determina a ordem                                           | Período                                                          |
| ------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| Trending                  | Atividade pelos seis critérios, ajustada pelo crescimento         | Últimas 24h ou últimos sete dias                                 |
| Maiores                   | Total atual de seguidores                                         | Tamanho atual; não depende da janela de atividade                |
| Comunidades recém-criadas | Elegibilidade por idade e tamanho; ordem pelo engajamento inicial | Atividade de 24h ou sete dias, distinguindo histórico incompleto |

Recomendação de interface: abrir em Trending/24h e oferecer o seletor 24h/7 dias. Ao abrir Maiores, não apresentar seguidores totais como se fossem seguidores adquiridos no período. Na implementação inicial, o acesso passa a Ranking e começa em Trending/24h; a rota histórica `view=explore` permanece compatível.

Cada entrada pode mostrar nome/foto aprovados, posição, seguidores atuais e participantes ativos na janela. Variação e indicadores de upvotes só devem aparecer quando houver dados que sustentem a informação. Mostrar falta de histórico como tal, sem simular zero ou percentual infinito. Números auxiliares e detalhamento do índice são propostas de interface, não requisitos já fechados.

Preservar navegação desktop/mobile, leitura pública, gestão, seguidos, permalinks e atalhos existentes. Recentes/Mais votados/Mais comentados e os períodos dos **feeds de posts** continuam no contrato vigente; substituir Explorar não altera esses filtros por consequência.

## 3. Janelas e significado de participante

Usar janelas móveis de duração efetiva, sem depender da virada do dia ou da semana. Proposta de convenção: para âncora `T` e duração `W`, janela atual `[T-W, T)` e anterior `[T-2W, T-W)`. Assim, uma contribuição na fronteira não entra nos dois períodos.

| Seleção   | Janela atual      | Comparação de crescimento             |
| --------- | ----------------- | ------------------------------------- |
| 24h       | Últimas 24 horas  | As 24 horas imediatamente anteriores  |
| Sete dias | Últimos sete dias | Os sete dias imediatamente anteriores |

**Participante ativo** é um perfil público distinto que publicou ou respondeu na comunidade dentro da janela. A votação contribui pelo total agregado de upvotes, sem transformar identidades de votantes em participantes do ranking. Seguir, ler, manter a página aberta ou receber uma DM não constitui participação para esse cálculo.

Só considerar contribuições públicas elegíveis: conteúdo excluído/retirado não pontua; respostas cujo original está excluído/retirado também não. Mídia sem a aprovação necessária não pode ser exposta por causa do ranking. Uma resposta recente a um post antigo pode representar atividade recente; idade do post original e horário da contribuição são informações diferentes.

As comparações usam conteúdo atualmente elegível. Exclusão e moderação podem mudar também os números calculados para a janela anterior; isso não é um histórico imutável da comunidade.

## 4. Os seis critérios

As definições de medição e proteções nesta tabela são propostas técnicas para implementar os critérios escolhidos, sujeitas à calibração.

| Critério escolhido         | Sinal proposto                                                        | Proteção/limite a calibrar                                                                                                                   |
| -------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Participantes distintos    | Quantidade de perfis que publicam ou respondem                        | Um perfil conta uma vez por janela; ganho adicional de volume diminui em escalas maiores                                                     |
| Posts que geram conversa   | Discussões com respostas de outras contas, além do autor              | Uma discussão conta uma vez; auto-respostas e repetição no mesmo post não criam novas conversas                                              |
| Participantes que voltam   | Participação em períodos distintos, medida por contribuições públicas | Retorno entre janelas comparáveis; pouca amostra ou histórico incompleto exige cautela                                                       |
| Constância                 | Distribuição da atividade ao longo da janela                          | Em 24h, avaliar intervalos dentro do período; em sete dias, distribuição por dias. Não rastrear sessões ou leitura                           |
| Diversidade de autores     | Distribuição dos posts originais entre autores diferentes             | Considerar concentração, além do número de autores; publicar muito com uma conta tem ganho limitado                                          |
| Posts com bastante upvotes | Quantidade agregada de votos positivos nos posts elegíveis            | Ganhos decrescentes por post e influência limitada; valorizar também a distribuição entre posts sem eliminar a contribuição de um post viral |

Upvotes são um sinal adicional de aprovação, não prova de qualidade, segurança ou pessoas únicas. A presença desse sexto critério não elimina os demais nem cria notificações de votos.

## 5. Upvotes: contrato e limitação encontrada

O proprietário escolheu que comunidades com posts recebendo muitos upvotes tenham esse sinal considerado no Trending. O algoritmo deve receber **totais agregados**, nunca listas de votantes ou padrões individuais de voto entre comunidades.

O placar público vigente conserva `score = upvotes - downvotes`; o ranking acrescenta uma fonte temporal própria de positivos. Um post com 120 upvotes e 100 downvotes e outro com 20 upvotes e nenhum downvote têm o mesmo placar líquido de 20, mas não têm a mesma quantidade de upvotes. Portanto, `max(score, 0)` não atende ao novo critério.

A [migração 031](../src/server/database/migrations/031-community-interactions.sql) mantém uma posição atual por perfil/alvo, revisões e um trigger do placar líquido. É possível derivar o total atual de positivos por agregação interna de posições `+1`, sem entregar identidades ao ranking. O agregado deve ser exposto por contrato do módulo responsável por votos; não espalhar acesso a suas tabelas por outros módulos.

**Limitação confirmada antes da implementação:** posições de voto não tinham timestamps nem série temporal agregada. A migração 044 passa a registrar mudanças de positivos por post, sem votantes; histórico anterior continua desconhecido. O placar público normal permanece líquido. Publicação recente com votos acumulados e votos recebidos recentemente são medidas diferentes.

O proprietário escolheu B em 08/10/2026. A tabela conserva a comparação que fundamentou a escolha:

| Alternativa avaliada                            | O que mede                                                 | Efeito e trabalho necessário                                                                                                                                                                 |
| ----------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A — totais atuais em posts publicados na janela | Upvotes acumulados dos posts recentes                      | Agregação de positivos separada do placar líquido; menor mudança de dados. Não mede votos recebidos no período e deixa de captar a retomada de posts antigos                                 |
| B — evolução agregada de upvotes na janela      | Engajamento recente de votação, inclusive em posts antigos | Novo contrato temporal, agregados e possivelmente migração. Definir se mede variação líquida de positivos ou entradas elegíveis; retirada, reversão e retries não podem fabricar crescimento |

A opção B foi escolhida e implementada localmente com deltas por post/milissegundo, sem perfil de votante. A retenção lógica é de 14 dias e a coleta física ocorre em lotes; interrupções são recuperadas ao iniciar o consumidor. A migração local não autoriza a migração na VPS. Ambas preservam o fluxo normal de votação e não exigem serviço externo ou compra; a opção B exige mais implementação, armazenamento e validação. Nenhuma opção autoriza histórico adicional de identidade de votantes.

Na implementação de B, granularidade de milissegundo, contabilidade global e aquecimento explícito foram adotados. Não preencher períodos anteriores com timestamps inventados. Para comparar duas janelas completas de sete dias, serão necessários dados que cubram ambos os períodos. Downvotes continuam no placar atual; sua eventual influência adicional no Trending é uma decisão em aberto, não uma penalidade automática aprovada.

## 6. Balança entre atividade e crescimento

Estrutura adotada; pesos iniciais versionados no contrato compartilhado e registrados para revisão:

```text
atividade = combinação normalizada dos seis critérios
trending = atividade × (1 + crescimento_ajustado)
```

Fórmula v1 implementada, para revisão dos pesos:

```text
L(x) = ln(1 + max(0, x))
fração(n, d) = d > 0 ? clamp(n / d, 0, 1) : 0
 diversidade = originais > 0 ? max(0, 1 - soma(contagem_autor²) / originais²) : 0
atividade = 4L(participantes) + 2L(conversas) + L(retornando)
          + 2fração(retornando, participantes) + 2fração(intervalos_ocupados, intervalos)
          + L(autores) × (0,5 + diversidade)
          + 0,8min(8, soma_por_post[ln(1 + ganho_positivo)]) + 0,4L(posts_com_ganho)
ganho = max(0, atual - anterior)
ajuste(atual, anterior) = min(2, ganho / (anterior + 100)) × ganho / (ganho + 50)
crescimento = histórico_completo ? 0,7ajuste(participantes) + 0,3ajuste(contribuições) : 0
score = arredondar(atividade × (1 + min(1,5, crescimento)) × 1.000.000)
```

“Conversas” conta posts originais com ao menos uma resposta elegível de outro autor na janela; cada discussão conta uma vez. Retorno é a interseção exata entre participantes das janelas atual/anterior. Constância usa 24 intervalos móveis de uma hora ou sete de 24h. Ganho de positivos por post é `max(0, soma(deltas na janela))`; votos de replies permanecem no placar de replies e não entram nesse sinal inicial. O multiplicador final apenas torna a ordenação inteira; não cria pontos disponíveis para gastar.

Recomendações para o cálculo:

1. Dar peso relevante ao volume de participantes e de conversas, com transformação que reduza ganhos marginais em escalas maiores, como logaritmo. Esse volume já entra em atividade: não adicionar outro total de volume por cima.
2. Combinar ganho absoluto e proporcional ao ajustar crescimento. Aumento de dez participantes e aumento de cem não devem ser tratados como equivalentes somente porque o primeiro tem percentual maior.
3. Amortecer o percentual quando a base anterior é pequena. A constante de regularização, a confiança da amostra e o limite de influência precisam de calibração.
4. Limitar o fator de crescimento. Crescimento nulo não zera atividade; uma comunidade grande e consistente pode continuar bem posicionada.
5. Medir crescimento de participantes e contribuições elegíveis entre janelas equivalentes. O nível de atividade e sua evolução são componentes diferentes; não somar novamente os mesmos totais como critérios independentes.
6. Usar os upvotes como sexto componente da atividade, sem multiplicar por eles outra vez. O tratamento temporal deve seguir a escolha da seção 5.
7. Distinguir zero observado de falta de histórico. Não transformar uma comunidade recém-criada em crescimento infinito nem extrapolar meia janela como se fosse completa.

Proporções de conversa, retorno e concentração de autoria complementam os totais. Não usar `participantes / seguidores` como taxa de engajamento: participação não exige seguir, portanto o numerador não é necessariamente parte do denominador.

### Cenários para calibrar a fórmula completa

Nos quatro primeiros cenários, manter conversas, retorno, constância, diversidade e upvotes comparáveis para isolar a balança de volume/crescimento. Os números representam participantes ativos em janelas consecutivas, não membros acumulados.

| Participantes antes → agora                     | Ganho absoluto          | Crescimento bruto              | Comportamento desejado                                                           |
| ----------------------------------------------- | ----------------------- | ------------------------------ | -------------------------------------------------------------------------------- |
| 10 → 20                                         | +10                     | +100%                          | Não superar 1.000 → 1.100 pelo percentual sozinho                                |
| 1.000 → 1.100                                   | +100                    | +10%                           | Receber peso relevante pela escala e pelo ganho absoluto                         |
| 10 → 110                                        | +100                    | +1.000%                        | Poder disputar posições próximas de comunidades maiores com crescimento moderado |
| 1.000.000 → 2.000.000                           | +1.000.000              | +100%                          | Ganho absoluto muito grande deve continuar tendo bastante peso                   |
| Grande e estável                                | Sem crescimento         | 0%                             | Atividade consistente continua relevante                                         |
| Base pequena ou inexistente                     | Poucas contribuições    | Percentual instável/indefinido | Não dominar por falta de denominador ou pouca amostra                            |
| Muitos posts de uma conta                       | Volume concentrado      | Qualquer                       | Não substituir participação distribuída por repetição                            |
| Mais upvotes elegíveis, demais critérios iguais | Mais aprovação agregada | Conforme contrato temporal     | Melhorar a relevância com ganhos limitados, sem eliminar os outros critérios     |

Os testes de calibração do contrato completo verificam os cenários de escala, influência dos seis sinais e histórico incompleto. Isso estabelece o comportamento inicial da fórmula; dados reais ainda são necessários para calibrar os pesos de produto.

## 7. Comunidades recém-criadas

Esse filtro destaca comunidades **novas e pequenas que começam a ganhar engajamento**. Idade define elegibilidade; atividade e aceleração iniciais definem a ordem. Não é somente uma lista cronológica, nem um destaque permanente para toda comunidade pequena.

Contrato inicial: idade inferior a sete dias completos, até 500 seguidores e pelo menos três participantes na janela escolhida. Idade desconhecida não entra nesse filtro. Crescimento exige duas janelas completas observadas; sem elas, o score usa somente atividade e a interface informa histórico em formação. Esses critérios de destaque não impedem leitura, criação gratuita, participação ou acesso pela listagem completa.

**Limitação anterior à implementação:** a [tabela original de comunidades](../src/server/database/migrations/029-communities.sql) e o [contrato atual](../src/shared/communities/index.ts) não registram a data de criação. A criação no [store](../src/server/database/communities.ts) não a informava. A migração 044 acrescenta timestamp para futuras criações e conserva `NULL` nas comunidades anteriores; alterações de nome/foto/propriedade não mudam essa idade.

Não usar UUID aleatório ou data do primeiro post como se comprovassem a criação da comunidade. Não classificar todas as comunidades antigas como recém-criadas na data da migração. Não há backfill inventado: idade desconhecida fica fora de recém-criadas e continua descobrível nas demais listas. Alterar nome, foto ou propriedade não deve reiniciar a idade.

## 8. Privacidade, moderação e recursos

- Usar contribuições publicadas e agregados de votação para o propósito definido. Não usar wallet, patrimônio, nome privado, DMs, agenda, tempo de leitura, listas de seguidores, salvos, ocultações ou denúncias individuais como sinais públicos de classificação.
- Votos individuais continuam privados perante visitantes, outras contas e moderadores. O novo sinal aprovado é o agregado de positivos; não autoriza publicar quem votou nem analisar seu comportamento entre comunidades.
- Reutilizar autorização, voto reversível por perfil/alvo, revisões e idempotência. Retries, troca de aparelho e reversões não podem multiplicar o peso do mesmo voto. Não criar ranking de pessoas ou exigir seguir para contribuir.
- Perfis distintos não comprovam pessoas únicas. Limites de contribuição reduzem algumas formas de spam, mas não resolvem múltiplas contas ou coordenação. Não introduzir fingerprint persistente, análise financeira de wallets ou serviços externos como solução automática.
- Preservar exclusão/moderação, aprovação de mídia e contestação. Volume de denúncias não deve virar penalidade automática de ranking. Decisão do proprietário: comunidades arquivadas ficam fora de Trending/recém-criadas, conservando leitura, Maiores e descoberta histórica.
- Calcular métricas em lote, com limites de tempo, memória e concorrência. Medir consultas e índices antes de escolher agregados persistentes; evitar varrer todo o histórico a cada acesso e queries por item.
- Se houver cache ou agregados temporais, definir orçamento, atualização, expiração e efeito de exclusão/moderação. Expirar dados operacionais do ranking não autoriza apagar conteúdo aceito.
- Preservar paginação limitada, desempate determinístico e cursores vinculados à classificação/período. Definir consistência durante a paginação; não prometer snapshot se posições puderem mudar entre páginas.
- Não acrescentar dependências, notificações de atividade/votos, instalação na VPS ou alteração de serviços compartilhados por consequência deste plano.

## 9. Aprendizados de outro ranking aplicados à implementação

Em 08/10/2026, o proprietário pediu incorporar ao plano as lições de outro projeto de ranking. As diretrizes abaixo foram aplicadas nos cortes 1–8; estruturas, retenção e parâmetros iniciais estão registrados nesta execução. Incrementos mais complexos e dimensionamento operacional dependem de medição. A escolha do acionamento principal por eventos e prazos está definida na seção 9.8. No outro projeto, o relato distinguia otimizações concluídas de publicação compartilhada ainda pendente: não constitui prova de desempenho do 0xDMme.

O Explorar anterior agregava seguidores e posts/respostas por pedido. A [descoberta atual](../src/server/database/community-discovery.ts) consome gerações compartilhadas produzidas por comunidades afetadas. A evidência local compara leitura publicada com recomputação experimental dos seis critérios; não demonstra gargalo nem ganho sobre a classificação simples anterior.

### 9.1 Fluxo proposto

```text
Gravação pública + marcação durável das comunidades afetadas
    → após commit, sinal para acordar o produtor e agrupar o trabalho pendente
    → métricas por comunidade e janela
    → score por corte temporal e versão da fórmula
    → publicação atômica de uma geração compartilhada
    → API e interface

Próximo vencimento agendado → transições de janela/elegibilidade afetadas
Inicialização/fallback periódico → recuperação limitada de pendências
```

Separar responsabilidades por módulos; isso não exige microserviços, outro banco ou novos serviços na VPS. A implementação deve definir ciclo de vida, orçamento e encerramento do produtor no runtime existente antes de considerar outra infraestrutura.

### 9.2 Processar as comunidades afetadas, com recuperação durável

- Posts, respostas, votos, seguir/deixar de seguir, criação e alterações relevantes de comunidades devem marcar somente as comunidades afetadas. Exclusão, moderação, restauração e mudança de elegibilidade também provocam atualização. Remover um post original altera a elegibilidade de suas respostas, mesmo sem modificá-las individualmente.
- Gravar uma referência mínima de trabalho pendente/revisão na mesma transação da mudança válida. Agrupar IDs repetidos em lotes, com concorrência, tempo, tamanho de fila e retries definidos. Não copiar conteúdo, listas de participantes ou provas de autenticação para a fila.
- Fazer o cálculo depois do commit, sem manter a transação de publicação/voto aberta esperando o ranking. Isso preserva as transações curtas e evita inserir cálculo global no caminho de admissão compartilhado.
- A conclusão de um lote deve reconhecer apenas a revisão processada. Se uma mudança nova chegar durante o trabalho, ela continua pendente; não apagar o aviso mais recente ao finalizar um trabalho antigo. Retomar trabalho após falha/reinício sem multiplicar contribuições.
- Os [avisos atuais de alterações](../src/server/database/changes.ts) são internos ao processo e não são uma fila durável. Podem acordar o consumidor depois do commit, mas não substituir a marcação persistida e a recuperação. Agrupar atualizações no navegador também não limita o trabalho total do servidor.

### 9.3 Métricas separadas do score e evolução incremental

Começar pela recomputação das métricas das comunidades afetadas, em consultas/lotes limitados às janelas e fontes necessárias. Usar o mesmo cálculo como referência para validar futuras atualizações incrementais. Tornar um componente incremental quando sua medição justificar o custo de manter deltas, expiração e reversões; não exigir contadores incrementais para os seis critérios desde a primeira entrega.

O recorte atual/anterior de sete dias exige até 14 dias de contribuições para comparação, além dos dados de apoio previstos no contrato. As fontes temporais de upvotes precisam da escolha da seção 5: a fila não cria timestamps nem recupera histórico ausente. Consultas de posts antigos ou conjuntos muito grandes também precisam de orçamento e retomada; atingir um limite não transforma cálculo parcial em resultado completo.

Manter versões separadas para a definição das métricas e para os pesos/fórmula. Mudar pesos pode recalcular scores sobre as mesmas métricas; mudar elegibilidade, deduplicação ou o significado de conversa/retorno pode exigir reconstrução. Conservar estatísticas suficientes para os critérios escolhidos, sem guardar apenas o score final.

Qualquer caminho incremental deve poder ser reconciliado com as fontes elegíveis. Exclusão ou ocultação deve retirar a contribuição correta; restauração não pode somá-la duas vezes. Votos retirados, invertidos e repetidos por retry seguem o contrato temporal escolhido. Não guardar conteúdo apagado como fonte paralela de reconstrução do ranking.

### 9.4 Janelas, únicos e dependências da fórmula

| Cuidado                                                                        | Contrato necessário                                                                                                                                                                    |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O tempo avança sem novos eventos                                               | Agendar entrada/saída de contribuições nas janelas atual e anterior, inclusive o recorte mais antigo. Recalcular também a elegibilidade de recém-criadas ao vencer o prazo de novidade |
| Agregados por intervalo não representam automaticamente uma janela móvel exata | Respeitar as fronteiras da seção 3 e tratar intervalos parciais; não arredondar silenciosamente uma janela de 24h para horas/dias fechados                                             |
| Participantes únicos não são somáveis                                          | Uma conta ativa em dez horas conta uma vez na janela. Deduplicar nas fontes ou em estruturas mínimas de propósito/retenção definidos; não somar únicos horários                        |
| Conversas, retorno e concentração precisam de informação suficiente            | Totais de posts/respostas não substituem interlocutores distintos, interseção entre períodos ou distribuição de autoria                                                                |
| Normalização global amplia o conjunto afetado                                  | Se o score usa máximo ou percentis globais, uma mudança pode alterar comunidades sem eventos. Recalcular a geração de forma coerente, sem misturar escalas                             |

Recomendação inicial: avaliar transformações locais e parâmetros fixos versionados para normalização, preservando o equilíbrio entre tamanho e crescimento. Normalização global só deve ser escolhida com suas dependências e custo explicitados; atualizar somente comunidades com eventos seria insuficiente nesse caso.

### 9.5 Publicação compartilhada, concorrência e paginação

- Publicar uma geração com ID, classificação, janela, horário do corte, versões de métricas/fórmula e revisões consumidas. As métricas reutilizadas precisam corresponder ao corte ou ser comprovadamente válidas nele; não rotular dados de cortes incompatíveis com um único horário mais recente.
- Preparar a geração antes de substituir atomicamente a publicação anterior. Controlar o produtor e impedir que trabalho antigo sobrescreva uma geração mais nova. A API não pode observar uma publicação pela metade.
- Servir o resultado compartilhado em todos os pedidos da classificação/janela. Não basta criar uma tabela de publicação: produtor, API e interface precisam usá-la de ponta a ponta. O produtor deve ter limite global de trabalho independente da quantidade de visitantes.
- Vincular cursores à geração e definir retenção para percorrer suas páginas, renovação/expiração, desempate e atualização na interface. Não misturar posições de gerações distintas durante a paginação.
- Definir atraso máximo aceitável, invalidação e comportamento quando faltar geração utilizável. Falha não publica lista vazia como sucesso nem dispara automaticamente recálculo global por visitante. Preservar a última geração somente enquanto ela atender ao contrato de validade.
- Uma geração anterior não concede permissão para expor conteúdo, mídia ou metadados que deixaram de ser públicos. A entrega continua obedecendo às projeções públicas e às regras atuais de moderação, sem armazenar cópias de posts na publicação.

### 9.6 Lotes, universo completo e armazenamento

Calcular candidatos em lotes, evitando queries por comunidade/post e limitando memória e conexões. Quando houver destaque top N, calcular o score completo de cada candidato e conservar os melhores; o número exibido não pode limitar arbitrariamente o universo avaliado.

Manter informação suficiente sobre candidatos fora do top para recompor a lista quando um líder perder atividade/eligibilidade. Preservar uma estratégia de paginação da listagem completa: conservar somente o top N não atende à descoberta de todas as comunidades aprovada na seção 1.

Evitar copiar listas completas de participantes/autores a cada atualização. Identidade, versão, contagens e diferenças podem reduzir escrita/WAL quando necessárias; hashes e bitmaps são ferramentas condicionadas à medição e não uma exigência herdada do outro projeto. Não criar histórico de membros, votos individuais ou snapshots de conteúdo privado para alimentar o ranking. Retenção de estados de deduplicação e gerações deve ser limitada ao propósito e aprovada no contrato de dados.

### 9.7 Medição e critérios de aceite

Medir o fluxo inteiro, em condições comparáveis: leitura das fontes, agregação, cálculo, escrita e publicação; duração/espera das transações, conexões, memória, bytes, WAL, crescimento de tabelas/índices e atraso da fila até a API. Comparar cenário de muitas contribuições em uma comunidade, contribuições distribuídas, período sem eventos e vários leitores. Uma melhora intermediária não comprova ganho no fluxo completo.

Adicionar à validação futura:

- Equivalência entre cálculo de referência e métricas derivadas, incluindo participantes presentes em vários intervalos, retornos, concentração e conversas entre contas.
- Expiração/transição de janelas sem eventos novos, fronteiras exatas e saída do filtro de recém-criadas sem ação do usuário.
- Exclusão/ocultação do original e seus efeitos em respostas; restauração, retirada/inversão de voto, retries e reconstrução sem dupla contagem.
- Rollback sem trabalho publicado; recuperação após commit seguido de interrupção; nova revisão durante processamento; proteção contra publicação atrasada.
- Paginação pela mesma geração, expiração explícita do cursor, falha sem ranking vazio de sucesso e manutenção das regras públicas ao servir dados anteriores.
- Aumento de leitores sem recálculo completo por pedido/página; redução de custo com o mesmo universo de candidatos, sem descartar comunidades silenciosamente.

Não executar benchmark no ambiente real ou alterar recursos da VPS por consequência da documentação. Primeiro preparar a medição local proporcional ao risco e definir orçamento/condição de parada.

### 9.8 Acionamento por eventos e prazos — direção definida em 08/10/2026

O proprietário definiu que acordar tarefas a cada intervalo fixo não deve ser o mecanismo principal de processamento. O fluxo normal reage ao trabalho confirmado; mudanças causadas somente pelo tempo são agendadas para o próximo vencimento conhecido. Uma verificação periódica pode permanecer como reserva para recuperar sinais perdidos, divergências ou interrupções, com frequência e custo medidos.

Isso entra **durante a implementação dos rankings**, nos cortes 4 e 5:

- Acordar o produtor após o commit que registra trabalho pendente. O sinal é um aviso; a pendência durável é a fonte de verdade. Inicialização e reconexão devem conferir pendências sem depender de um evento novo ou da próxima rodada do fallback.
- Agrupar mudanças próximas com espera máxima definida, sem converter o agrupamento em uma barreira fixa de 30/60 segundos. Enquanto houver trabalho elegível, continuar em lotes limitados; ao atingir o orçamento da rodada, ceder execução e programar continuação sem aguardar o fallback.
- Preservar uma atualização que chega enquanto o produtor está ocupado, inclusive na passagem entre terminar o lote e ficar ocioso. Um sinal recebido durante processamento não pode ser descartado pela proteção contra execução simultânea.
- Agendar transições das janelas atual/anterior, mudanças dos intervalos usados pela fórmula e vencimento da elegibilidade de recém-criadas. Reprogramar quando uma mudança antecipar o próximo prazo. Usar agendamento agregado e limitado, sem criar um timer por post, voto ou visitante. A precisão deve cumprir as fronteiras e o atraso máximo definidos para a publicação.
- Manter limites globais de concorrência, memória, conexões, tempo e escrita. Acionamento por evento não autoriza um cálculo por voto nem trabalho ilimitado durante um pico; retries obedecem ao próximo prazo permitido.
- Recuperar pendências com varreduras limitadas na inicialização e no fallback, reconhecendo revisões somente depois do processamento válido. Evitar que cada verificação de reserva provoque recálculo global ou escritas sem mudança.

O aceite deve comprovar processamento normal com o fallback periódico desabilitado, atualização temporal sem atividade nova, continuidade de lotes com fila maior que o limite, chegada de eventos durante execução e recuperação após falha/perda de sinal. Medir atraso do evento até a geração/API, custo ocioso e vazão sob carga; os números de atraso, agrupamento e fallback continuam a calibrar.

Os contratos necessários ao próprio ranking devem nascer com esse ciclo de vida. Push comum foi incluído no corte 8; manutenção privada e demais rotinas ficam na etapa posterior: não condicionar a entrega dos rankings a uma refatoração geral, nem criar antecipadamente um serviço central que concentre regras de todos os domínios.

## 10. Etapas propostas de implementação

### Ampliação autorizada em 08/10/2026

O proprietário solicitou implementar os cortes 9–10, acrescentar visualizações
nos posts, preparar commits separados e enviar/ativar a entrega na VPS pelo
executor existente, depois da revisão operacional e dos checks. Percentuais de
crescimento permanecem no backend; a interface não os publica.

Para visualizações, escolheu **únicos estimados por navegador/post**. Cada post
recebe uma marca aleatória própria no navegador, independente de login. O
backend conserva somente seu hash vinculado ao post até a exclusão desse post,
sem wallet, conta, IP, fingerprint ou identificador comum entre posts. A
interface mostra somente o total. Limpar o armazenamento, trocar de navegador
ou usar outro aparelho pode contar novamente; isso não comprova pessoas
físicas únicas e não constitui proteção completa contra bots.

A admissão exige post publicamente visível e exposição real na interface, com
controle de repetição e orçamento. A contagem começa na ativação; não inventar
visitas anteriores. Visualizações não entram automaticamente na fórmula de
Trending: incluir um novo sinal exigiria revisão da fórmula e de abuso.

**Ponto importante:** a aprovação desta métrica cobre a retenção da marca por
post, incluindo visitantes anônimos. Não autoriza histórico de navegação por
conta, rastreamento entre posts ou serviços externos de analytics. A ativação
de serviços/migrações exige concretizar e verificar os contratos operacionais,
preservando o outro projeto e os limites totais existentes.

O proprietário autorizou os cortes 1–8 locais, concluídos nesta execução. Cada corte inclui validação de seus contratos; os cortes 9–10 estão implementados, com aceite operacional em andamento.

| Corte                                | Entrega                                                                                               | Estado                                                               |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1 — Contrato e calibração            | Fórmula versionada, seis sinais, ganho absoluto/proporcional, critérios de novidade e histórico       | Implementação inicial e calibração local                             |
| 2 — Dados necessários                | Criação real/idade desconhecida, deltas agregados de positivos, retenção e contabilidade              | Migrações 044–049 verificadas localmente; ativação autorizada        |
| 3 — Métricas                         | Únicos, conversas, retorno, constância, autoria e upvotes nas janelas atuais/anteriores               | Cálculo por lote e testes de fronteiras/reversões                    |
| 4 — Eventos e agendamento            | Revisões duráveis, avisos após commit, transições sem eventos, recuperação e fallback                 | Consumidor por eventos/prazos; fallback de cinco minutos             |
| 5 — Produtor e publicação            | Corte fixo por rodada, métricas/fórmula versionadas, universo completo, geração atômica e orçamento   | Produtor global e cache de 64 MiB; pressão invalida cursores antigos |
| 6 — API e paginação                  | Consumo da publicação, páginas de 24, cursor por geração/filtro e tratamento de indisponibilidade     | Sem recomputação das métricas por visitante                          |
| 7 — Interface e aceite               | Ranking no lugar de Explorar, três classificações, períodos, posições e experiência pública           | Interface desktop/mobile; verificações e evidência locais            |
| 8 — Push comum                       | Avisos confirmados, drenagem de lotes de 16, próximo retry e preservação de consentimento/privacidade | Sem espera normal de 30s; retry de 60s somente após falha            |
| 9 — Manutenções e coletores          | Migrar rotinas existentes por responsabilidade                                                        | Implementado localmente; validação final em andamento                |
| 10 — Isolamento e aceite operacional | Processos independentes quando necessário, recursos, reinício e operação                              | Três workers preparados; ativação revisada em andamento              |

Na implementação, centralizar cálculo e elegibilidade em módulos coesos, com interfaces explícitas entre descoberta, contribuições e votos. Os handlers adaptam transporte e chamam operações; não concentram a fórmula, SQL e regras de autorização.

### 10.1 Revisão dos workers existentes depois da entrega dos rankings

Esta é a próxima frente solicitada pelo proprietário, após Trending/Maiores/recém-criadas. A revisão do push comum foi antecipada ao corte 8; os demais coletores e novas separações de serviços ficam nos cortes 9–10. A investigação do código encontrou rotinas periódicas dentro do processo web, além dos executores de mídia e envio externo de push já separados. A tabela registra os comportamentos atuais e a direção de revisão; não comprova o estado dos processos na VPS nem a eficiência dos intervalos existentes.

| Rotina                                  | Comportamento encontrado                                                                                                                                             | Direção da revisão                                                                                                                                                                 |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Push comum                              | A cada 30s, busca até 16 alvos de aparelho e processa um lote; o restante aguarda outro acionamento                                                                  | Acordar após admissão confirmada, drenar alvos elegíveis em lotes com orçamento e agendar retries. Preservar consentimento, elegibilidade, privacidade e agrupamento por aparelho  |
| Manutenção de conteúdo                  | A cada 30s, encadeia limpeza social, mídia de grupos, marcadores diários, status e representantes; uma falha inicial pode impedir as etapas seguintes naquela rodada | Cada responsabilidade reage a suas mudanças e próximos prazos, com progresso/erro próprios. Evitar que uma falha de limpeza impeça manutenção sem relação com ela                  |
| Mídia pública                           | Limpeza a cada 60s, além de inicialização e operações que já acionam coleta                                                                                          | Aproveitar acionamentos existentes, acrescentar próximos vencimentos e manter reconciliação de temporários/órfãos como reserva                                                     |
| Avatares/fotos de comunidades pendentes | Coleta periódica a cada 30s                                                                                                                                          | Acionar retirada quando o estado mudar e agendar expiração; retirada lógica continua valendo mesmo antes da coleta física                                                          |
| Fila de moderação pública               | No runtime atual, executor de análise não selecionado; rodada de 60s recupera leases e atualiza política                                                             | Quando a análise estiver aceita, acordar por trabalho confirmado/mudança de política; agendar retries e leases. Essa revisão não aceita detector nem libera mídia                  |
| Chamadas e retorno de recuperação       | Push de chamada já tem acionamento imediato e reserva de 1s; há limpeza de estado de chamadas a cada 1s e pedidos temporários de recuperação a cada 30s              | Preservar a entrega imediata, revisar agendamento dos prazos e manter o estado efêmero. Não criar fila durável ou histórico de chamadas/recuperação por consequência desta mudança |

Prioridade proposta: push comum, manutenções acopladas e coletores; depois, fila de moderação conforme seu aceite e demais expirações. O heartbeat SSE tem função de manter/verificar a conexão, e os timeouts de rede/protocolo têm prazos próprios. Avaliar esses mecanismos pela finalidade; a direção definida elimina a espera periódica para descobrir trabalho normal, sem remover controles necessários ao transporte. Revalidação de domínio também acontece pelo avanço do tempo e deve usar seu próximo prazo, preservando as regras atuais de confiança.

No push comum, revisar separadamente o campo `next_attempt`: o comportamento anterior agendava mais 60s mesmo após sucesso, e uma nova admissão não redefinia esse prazo. No corte 8, sucesso deixa o próximo trabalho disponível, novas admissões redefinem o prazo, e falhas mantêm o retry de 60s. Distinguir agrupamento de alertas, espera para retry e disponibilidade do consumidor. A revisão deve retirar espera criada apenas pela mecânica da fila, preservando as regras de notificação; não pressupor que reduzir constantes resolva o fluxo.

Para cada rotina, primeiro registrar origem do trabalho, estado pendente, prazo, orçamento, erro e recuperação. Reutilizar os contratos existentes quando bastarem; persistir somente o trabalho cuja durabilidade seja exigida pelo produto. Depois conectar eventos confirmados e agendamento, comprovar que funcionam sem o fallback normal e verificar recuperação com sinais perdidos. Migrar por responsabilidade, evitando execução concorrente duplicada e mantendo fallback durante a transição. Critérios mínimos: fila maior que um lote avança sem esperar outra rodada fixa; vencimentos funcionam sem atividade; reinício não perde trabalho durável; falhas não simulam sucesso; custo ocioso e atraso melhoram sem ampliar recursos ou alterar retenção.

Revisar também o isolamento de falhas: módulos independentes evitam acoplamento de regras, enquanto processos separados podem limitar falhas fatais e permitir reinício independente. Separar executores quando houver necessidade concreta de recursos, permissões ou recuperação; não criar um serviço por timer. Para cada separação, definir contratos, supervisão, encerramento, orçamento total de CPU/RAM/conexões, dependências de inicialização e comportamento do web quando o executor estiver indisponível. Separar o processo não resolve, sozinho, uma dependência obrigatória de inicialização. Serviços de mídia/push já isolados devem manter suas fronteiras. Configuração/ativação de novos serviços na VPS exige revisão operacional própria e rollback restrito ao 0xDMme.

## 11. Parâmetros para revisão e trabalho posterior

| Item                        | Revisão ou pendência                                                                                                                                                        |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fórmula                     | Pesos iniciais, regularização 100, amortecimento 50 e bônus máximo 1,5 escolhidos; revisar com comportamento real antes de alterar versões                                  |
| Conversa/retorno/constância | Conversa com resposta de outro autor, interseção de participantes entre janelas, 24 intervalos móveis de uma hora/7 de 24h; perfis distintos não comprovam pessoas únicas   |
| Upvotes                     | B escolhida: soma de ganhos líquidos positivos por post; logs por post/milissegundo sem votantes, horizonte lógico de 14 dias; aquecimento e reversões explícitos           |
| Recém-criadas               | Sete dias pelo proprietário; parâmetros iniciais de 500 seguidores e três participantes; antigas sem data comprovada fora desse filtro                                      |
| Dados e recursos            | Cache de gerações de 64 MiB, TTL máximo de cinco minutos, coleta de 256, fonte/revisão por comunidade, orçamento global existente; capacidade operacional da VPS não medida |
| Acionamento                 | Até 100 ms de agrupamento, lotes de 32, uma conexão de sinais além do pool de quatro, prazos reais e fallback de cinco minutos; push com 16 alvos e retry de 60s            |
| Interface                   | Ranking/Trending/24h como início; Maiores sem sugerir crescimento do período; rotas antigas preservadas e indicação de histórico incompleto                                 |
| Arquivamento                | Fora de Trending/recém-criadas; leitura/Maiores/listagem completa preservadas                                                                                               |
| Operação posterior          | Três workers próprios implementados; revalidação de recursos e ativação revisada na VPS                                                                                     |

**Ponto importante:** o plano inclui os seis critérios, separa atualização de métricas/publicação/consumo e define eventos e prazos como acionamento principal, com verificação periódica de reserva. Isso entra no ranking desde a implementação; a migração dos demais workers existentes vem depois da entrega das três classificações. Os cortes 1–8 alteram o código local, incluindo o produtor e o push comum. Novos serviços e migrações ainda não foram ativados; os cortes 9–10 estão implementados e em aceite operacional. Os parâmetros escolhidos ficam sujeitos à revisão do proprietário e os ensaios locais não comprovam capacidade de produção.

## Referências

- [Plano central de comunidades](../DECISOES_E_PLANO_DE_IMPLEMENTACAO.md#64-comunidades-públicas--camada-social-planejada) e [contrato implementado de descoberta](COMUNIDADES_PUBLICAS.md#corte-6--feed-e-descoberta-local-em-06102026).
- [Descoberta no backend](../src/server/database/community-discovery.ts) e [contrato compartilhado](../src/shared/community-discovery/index.ts): Ranking/Trending, Maiores e recém-criadas consomem a geração publicada; feeds de posts mantêm suas classificações próprias.
- [Avisos de alterações](../src/server/database/changes.ts) e [coordenação de transações](../src/server/database/contacts.ts): avisos após commit, internos ao processo; esse mecanismo permanece próprio de avisos existentes; ranking usa estado durável e a conexão PostgreSQL de sinais.
- [Votação](../src/server/database/community-interactions.ts), [migração dos votos](../src/server/database/migrations/031-community-interactions.sql) e [projeção de posts](../src/server/database/community-posts.ts): posições atuais/placar líquido preservados; deltas temporais acrescentados pela migração 044.
- [Comunidades](../src/server/database/migrations/029-communities.sql), [criação/leitura](../src/server/database/communities.ts) e [contrato público](../src/shared/communities/index.ts): ausência histórica de data; a migração 044 registra futuras criações sem inventar idade passada.
- [Fila comum de push](../src/server/notifications/index.ts) e [admissão/seleção/finalização](../src/server/database/daily.ts): corte 8 remove a rodada principal de 30s, mantém lotes de 16 e separa retry de disponibilidade para novos avisos.
- [Manutenção de conteúdo](../src/server/messages/index.ts), [coleta de mídia pública](../src/server/community-media/index.ts), [avatares/fotos pendentes](../src/server/public-moderation/service.ts) e [fila de moderação](../src/server/public-moderation/worker.ts): rotinas a revisar na etapa posterior; seleção do executor em [main](../src/server/main.ts).
- [Push de chamadas](../src/server/notifications/call-push.ts), [estado de chamadas](../src/server/calls/index.ts), [retorno de recuperação](../src/server/recovery-return/index.ts) e [atualização SSE](../src/server/message-live/index.ts): acionamento imediato, expiração de estado efêmero e heartbeat têm finalidades distintas.
- [Processador de mídia](PROCESSADOR_MIDIA_COMUNIDADES.md) e [push](BLOCO_10_NOTIFICACOES_E_EXPERIENCIA.md): fronteiras e contratos dos executores já separados.
- [Guia oficial da FOMO](https://fomo.family/blog/learn/navigating-your-fomo-app), consultado em 08/10/2026: descreve o filtro Trending; não apresenta a equação de ordenação. A referência é de experiência, não de fórmula comprovada.

## Evidência e limites da execução local

As migrações 044–047 são versionadas: dados e sinais, corte persistido por rodada, contabilidade de publicação por lote/versões e orçamento de cache. Um corte interrompido por mais de 30s é reconstruído com uma âncora nova para não depender de deltas fora da retenção. Métricas são calculadas em lotes de 32; somente a publicação percorre os candidatos completos. Sob capacidade insuficiente para uma geração inteira, o produtor falha explicitamente e não publica um top truncado ou lista vazia de sucesso.

Ensaio local sintético de 1.003 comunidades publicadas (1.000 criadas pelo teste e três preexistentes): publicação inicial de cerca de 417 ms, atualização de uma comunidade de 75 ms e leitura publicada média de 2,7 ms. A referência experimental repetiu os seis cálculos para as 1.000 comunidades do teste por leitura; não é benchmark da antiga classificação simples nem prova de escala da VPS. O intervalo gerou aproximadamente 3,8 MB de WAL; relações/índices do ranking ocupavam 12,7 MB; RSS observado do executor com fixtures foi de 108 MB. WAL/RSS incluem trabalho local além do produtor e não são picos isolados nem limites de produção. Métricas/logs brutos ficam em `.local/`; o relatório final registra as verificações concluídas. Permanecem necessários dimensionamento operacional e aceite em aparelhos físicos antes de prometer capacidade ou publicar uma release.

A geração e suas entradas são lidas na mesma consulta/snapshot SQL; uma coleta concorrente não devolve cabeçalho válido com entradas desaparecidas. Dados públicos de apresentação continuam sendo revalidados, incluindo arquivamento e vencimento de novidade. A preparação de fontes recebeu uma exceção limitada aos dez novos caminhos do ranking no manifesto, sem aumentar limites de bytes ou autorizar migrações/ativação; detalhes em [Git e deploy](GIT_E_DEPLOY.md#preparação-local-do-ranking--08102026).

Verificações locais: 402 testes unitários, integrações de ranking/descoberta, votação/replies/push, capacidade global e regressões relacionadas; 115 testes do executor de release e 16 da avaliação local. Lint, TypeScript, fronteiras de dependência, licenças, formatação e builds verificados. A interface foi conferida com dados sintéticos no navegador em 1280, 390 e 320 px: três classificações, posição, Maiores sem seletor de período, recém-criadas com 24h/sete dias e feeds ainda com 30 dias/todo o histórico. Sem rolagem horizontal no recorte mobile. Evidências privadas em `.local/`; isso não substitui iPhone/Android físicos, emissor push externo real, CI remota do commit final ou aceite operacional da VPS.

## Entrega dos cortes 9–10 e visualizações — 08/10/2026

A execução ampliada substitui as pendências antigas dos cortes 9–10. O fluxo
principal usa sinais após commit, continuidade de lotes e o próximo vencimento
real. Cada consumidor tem estado de execução e erro próprios; falha de anexos
não interrompe status ou ranking. A reserva de cinco minutos reconcilia trabalho
perdido; erro real usa retry de cinco segundos. Chamadas, push de chamadas e
retorno de recuperação agendam os prazos dos seus estados em RAM, sem ganhar
histórico persistente. Heartbeats necessários ao protocolo continuam existindo.

Na VPS, três serviços próprios: `0xdmme-ranking-worker.service` para geração dos
rankings; `0xdmme-content-worker.service` para cofre/anexos/social/grupos/status/
domínios; `0xdmme-public-worker.service` para coleta de mídia pública, avatares,
fotos, marcas de visualização e fila de moderação. O web usa modo `isolated`.
Desenvolvimento/fixtures conservam modo `embedded`. A conexão de sinais mantém
uma trava exclusiva por responsabilidade; perder essa conexão encerra o worker,
que será reiniciado pelo systemd. Nenhum worker executa migrações: verifica
versões/checksums. Avisos de alteração de conteúdo entre worker e web incluem
somente IDs internos das contas afetadas e flags, sem mensagens, carteiras ou
conteúdo; são efêmeros e entregues após commit. Lacuna na conexão fecha os streams
para reconstrução autenticada de estado. Sinais de trabalho não têm payload.

Cada worker tem pool de uma conexão mais a conexão de sinais/trava; web mantém
pool de quatro mais sinais. São até 11 conexões regulares para os quatro
processos. Limites iniciais por worker: CPU 10%, RAM 160 MiB, heap 64 MiB,
24 tarefas. A soma dos tetos individuais não representa RAM reservada: o limite
compartilhado existente de 768 MiB/50% CPU/128 tarefas continua prevalecendo.
São parâmetros iniciais, dependentes de medição, sem promessa de escala de
produção. Os outros executores do projeto mantêm seus contratos.

Visualizações aparecem nos cards de posts e respostas públicos, para logados
ou visitantes. Conta quando pelo menos metade do card (ou 300 px de altura para
cards grandes) permanece visível por um segundo com a aba em primeiro plano.
Um único observador e filas limitadas a 256 cards/marcas, lotes de 24 e até duas
tentativas evitam acumulação ou retry infinito. O browser conserva uma marca
aleatória diferente por post; backend conserva somente SHA-256 ligado ao post,
sem timestamp de visita, conta, IP ou identificador comum entre posts. A mesma
marca repetida não incrementa, inclusive em pedidos concorrentes. O número é
uma estimativa de navegadores, não de pessoas físicas. Dois dispositivos ou
limpar armazenamento podem contar novamente. Sem armazenamento persistente,
a visualização não é admitida para evitar contar cada reload. Histórico anterior
à ativação não é inventado; bots não são identificados por fingerprint.

Cada marca custa 128 bytes na contabilidade lógica global. Exclusão retira as
marcas em lotes de 128; remoção restaurável conserva deduplicação. Posts
removidos/excluídos não admitem novas visualizações. Contadores não alteram a
revisão do ranking e **não entram na fórmula de Trending v1**. Crescimento
percentual continua apenas no backend; indicadores adicionais de crescimento
ficam para revisão de produto.

Migrações 048–049 acrescentam marcas/contadores, isolam updates de views dos
sinais de ranking e criam avisos de manutenção e índices de expiração. A
transição operacional 043→049 deve preservar todas as linhas anteriores,
ignorando apenas as colunas novas e o ajuste contábil derivado; idade histórica
permanece desconhecida e views começam em zero. O executor existente faz backup,
ensaio de restauração, checksums, comparação de objetos/configuração e partida
verificada dos três workers. Antes de abrir escritores, rollback retorna dados,
release e somente as adições de unidades/drop-in. Depois de abrir escritores,
uma falha para nossos serviços e preserva dados novos para revisão, sem restaurar
backup antigo por cima de novas escritas.

**Ponto importante:** implementação local não prova ativação. CI do commit final,
recibo do deploy, consumo medido e teste de reinício independente serão registrados
em `.local/` e resumidos na entrega. Moderação real continua dependendo do aceite
já documentado; esta entrega não escolhe nem libera um detector experimental.

Validação da entrega ampliada: 405 testes unitários, teste adicional de coleta
concorrente de arquivos, 122 testes do executor e 16 do laboratório. TypeScript,
lint, fronteiras, licenças, formatação e os dois builds verificados. A suíte de
persistência identificou uma expectativa antiga de comunidades inativas no
Trending: Maiores conserva essas comunidades e Trending exige sinais; após
ajustar esse contrato, os 11 testes de descoberta passaram. Demais resultados
válidos foram preservados; integração real de mídia local também passou com
11 testes e FFmpeg/ffprobe já instalados. Navegador anônimo confirmou 0→1 e
reload sem duplicar; em 320 px não houve overflow horizontal. Evidências em
`.local/`. CI remota e recibo operacional pertencem ao commit final e serão
conferidos durante a ativação, sem usar estes ensaios como prova de escala.
