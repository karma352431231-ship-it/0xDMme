# Recalibração com prioridade em poses — 10/10/2026

O proprietário autorizou continuar em uma nova branch para preservar suas alterações concorrentes. `codex/moderation-poses` parte da integração `8a793e3` e incorpora a correção neutra `236e6e9`. Esta tarefa cuida da decisão entre os modelos existentes, descrições gerais de poses/exercícios e respectivos testes/documentação; não edita o checkout principal. `.local/` permanece no checkout principal, em uma pasta de avaliação própria; dependências do worktree seguem o lockfile existente.

A prioridade passa a ser distinguir poses que simulam/apresentam atos sexuais de provocação, roupa curta e exercício. Pinturas de IA não são uma nova condição de pesquisa desta rodada. A exceção artística vigente permanece, com os controles existentes como regressão; autoria por IA não dispensa as demais regras. Não há nova coleta voluntária, treinamento de pesos, provedor, inferência externa, instalação na VPS ou migração por consequência.

Os cinco controles permitidos retidos deixam de ser validação independente ao entrar no ajuste. Usar somente suas medições já existentes, preservando modelo, pixels/preparo, procedência e referências. Uma nova taxonomia geral pode descrever pares adultos simulando atos com roupa e exercícios não sexuais; não usar nomes, origem, rótulo esperado ou detalhes de um arquivo como entrada do detector. Congelar descrições/limites antes de inferir os novos controles públicos de poses. Licença/proveniência e referência de política são verificações separadas; uma categoria genérica não comprova um ato específico e casos sem evidência suficiente continuam incertos.

**Ponto importante:** a hipótese ajustada continua experimental até revalidação. Não ativar o detector nem expor uploads somente porque a regra passou em dados usados no ajuste. A integração posterior deve preservar a prova neutra na resolução preparada original e a cobertura de todos os frames/derivados, vinculada aos bytes exatos.

## Resultado da rodada congelada

Descrições, limites e vetores foram congelados antes de inferir os quatro controles novos. Os mesmos pesos OpenCLIP ViT-B/32 FP32 e Viddexa Nano foram conferidos por hash. A decisão usa somente scores das visões completas; nome, origem e referência são anexados ao relatório depois da inferência. A taxonomia acrescenta sete descrições gerais de atos simulados com roupa e exercícios/convívio sem atividade sexual, sem treinamento de pesos.

| Conjunto                                                       | Permissões | Retenções | Recusas |
| -------------------------------------------------------------- | ---------- | --------- | ------- |
| 19 referências permitidas existentes                           | 19         | 0         | 0       |
| 9 referências proibidas existentes                             | 0          | 4         | 5       |
| 5 referências existentes sem anotação suficiente               | 0          | 5         | 0       |
| 2 controles novos descritos como yoga                          | 2          | 0         | 0       |
| 1 controle novo descrito especificamente como simulação de ato | 0          | 0         | 1       |
| 1 controle novo com descrição ambígua                          | 0          | 1         | 0       |
| 54 controles neutros exatos                                    | 54         | 0         | 0       |

Os cinco permitidos antes retidos foram liberados. Uma reprodução de ato sexual antes recusada ficou retida; permanece sem permissão, mas a queda de recusa para retenção não deve ser apresentada como melhora da detecção. O caso novo de pose foi recusado por evidência contextual corroborada pelo detector genérico; este resultado sozinho não comprova discriminação de todas as poses com roupa. As duas posturas de yoga não foram tratadas como atos sexuais. Os casos ambíguos não contam como acertos de precisão.

Os 33 arquivos existentes são desenvolvimento/regressão desta recalibração. Os quatro novos têm referências descritas por fontes públicas e licenças verificadas, sem anotação humana independente dos pixels; identificação de papéis adultos pela fonte é provisória. O conjunto é pequeno e não estima a taxa de erros em publicações futuras. Nenhuma imagem voluntária expirada foi restaurada ou solicitada. Manifestos, atribuições, pixels públicos e medições permanecem privados em `.local/`.

Inspeção, decodificação, preparo e inferência dos quatro controles novos, com modelos carregados no Mac, levaram de `0,489 s` a `0,574 s` por arquivo; mediana `0,532 s`. Nos 33 arquivos existentes, mediana `0,403 s` e máximo `1,019 s`. Esses tempos excluem inicialização, upload, fila, persistência e VPS. Não estabelecem latência de publicação ou de vídeos.

Os sete testes novos cobrem consenso de ato simulado mesmo com score genérico baixo, divergência entre visões, retenção em empate, exceção artística sem liberar atos e rejeição de entradas inválidas. Os demais 22 testes Python existentes passaram, incluindo os nove testes do avaliador que requerem uma porta local efêmera. Lint, TypeScript, limites de dependências e formatação passaram. Não foram alterados módulos do aplicativo, dependências, banco ou serviços.

**Ponto importante:** esta rodada delimitada está concluída, com avanço observável sobre as retenções indevidas e sem liberação proibida observada. A política/taxonomia são componentes experimentais testados; não são um detector conectado ao scanner. Permanecem integração do runtime exato, prova neutra antes da redução, todos os frames/derivados, medição na VPS e aceite operacional. Não ativar uma branch que omita as alterações ainda em andamento na integração principal.

## Integração posterior autorizada

Após esta rodada, o proprietário pediu “faz o codigo”. O runtime exato e o adaptador foram conectados à fila do aplicativo no mesmo branch isolado, preservando a taxonomia/limiares congelados, a prova neutra na resolução preparada original e a análise integral dos frames/miniaturas. A observação acima descreve o estado ao concluir a recalibração; a implementação posterior não equivale a ativação ou aceite de precisão. Configuração privada, contratos, análise posterior de vídeos e pendências operacionais em [INTEGRACAO_MODERACAO_POSES.md](INTEGRACAO_MODERACAO_POSES.md).
