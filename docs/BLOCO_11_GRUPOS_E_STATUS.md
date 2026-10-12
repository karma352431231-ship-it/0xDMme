# Bloco 11 — Grupos e status

Implementação concluída e publicada na VPS de testes em 04/10/2026, com regras aprovadas e validação descritas abaixo. Ensaios físicos e aceite para dados reais continuam pendentes.

## Organização aprovada

O proprietário definiu que grupos e chats individuais compartilham a lista e a área da aba **Conversas**. **Status** terá item próprio na navegação **Seu espaço**. Preservar a simplificação dos fluxos aprovada em 04/10/2026; não introduzir painéis técnicos no uso normal.

## Contratos já aprovados

- E2EE com o SDK Matrix já adotado. Entrada, saída, remoção e mudanças de aparelhos exigem autorização verificável e chaves apropriadas aos períodos de participação. Novo membro não recebe histórico anterior automaticamente.
- Até 200 participantes. Dono nomeia administradores; dono/admins gerenciam convites e removem membros; somente o dono limpa o cofre ou exclui o grupo. Transferência explícita aprovada em 04/10/2026, substituindo o adiamento inicial: novo dono precisa ser membro e aceitar; token e vagas por tier foram removidos em 05/10/2026; somente então o antigo dono pode sair. Não transferir automaticamente nem escolher sucessor aleatório.
- Cofre de cada grupo: 2.000.000.000 bytes, com 1.500.000.000 de mídia e 500.000.000 de texto/controle. Não copiar automaticamente conteúdo compartilhado para a cota pessoal de 1 GB. Contar bytes persistidos e reservas concretas de upload; grupo vazio não reserva 2 GB.
- Margem operacional de 1.000.000 bytes aprovada em 04/10/2026: novos conteúdos e suas chaves cifradas não consomem o último 1 MB dos 500 MB de texto/controle. Convites e mudanças administrativas podem usar essa margem dentro do espaço efetivamente disponível; não pré-alocar disco nem prometer administração ilimitada.
- Anexos de até 3 MB, incluindo fotos e voz já suportadas; sem vídeo nesta etapa.
- Criação e transferência: gratuitas, sem token ou teto de quantidade por conta. Capacidade global e frequência continuam aplicáveis.
- Frequência de criação aprovada: até uma criação por minuto e dez por hora por conta, sem teto total de quantidade. Contar criações concluídas atomicamente, sem liberar frequência ao excluir ou arquivar um grupo.
- Bloqueio entre pessoas não oculta as mensagens delas no grupo compartilhado. Continua impedindo conversa direta, convites diretos e acesso a status entre as duas contas.
- Após transferência, o antigo dono fica como membro comum e pode sair; o novo dono poderá nomeá-lo admin depois. Quem sai ou é removido perde acesso ao cofre remoto; reentrada começa outro período, sem recuperar automaticamente o anterior. Cópias locais/arquivos já recebidos continuam sob controle de quem os conservou.
- Limpeza rotativa: aos 90% da cota de mídia, selecionar as mídias antigas a remover até 70%, avisar todos por 24 horas e congelar essa seleção. Pode remover mídia ainda pendente; não registrar como entregue. No teto, recusar novos anexos durante o aviso. Texto não terá expiração nem temporizador nesta etapa, dentro da reserva finita de texto/controle.
- Status de texto/foto, por padrão para todos os contatos aprovados, com exclusões opcionais por perfil e expiração em 24 horas. Status fica excluído dos backups. Conteúdo e mídia cifrados; expiração não promete eliminar cópias externas.
- Alterações dos contatos/exclusões valem somente para próximos status: cada publicação congela sua audiência aprovada. Preservar a regra de bloqueio já aprovada que impede acesso a status entre as duas contas; não conceder acesso novo a uma publicação antiga.
- Ensaios locais usam contas sintéticas e o mesmo fluxo gratuito da aplicação. Não há exceção de token nem consulta RPC para grupos.

## Atualização aprovada em 05/10/2026

O proprietário removeu a exigência de token e o teto de quantidade por conta para criar e assumir grupos. Não implementar wallet auxiliar de elegibilidade, saldo RPC ou tiers. Preservar aceite do novo dono, assinaturas e participação, frequência de uma criação por minuto/dez por hora, capacidade global e os demais controles existentes. Cota pessoal de 1 GB e grupo de 2 GB decimais; preservar 75% para mídia (1,5 GB), 25% para texto/controle (500 MB) e margem administrativa de 1 MB. Centralizar valores para futuras revisões. Esta atualização substitui a dependência anterior do token; os registros de publicação abaixo descrevem releases anteriores e não ativam esta atualização.

## Decisões pendentes

Capacidade operacional real e aceite físico continuam pendentes. Token, mint e RPC não são pré-requisitos. A divisão 75%/25%, margem de 1 MB e limpeza de 90% para 70% foram preservadas na atualização de 05/10/2026. Não há modo de saldo sintético; a operação autenticada group-mode informa configured (criação gratuita disponível), preservando o contrato de clientes instalados.

## Investigação técnica

O código atual tem transporte Matrix autorizado para conversas individuais. O SDK instalado oferece sessões Megolm de grupo, distribuição de chaves Olm e exportação/importação de sessões; isso não torna o armazenamento, governança e admissão existentes automaticamente adequados a grupos. Implementar contratos próprios e preservar as rotas individuais.

A orientação do [Matrix sobre E2EE](https://matrix.org/docs/matrix-concepts/end-to-end-encryption/) exige invalidar sessões de envio nas mudanças relevantes de participação. Conferir também recuperação em novo aparelho, reentrada e acesso histórico sem uma chave permanente global de grupo. Não publicar segredos/chaves ou plaintext no servidor.

## Entrega local em 04/10/2026

Grupos e conversas individuais compartilham a lista e a área de chat em **Conversas**. A interface permite criar, adicionar contatos diretamente, entrar por link, nomear administradores, remover membros, sair e oferecer/aceitar a propriedade. Autorização e governança são conferidas ao concluir a criação ou transferência; o antigo dono fica como membro comum. Nomes e mensagens dos grupos permanecem cifrados. A lista e o histórico têm paginação limitada, e o grupo selecionado é conferido diretamente quando está fora da primeira página.

Governança e períodos de participação são assinados; as mensagens usam Megolm do SDK Matrix já adotado, com distribuição Olm e recuperação por participante. Trocas de membros/aparelhos invalidam a sessão de envio apropriada. Convites legados vinculam a identidade do destinatário; novas inclusões diretas são assinadas pelo dono/admin e novas entradas por link pelo participante; bloqueios impedem convites diretos e status, preservando a conversa no grupo compartilhado. Quem sai ou é removido mantém somente as cópias locais/exportadas que já conservava, sem acesso ao cofre remoto.

O chat suporta texto, fotos, arquivos de até 3 MB, voz de até 90 segundos, painel de emojis e retomada limitada dos envios pendentes. Mantém os checks cinza/azul conforme recebimento e consentimento de leitura; silenciar por 24 horas, arquivar e fixar também alcançam grupos. Atualizações normais preservam a reprodução já aberta; bloqueio ou revogação são conferidos pelos mecanismos compartilhados de autorização.

O SSE existente avisa sobre mensagens, governança, status, leitura e limpeza. Conteúdo/assinaturas/ACK continuam na API autenticada. ACK de grupo desperta apenas os remetentes afetados, uma vez por mudança efetiva, evitando avisar todos os membros a cada confirmação. Conteúdo já autenticado é reutilizado do cache cifrado, com conferência de hash e participação atual; mensagens novas seguem a validação completa do SDK. A chave de recuperação é aberta no máximo uma vez por chave em cada página e liberada ao terminar, inclusive em falha. O painel de cofre só consulta detalhes quando aberto. Não foram ampliados os limites de pedidos nem criadas cotas arbitrárias de canais/aparelhos.

Mídias usam namespace separado e upload cifrado em partes, com reserva concreta na parcela de mídia compartilhada (1.500 MB desde 05/10/2026). A manutenção seleciona até 64 mensagens por lote, congela a seleção e inicia o aviso coletivo de 24 horas após concluí-la; remove mídias até 70%, preservando texto e sem inventar entrega. Durante o aviso, uploads que ultrapassem a cota são recusados. A interface mostra prazo, bytes e páginas de itens selecionados, com acesso à exportação. Arquivos continuam cobrados até a coleta durável; excluir o grupo mantém a contabilização dos bytes enquanto a coleta está pendente. Limpeza explícita inclui o conteúdo do cofre, com confirmação do dono.

**Status** tem item próprio em **Seu espaço**, publica texto/foto cifrados e congela a audiência de contatos aprovados a cada publicação. Exclusões por perfil afetam somente as próximas publicações; bloqueio continua imediato. Cada leitor recebe apenas sua própria cápsula, sem a lista de outros destinatários. A sessão SDK por status existe somente em memória, e a expiração de 24 horas retira conteúdo remoto/mídia através da manutenção limitada. Status não é um tipo permitido no backup, nem uma fonte de exportação.

O backup completo inclui metadados assinados, mensagens e mídias autorizadas dos grupos, além das cópias independentes conservadas no aparelho. A importação integra esse histórico à lista de Conversas sem conceder participação ou acesso remoto. Exportar não libera cota compartilhada. Resetar o cofre pessoal não apaga grupos nem status; itens indisponíveis deixam o backup incompleto e bloqueiam o reset. Os limites e formato cifrado do bloco 07 foram preservados.

Migrações **020–024** validadas no banco local de testes e mantidas imutáveis; posteriormente aplicadas na VPS na publicação específica revisada, conforme registro abaixo. Nenhuma dependência, licença, serviço pago ou relay externo foi acrescentado. O build remove somente espaços supérfluos do JavaScript, conserva avisos legais e fontes preferidas e permanece dentro dos mesmos limites por arquivo e de distribuição.

## Validação

- Lint com tipos, TypeScript estrito, fronteiras de módulos, licenças, formatação e build local. Build com 38 assets públicos, sem ampliar os tetos existentes. Complexidade limitada pelas regras existentes; divisões feitas por responsabilidades, sem limite artificial de linhas, suppressions ou `any`.
- Suíte geral de 243 cenários: 241 passaram na execução conjunta; dois checks de ferramentas excederam o timeout sob carga paralela e passaram na repetição isolada. A regressão adicional do cache usa mensagem cifrada real e verifica redução de consultas, adulteração e perda de participação.
- Quatro cenários de integração de grupos passaram, incluindo criação/transferência atômicas, convites, papéis, frequência persistente, remoção/reentrada, mídia real cifrada, autorização, cota cheia/rollback, checks e consentimento de leitura, seleção congelada, expiração sem ACK falso e limpeza exclusiva do dono. O ACK repetido não gera outro evento e o aviso se limita ao remetente.
- Integração de status passou com audiência congelada, exclusão/bloqueio, acesso indevido, foto cifrada, expiração/coleta e ausência nos backups. Os 27 testes de regressão das conversas individuais e 76 testes do executor de deploy também passaram.
- Duas contas sintéticas no navegador: criação/convite/entrada, texto de ida e volta por SSE, reabertura da sessão persistente do SDK, envio/abertura de arquivo cifrado, status de texto/foto, alterações de audiência somente nas próximas publicações, backup completo gerado sem omissões e transferência aceita com o antigo dono como membro comum. Nenhuma mensagem de usuário real foi utilizada.

A simulação de limpeza usa linhas sintéticas para não ocupar 675 MB em disco; o upload real confere o I/O separadamente. Os testes de interface usam duas origens de loopback no mesmo processo de teste, com cookies separados e o mesmo emissor SSE. Isso não comprova operação com múltiplas instâncias do servidor nem capacidade para 200 aparelhos simultâneos.

## Aceite físico e publicação

A automação do navegador abriu/descriptografou o anexo e preparou o backup, mas não confirmou no disco o salvamento dos links `blob:`. Conferir manualmente salvar/reabrir o backup com histórico e mídia do grupo, sem status, e o download do anexo. Gravação/reprodução de voz, suspensão e troca de rede continuam exigindo ensaio em aparelhos físicos; não declarar esses cenários aprovados apenas por testes sintéticos.

Antes da ativação na VPS, revisar explicitamente as migrações 020–024, preservação de dados, retorno e recursos no executor já existente, com CI do commit exato aprovada. A autorização de atualização rotineira de código não autoriza esta nova transição de banco. Na release de 04/10/2026, criação e aceite de propriedade públicos permaneciam indisponíveis pela ausência do token; essa dependência foi removida da implementação local em 05/10/2026.

Após a entrega local, o proprietário autorizou enviar e ativar o Bloco 11 em 04/10/2026. A revisão específica vincula a transição 019→024 ao predecessor `f7b48bb` e às fontes de aplicação de `aab78ef`, preservando as migrações anteriores, as 29 tabelas existentes, runtime e dependências. Usar o mesmo executor e exigir CI exata, backup/ensaio de restauração e conferências antes de abrir, conforme [registro do deploy](GIT_E_DEPLOY.md). A autorização não habilita token sintético público nem substitui o aceite físico.

**Publicação verificada:** release `2772aba` enviada e ativada pelo executor existente em 04/10/2026, com [CI integral aprovada](https://github.com/karma352431231-ship-it/0xDMme/actions/runs/37248117062). Backup/ensaio de restauração e preservação passaram; a conferência posterior confirmou 24 migrações, 45 tabelas, manifesto ativo, 38 assets públicos e saúde pronta. Configurações e serviços compartilhados permaneceram iguais; backup e release anterior ficaram retidos. Elegibilidade sintética continua desligada na VPS.

**Ponto importante:** o Bloco 11 está publicado no ambiente de testes; isso não estabelece prontidão para dados reais nem aprovação dos ensaios físicos. A release publicada em 04/10/2026 ainda bloqueia criação/transferência por token; a atualização local de 05/10 remove essa dependência e precisa de publicação própria. Nenhuma regra material nova foi escolhida arbitrariamente. Cache, paginação, orçamento de I/O, retomadas e apresentação seguem os contratos já aprovados.

## Atualização local de grupos e cotas em 05/10/2026

Verificador sintético, tipos de elegibilidade, tiers e bloqueio de criação/transferência por token removidos. O servidor mantém assinatura, consentimento e verificação atômica de frequência/capacidade; transferência mantém as regras de participação. Cotas compartilhadas em src/shared/vault e src/shared/group-quota são usadas pela admissão, UI, cache, backup, validações e limpeza. Não alterar checksums de migrações aplicadas; estes limites são impostos no código, sem nova migração nesta mudança.

**Ponto importante:** 1 GB pessoal e 2 GB por grupo são tetos lógicos, sem pré-alocação ou garantia de preenchimento simultâneo. O orçamento global e a infraestrutura continuam iguais. Esta atualização não foi ativada na VPS.

Validação da atualização: lint com tipos, TypeScript estrito, fronteiras/ciclos, formatação e build de 38 assets passaram. Os 29 testes unitários direcionados foram aprovados; o teste de retenção foi atualizado após a primeira execução para a nova parcela de mídia. Nas integrações, mensagens passou com 27 testes, e grupos/cofre passaram com 15 na repetição dirigida após corrigir expectativas do teste e incluir preferências de chamadas/push na soma de conferência do contador global. Não se apresenta a primeira execução conjunta como integralmente aprovada. Chrome com wallet sintética confirmou criação gratuita, parcelas de 500/1.500 MB no grupo, cota pessoal de 1 GB após recarga e largura de 320 px sem excesso horizontal. Nenhuma dependência ou migração nova nesta atualização; CI remota, publicação e ensaios físicos não foram executados. Evidências exclusivamente em `.local/`.

## Admissão e criação visíveis — 10/10/2026

O proprietário autorizou criação acessível em Contatos e no “+” da área privada, inclusão imediata de contatos por dono/admin e entrada por link. O aceite foi removido das novas inclusões diretas; permanece obrigatório para transferência de propriedade. Contatos disponíveis são os aprovados e não participantes; o servidor revalida contato, bloqueios, autoridade, capacidade e limite de 200 atomicamente. O membro pode sair; o dono transfere antes a propriedade.

Um link reutilizável fica ativo por grupo e pode ser trocado/revogado por dono/admin. Perder a autoridade administrativa do emissor invalida o link; mudança do diretório de aparelhos exige renovação. Qualquer conta autenticada com o link pode consultar metadados assinados de participação/aparelhos e confirmar a entrada, mas não acessar conteúdo ou chaves antes de participar. Não expor o segredo do link no histórico, logs, parâmetros de navegação HTTP ou metadados do servidor. Só o hash e a concessão assinada persistem no servidor; o emissor guarda o link no cache local cifrado. Gerar em outro aparelho pode substituir o link que ele não consegue recuperar.

Entradas diretas/por link avançam época e rotação Megolm; não concedem mensagens anteriores. Reentrada substitui o período antigo. Bloqueio impede inclusão direta, preservando a regra existente de convivência em grupos compartilhados. A migração 054 cria o registro limitado a um link por grupo e um trigger do contador global; seus bytes também entram na cota de controle do grupo. Não há dependência nova, ativação ou migração na VPS nesta entrega local.

Na validação da UI, o aviso SSE de participação podia invalidar a resposta da própria criação/entrada já aceita. `groups/authority.ts` separa a confirmação de mutações da geração da vista: avisos de participação ainda ocultam imediatamente leituras antigas; troca de sessão e revogação cancelam ambos. Cada operação HTTP continua conferindo assinatura, aparelho, participação e head no servidor. Os diálogos usam o bloqueio de operações da tela, evitando atualização concorrente durante uma inclusão.

Organização: as novas responsabilidades ficam em `groups/actions-ui.ts`, `groups/admission.ts`, `groups/authority.ts` e nos módulos próprios de admissão/persistência do servidor. `groups/index.ts` e `groups/controller.ts` continuam concentrando responsabilidades anteriores. Proposta para uma tarefa separada: extrair primeiro renderização do histórico/compositor e depois administração/cofre da UI; no controller, separar catálogo/sincronização da entrega. Rever interfaces e executar regressões de E2EE, retenção, SSE e retomada em cada etapa, sem alterar os formatos existentes.

**Ponto importante:** encaminhar o link permite a entrada de outra conta. Revogar/trocar impede usos futuros, mas não remove quem já entrou nem apaga cópias locais.
