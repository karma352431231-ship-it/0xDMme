# Bloco 11 — Grupos e status

Implementação local concluída em 04/10/2026, com regras aprovadas e validação descritas abaixo. A ativação das migrações na VPS e os ensaios físicos continuam separados desta entrega.

## Organização aprovada

O proprietário definiu que grupos e chats individuais compartilham a lista e a área da aba **Conversas**. **Status** terá item próprio na navegação **Seu espaço**. Preservar a simplificação dos fluxos aprovada em 04/10/2026; não introduzir painéis técnicos no uso normal.

## Contratos já aprovados

- E2EE com o SDK Matrix já adotado. Entrada, saída, remoção e mudanças de aparelhos exigem autorização verificável e chaves apropriadas aos períodos de participação. Novo membro não recebe histórico anterior automaticamente.
- Até 200 participantes. Dono nomeia administradores; dono/admins gerenciam convites e removem membros; somente o dono limpa o cofre ou exclui o grupo. Transferência explícita aprovada em 04/10/2026, substituindo o adiamento inicial: novo dono precisa ser membro, aceitar e comprovar saldo/vagas para assumir; somente então o antigo dono pode sair. Não transferir automaticamente nem escolher sucessor aleatório.
- Cofre de cada grupo: 1.000.000.000 bytes, com 750.000.000 de mídia e 250.000.000 de texto/controle. Não copiar automaticamente conteúdo compartilhado para os 300 MB pessoais. Contar bytes persistidos e reservas concretas de upload; grupo vazio não reserva 1 GB.
- Margem operacional de 1.000.000 bytes aprovada em 04/10/2026: novos conteúdos e suas chaves cifradas não consomem o último 1 MB dos 250 MB de texto/controle. Convites e mudanças administrativas podem usar essa margem dentro do espaço efetivamente disponível; não pré-alocar disco nem prometer administração ilimitada.
- Anexos de até 3 MB, incluindo fotos e voz já suportadas; sem vídeo nesta etapa.
- Criação: saldo do token do projeto no momento da operação, com 10.000 tokens para até dois grupos, 50.000 para dez e 100.000 sem teto do tier. Grupos existentes são preservados se o saldo cair. Arquivados contam; participação não exige tokens. Capacidade global e frequência continuam aplicáveis.
- Frequência de criação aprovada: até uma criação por minuto e dez por hora por conta, inclusive no tier sem teto. Contar criações concluídas atomicamente, sem liberar frequência ao excluir ou arquivar um grupo.
- Bloqueio entre pessoas não oculta as mensagens delas no grupo compartilhado. Continua impedindo conversa direta, convites diretos e acesso a status entre as duas contas.
- Após transferência, o antigo dono fica como membro comum e pode sair; o novo dono poderá nomeá-lo admin depois. Quem sai ou é removido perde acesso ao cofre remoto; reentrada começa outro período, sem recuperar automaticamente o anterior. Cópias locais/arquivos já recebidos continuam sob controle de quem os conservou.
- Limpeza rotativa: aos 90% da cota de mídia, selecionar as mídias antigas a remover até 70%, avisar todos por 24 horas e congelar essa seleção. Pode remover mídia ainda pendente; não registrar como entregue. No teto, recusar novos anexos durante o aviso. Texto não terá expiração nem temporizador nesta etapa, dentro da reserva finita de texto/controle.
- Status de texto/foto, por padrão para todos os contatos aprovados, com exclusões opcionais por perfil e expiração em 24 horas. Status fica excluído dos backups. Conteúdo e mídia cifrados; expiração não promete eliminar cópias externas.
- Alterações dos contatos/exclusões valem somente para próximos status: cada publicação congela sua audiência aprovada. Preservar a regra de bloqueio já aprovada que impede acesso a status entre as duas contas; não conceder acesso novo a uma publicação antiga.
- Ensaios locais/Devnet e saldo sintético identificado são permitidos. Fixtures não autorizam criação em produção; não lançar token, contratar RPC ou abrir exceção de elegibilidade automaticamente.

## Decisões pendentes

O proprietário confirmou que o token ainda não existe e autorizou continuar com testes locais. Rede/mint do token real e configuração RPC continuam pendentes; criação pública permanece desativada. Propostas apresentadas ao proprietário não são autorização enquanto não houver resposta. A margem operacional de 1 MB foi aprovada posteriormente, conforme contrato acima. Preservar os percentuais já aprovados de 90% → 70%, confirmados pela pergunta posterior que explicitamente substituiu a de 80%.

No servidor local, `HASH_TALK_GROUP_FIXTURES=1` habilita explicitamente saldo sintético de 10.000 tokens (tier de dois grupos), somente com perfil de desenvolvimento e banco `hash_talk_test` ou variante exclusiva. O servidor mobile de teste usa essa mesma proteção. A operação autenticada `group-mode` identifica o modo para a interface; nenhum saldo vem de entrada do navegador e o perfil de staging recusa fixtures.

## Investigação técnica

O código atual tem transporte Matrix autorizado para conversas individuais. O SDK instalado oferece sessões Megolm de grupo, distribuição de chaves Olm e exportação/importação de sessões; isso não torna o armazenamento, governança e admissão existentes automaticamente adequados a grupos. Implementar contratos próprios e preservar as rotas individuais.

A orientação do [Matrix sobre E2EE](https://matrix.org/docs/matrix-concepts/end-to-end-encryption/) exige invalidar sessões de envio nas mudanças relevantes de participação. Conferir também recuperação em novo aparelho, reentrada e acesso histórico sem uma chave permanente global de grupo. Não publicar segredos/chaves ou plaintext no servidor.

A futura consulta de elegibilidade deve usar quantidades inteiras e decimais verificados, conforme a [resposta RPC do Solana](https://solana.com/docs/rpc/http/gettokenaccountsbyowner), e conferir o mint/rede aprovados. Falha de RPC permanece inconclusiva; não conceder tier como fallback.

## Entrega local em 04/10/2026

Grupos e conversas individuais compartilham a lista e a área de chat em **Conversas**. A interface permite criar, convidar, aceitar, recusar, nomear administradores, remover membros, sair e oferecer/aceitar a propriedade. A elegibilidade é conferida novamente ao concluir a criação ou transferência; o antigo dono fica como membro comum. Nomes e mensagens dos grupos permanecem cifrados. A lista e o histórico têm paginação limitada, e o grupo selecionado é conferido diretamente quando está fora da primeira página.

Governança e períodos de participação são assinados; as mensagens usam Megolm do SDK Matrix já adotado, com distribuição Olm e recuperação por participante. Trocas de membros/aparelhos invalidam a sessão de envio apropriada. Convites vinculam a identidade do destinatário; bloqueios impedem convites diretos e status, preservando a conversa no grupo compartilhado. Quem sai ou é removido mantém somente as cópias locais/exportadas que já conservava, sem acesso ao cofre remoto.

O chat suporta texto, fotos, arquivos de até 3 MB, voz de até 90 segundos, painel de emojis e retomada limitada dos envios pendentes. Mantém os checks cinza/azul conforme recebimento e consentimento de leitura; silenciar por 24 horas, arquivar e fixar também alcançam grupos. Atualizações normais preservam a reprodução já aberta; bloqueio ou revogação são conferidos pelos mecanismos compartilhados de autorização.

O SSE existente avisa sobre mensagens, governança, status, leitura e limpeza. Conteúdo/assinaturas/ACK continuam na API autenticada. ACK de grupo desperta apenas os remetentes afetados, uma vez por mudança efetiva, evitando avisar todos os membros a cada confirmação. Conteúdo já autenticado é reutilizado do cache cifrado, com conferência de hash e participação atual; mensagens novas seguem a validação completa do SDK. A chave de recuperação é aberta no máximo uma vez por chave em cada página e liberada ao terminar, inclusive em falha. O painel de cofre só consulta detalhes quando aberto. Não foram ampliados os limites de pedidos nem criadas cotas arbitrárias de canais/aparelhos.

Mídias usam namespace separado e upload cifrado em partes, com reserva concreta nos 750 MB compartilhados. A manutenção seleciona até 64 mensagens por lote, congela a seleção e inicia o aviso coletivo de 24 horas após concluí-la; remove mídias até 70%, preservando texto e sem inventar entrega. Durante o aviso, uploads que ultrapassem a cota são recusados. A interface mostra prazo, bytes e páginas de itens selecionados, com acesso à exportação. Arquivos continuam cobrados até a coleta durável; excluir o grupo mantém sua vaga enquanto a remoção física está pendente. Limpeza explícita inclui o conteúdo do cofre, com confirmação do dono.

**Status** tem item próprio em **Seu espaço**, publica texto/foto cifrados e congela a audiência de contatos aprovados a cada publicação. Exclusões por perfil afetam somente as próximas publicações; bloqueio continua imediato. Cada leitor recebe apenas sua própria cápsula, sem a lista de outros destinatários. A sessão SDK por status existe somente em memória, e a expiração de 24 horas retira conteúdo remoto/mídia através da manutenção limitada. Status não é um tipo permitido no backup, nem uma fonte de exportação.

O backup completo inclui metadados assinados, mensagens e mídias autorizadas dos grupos, além das cópias independentes conservadas no aparelho. A importação integra esse histórico à lista de Conversas sem conceder participação ou acesso remoto. Exportar não libera cota compartilhada. Resetar o cofre pessoal não apaga grupos nem status; itens indisponíveis deixam o backup incompleto e bloqueiam o reset. Os limites e formato cifrado do bloco 07 foram preservados.

Migrações **020–024** aplicadas exclusivamente ao banco local de testes e mantidas imutáveis. Nenhuma migração ou ativação do Bloco 11 na VPS foi executada. Nenhuma dependência, licença, serviço pago ou relay externo foi acrescentado. O build remove somente espaços supérfluos do JavaScript, conserva avisos legais e fontes preferidas e permanece dentro dos mesmos limites por arquivo e de distribuição.

## Validação

- Lint com tipos, TypeScript estrito, fronteiras de módulos, licenças, formatação e build local. Build com 38 assets públicos, sem ampliar os tetos existentes. Complexidade limitada pelas regras existentes; divisões feitas por responsabilidades, sem limite artificial de linhas, suppressions ou `any`.
- Suíte geral de 243 cenários: 241 passaram na execução conjunta; dois checks de ferramentas excederam o timeout sob carga paralela e passaram na repetição isolada. A regressão adicional do cache usa mensagem cifrada real e verifica redução de consultas, adulteração e perda de participação.
- Quatro cenários de integração de grupos passaram, incluindo criação/transferência atômicas, convites, papéis, frequência persistente, remoção/reentrada, mídia real cifrada, autorização, cota cheia/rollback, checks e consentimento de leitura, seleção congelada, expiração sem ACK falso e limpeza exclusiva do dono. O ACK repetido não gera outro evento e o aviso se limita ao remetente.
- Integração de status passou com audiência congelada, exclusão/bloqueio, acesso indevido, foto cifrada, expiração/coleta e ausência nos backups. Os 27 testes de regressão das conversas individuais e 76 testes do executor de deploy também passaram.
- Duas contas sintéticas no navegador: criação/convite/entrada, texto de ida e volta por SSE, reabertura da sessão persistente do SDK, envio/abertura de arquivo cifrado, status de texto/foto, alterações de audiência somente nas próximas publicações, backup completo gerado sem omissões e transferência aceita com o antigo dono como membro comum. Nenhuma mensagem de usuário real foi utilizada.

A simulação de limpeza usa linhas sintéticas para não ocupar 675 MB em disco; o upload real confere o I/O separadamente. Os testes de interface usam duas origens de loopback no mesmo processo de teste, com cookies separados e o mesmo emissor SSE. Isso não comprova operação com múltiplas instâncias do servidor nem capacidade para 200 aparelhos simultâneos.

## Aceite físico e publicação

A automação do navegador abriu/descriptografou o anexo e preparou o backup, mas não confirmou no disco o salvamento dos links `blob:`. Conferir manualmente salvar/reabrir o backup com histórico e mídia do grupo, sem status, e o download do anexo. Gravação/reprodução de voz, suspensão e troca de rede continuam exigindo ensaio em aparelhos físicos; não declarar esses cenários aprovados apenas por testes sintéticos.

Antes da ativação na VPS, revisar explicitamente as migrações 020–024, preservação de dados, retorno e recursos no executor já existente, com CI do commit exato aprovada. A autorização de atualização rotineira de código não autoriza esta nova transição de banco. O token ainda não existe: criação e aceite de propriedade públicos permanecem indisponíveis; testes locais usam somente a elegibilidade sintética aprovada.

**Ponto importante:** o Bloco 11 está implementado localmente; isso não estabelece prontidão para dados reais nem aprovação dos ensaios físicos/publicação. Nenhuma regra material nova foi escolhida arbitrariamente. Cache, paginação, orçamento de I/O, retomadas e apresentação seguem os contratos já aprovados.
