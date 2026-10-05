# Bloco 07 — Mensagens individuais e fila sem expiração

Iniciado em 03/10/2026 por solicitação do proprietário, que pediu pausa quando houver decisão pendente. Concluído localmente em 03/10/2026, com validação automatizada e ensaios no navegador. O proprietário autorizou o commit e o envio de fontes ao GitHub/VPS; esta etapa não autoriza ativação ou migrações na VPS. A prova criptográfica do bloco 01 permanece um laboratório separado; o cliente de produto agora integra o motor selecionado, sem substituir suas primitivas.

## Confirmação e preservação — decisão aprovada

O proprietário escolheu a opção 1: a pendência de cada aparelho autorizado continua até sua própria confirmação autenticada de recebimento verificado e gravado. Uma confirmação do celular não resolve a referência do computador offline. Preservação recuperável no cofre não substitui a entrega a esse aparelho.

Na entrega normal, o pacote só pode ser removido após a preservação recuperável no cofre e a resolução de todas as referências necessárias. A exclusão explícita aprovada abaixo é uma transição diferente da conclusão de entrega. Mensagens aceitas não têm TTL; inatividade não equivale a revogação. Entrega e leitura são estados diferentes. Idempotência e confirmações vinculadas à mensagem, conta e aparelho devem impedir duplicação e confirmação de pendências alheias.

Exceção aprovada em 03/10/2026 no [bloco 09](BLOCO_09_BACKUP_E_RECUPERACAO.md): após salvar e validar um backup independente, uma confirmação separada pode remover pessoalmente os itens preservados e encerrar as referências da própria conta, inclusive de aparelhos offline. Não é ACK, leitura ou revogação e não encerra as pendências nem remove a cópia do outro participante. A exportação isolada não apaga nada. Os aparelhos afetados dependerão do arquivo independente para consultar o conteúdo removido.

Preservar as cotas já aprovadas: 1.000.000.000 bytes pessoais, recebidos incluídos, sem reservar antecipadamente a cota inteira. Cópias de sincronização em outro aparelho não duplicam a cobrança lógica do histórico. Pacotes, referências e operações concretas em andamento ocupam espaço real e precisam de contabilização antes da aceitação. Não reintroduzir os tetos de contatos removidos no bloco 06.

## Exclusão, bloqueio e revogação — decisões aprovadas

- Exclusão pelo remetente: pode apagar suas mensagens antes ou depois do recebimento. A mensagem sai do chat dos dois participantes e deixa de ser entregue aos aparelhos pendentes. O conteúdo apagado não deve continuar acessível pelo histórico normal; uma cópia em backup feito antes da exclusão permanece. Se nenhum participante tiver esse backup, a mensagem se perde para ambos. Esta ação explícita substitui a proposta de permitir cancelamento somente antes da aceitação; não é TTL nem exclusão silenciosa. Não prometer apagar capturas ou cópias externas.
- Bloqueio: impedir novos envios e suspender entregas já aceitas que ainda estejam pendentes, sem apagar seu conteúdo. Desbloquear sozinho não retoma essas entregas nem restaura aprovação; retomada exige novo consentimento. Ações de exclusão precisam continuar possíveis sem reabrir entrega de conteúdo bloqueado.
- Revogação: retirar imediatamente o acesso do aparelho revogado. Resolver somente sua referência pendente quando a recuperação pelo cofre estiver comprovada; conservar as referências dos aparelhos mantidos. Não tratar falta de confirmação ou inatividade como revogação.

## Exibição após reconexão — decisão aprovada

O proprietário aceitou ocultar o chat durante toda a sincronização, aplicar exclusões antes de carregar/renderizar mensagens e manter o histórico fechado se houver erro ou sincronização incompleta. Sem fallback visual para cache antigo. Uma exclusão confirmada antes do estado sincronizado não deve aparecer nem em uma exibição intermediária; exclusões concorrentes são aplicadas quando chegam pela rede. Não prometer impedir o que já foi visto offline, apagar backups anteriores ou oferecer uma garantia absoluta em qualquer cenário.

Exceção de voz aprovada no bloco 10A em 04/10/2026: áudio já iniciado continua durante sincronização, mensagem nova, edição e exclusão. O player fica separado do histórico; bloqueio/revogação verificados encerram a reprodução, assim como o fim/troca de sessão ou fechamento da página. Isso não permite iniciar novamente nem baixar conteúdo excluído ou sem autorização.

Respostas antigas, mudanças de conta/aparelho e interrupções não podem reabrir o histórico. A visibilidade depende de uma sincronização completa das mensagens e exclusões, não de uma resposta parcial de paginação.

## Backup independente — decisão aprovada

Em 03/10/2026, o proprietário confirmou que “backup” significa uma cópia independente salva/exportada antes da exclusão. A exclusão remove a mensagem dos chats e do cofre automático dos dois participantes, inclusive cópias automáticas históricas do conteúdo. Somente o backup independente anterior conserva sua cópia. Esta decisão modifica a conservação automática para mensagens explicitamente apagadas; não autoriza apagar versões de contatos, configurações ou outros dados do bloco 05. A exportação de backup de produto permanece no bloco 09; a prova do bloco 01 não constitui esse recurso.

## Recuperação de mensagem ainda não recebida — decisão aprovada

A recuperação do bloco 04 devolve as chaves históricas do cofre e autoriza um novo aparelho, sem restaurar sessões Olm dos aparelhos anteriores. Conservar somente o pacote da fila não permitiria abri-lo nesse aparelho. A opção 1 aprovada abaixo integra a exportação de chaves de leitura oferecida pelo SDK selecionado; as sessões de envio não são copiadas.

O proprietário escolheu a opção 1 em 03/10/2026: preparar uma representação recuperável cifrada para o destinatário já na aceitação, sem depender de outro aparelho depois. A aceitação exige persistência dessa representação e controle de cotas. A integração precisa validar confiança nas chaves, exclusão bilateral, revogação e recuperação sem aparelhos antigos. A alternativa de esperar outro aparelho retornar não foi adotada. Essa preservação automática pertence ao cofre e deve ser removida na exclusão; não é o backup independente preservado pelo usuário.

**Ponto importante:** manter uma pendência significa conservar responsabilidade de entrega e armazenamento; não significa prometer leitura, disponibilidade infinita de disco ou apagar cópias já recebidas.

## Implementação local

- Texto e cartões de perfil/foto passam por Olm/Megolm no SDK Matrix 18.9.0. PNG, JPEG e WebP de até 3.000.000 bytes usam o mesmo canal autenticado; nome/foto não compartilham preferências, segredo do perfil ou URL pública. Anexos de conversa permanecem no bloco 08.
- Cada aparelho possui identidade Matrix própria, vinculada por assinatura à cadeia de dispositivos da conta. O cliente verifica a cadeia e fixa a identidade do contato no cofre antes do primeiro envio. Mudança de participantes/aparelhos invalida a sessão de envio; a abertura do motor também renova a sessão de envio conservadoramente. Chaves de leitura antigas permanecem recuperáveis, sem restaurar sessões de aparelhos revogados.
- A conta prepara uma chave pública de recuperação quando um aparelho autorizado abre o app online. A chave privada aleatória é cifrada sob a época do cofre. Aceitação exige arquivos de leitura cifrados para remetente e destinatário usando o formato de backup do SDK. Um contato ainda sem essa preparação deve abrir o app uma vez; não se aceita mensagem irrecuperável. O servidor não recebe texto, foto legível, segredo do cofre ou chave privada de recuperação.
- O cliente grava rascunho cifrado antes de transmitir e conserva o mesmo ID em reenvios. Falta de resposta não implica rejeição: consulta idempotente resolve aceitação já persistida. Cancelar um rascunho que nunca foi transmitido funciona offline; um pacote que pode ter sido aceito requer conexão para confirmar a exclusão bilateral.
- Mensagem, arquivos recuperáveis e referências dos aparelhos são persistidos atomicamente com cotas. Metadados de autorização, referências e transporte também ocupam espaço contabilizado. Novo aparelho não duplica a cobrança lógica do conteúdo; sua referência física entra na capacidade global. Exclusão remove o único conteúdo automático compartilhado e as referências numa transação, conservando somente a prova autenticada da exclusão.
- Confirmação técnica só ocorre após assinatura, integridade, descriptografia e gravação local durável. Referências de aparelhos offline permanecem separadas. Referências revogadas podem ser aposentadas na confirmação de uma mensagem já preservada; acesso do revogado é barrado imediatamente, sem esperar essa limpeza. Transporte Olm só é confirmado quando o SDK verifica e grava o evento; replay ou falha não simulam recebimento. Um registro local durável permite repetir a confirmação de um evento já verificado e gravado quando a resposta HTTP se perde, sem confirmar um replay não verificado. Eventos não confirmados permanecem contabilizados, enquanto o conteúdo pode ser validado através do arquivo recuperável aprovado.
- IndexedDB conserva somente cifras e metadados públicos; o armazenamento do SDK usa chave aleatória cifrada pelo cofre. Falha de gravação impede confirmar recebimento. Há orçamento local de 1 GB para registros de mensagens, além do espaço próprio do SDK e demais caches do navegador; falta de espaço é reportada, sem apagar pendências remotas aceitas.
- A interface oculta o chat antes de consultar a rede, processa todas as exclusões do snapshot e verifica o estado novamente antes de publicar uma única visão. Rodadas de até oito páginas retêm somente a janela selecionada e podem continuar; erros/limites ou estado alterado não mostram conteúdo intermediário. Cada página tem 16 itens; mensagens anteriores são abertas em janelas. Sondagem de metadados a cada 15 segundos não divulga leitura. O controle de requisições já existente pode interromper uma rodada; a continuação mantém o chat fechado até concluir a conferência, sem expirar pendências aceitas. Eventos locais/entre abas de exclusão, consentimento e dispositivos fecham a visão; reconexão e retorno de página restaurada exigem sincronização.
- Cópia local offline é uma abertura deliberada e indica que o estado remoto ainda não foi conferido. Reconexão fecha essa cópia antes de buscar/aplicar alterações. Fotos são novamente validadas e exibidas por Blob local, com URLs revogadas ao fechar a visão; não há execução de HTML/SVG recebido.

## Limites de aceite e publicação

Validação automatizada usa contas fictícias e PostgreSQL exclusivo. Testes físicos mobile, auditoria externa e aceite final de segurança continuam pendentes. A implementação inicial foi validada localmente, sem ativação na VPS. Em 03/10/2026 o proprietário pediu a publicação e aprovou a transição descrita abaixo, incluindo as migrações 010–015 com backup e preservação.

As [fontes correspondentes](FONTES_FRONTEND.md) incluem o motor compilado e fontes preferenciais da versão selecionada. O artefato completo supera o teto do comando comum de deploy. A transição específica aprovada conserva esse teto: transfere o build abaixo de 16 MiB e reconstrói as partes de fontes a partir do blob já recebido no Git dedicado, conferindo todos os hashes. Não há compilação na VPS ou omissão de fontes públicas.

Em 03/10/2026, o proprietário autorizou receber essas fontes com exceção de 64 MiB somente no processo Git deste envio. A configuração persistente mantém 16 MiB e todos os demais limites continuam aplicados; encerramento do processo encerra a exceção. Conferir preservação e hash recebido, conforme o [fluxo aprovado](GIT_E_DEPLOY.md). Essa aprovação inicial de transferência não liberou deploy/migrações; a autorização posterior de publicação é separada e explícita.

## Verificação e revisão final

- Lint com tipos e complexidade, TypeScript estrito, fronteiras, licenças, formatação e build passaram. O build contém 35 assets, incluindo WASM e as 18 partes das fontes preferenciais do motor. Nenhuma dependência ou alteração de lockfile/Node foi introduzida.
- Aplicação: 172 testes contemplados. A execução integral teve uma falha na política de câmera ao habilitar o WASM; após corrigir a ordem dos headers, os nove testes dos contratos afetados passaram. Os demais resultados válidos foram preservados.
- PostgreSQL/HTTP: 63 testes contemplados. O teste de capacidade global precisava incluir as novas tabelas de mensagens/transporte; a correção foi validada pelos nove testes do cofre. Os outros contratos da execução integral passaram. Os 14 testes específicos de mensagens cobrem consentimento/autorização, confirmação falsa, concorrência/idempotência, cotas e rollback, telefone/computador, recuperação sem aparelhos antigos, transporte real do SDK, bloqueio/novo consentimento, exclusão bilateral e foto cifrada.
- Deploy: 30 testes contemplados. O teste do build real foi ajustado para exigir a recusa do novo artefato acima do teto aprovado de 16 MiB, mantendo todas as fontes. Os 21 testes desse módulo passaram após a correção; os outros nove já haviam passado. Não se alterou o limite do executor nem se gerou aprovação de publicação.
- Navegador no Mac, com contas fictícias: conversa bidirecional com o SDK real, gravação em IndexedDB, recarga e novo envio, recebimento preservado, cancelamento de rascunho offline, exclusão recebida durante reconexão com o chat fechado, foto cifrada exibida por Blob e layout sem transbordamento em 320/390 px. Esses ensaios não substituem wallet, armazenamento e ciclo de vida físicos mobile.
- Revisão por responsabilidade: contratos compartilhados; motor e recuperação separados; armazenamento, controle de visibilidade e índices paginados independentes; cliente orquestra o fluxo e handlers adaptam transporte para operações autorizadas. Complexidade 10, profundidade 3 e quatro parâmetros continuam nos checks, sem novas supressões, dependências cíclicas ou limite de linhas. Os índices retêm somente a janela selecionada e os envios têm rodadas limitadas.

As correções foram revalidadas nos contratos afetados; não se apresenta a primeira execução de `npm run check` como aprovada integralmente. CI do novo commit é conferida após o push. Evidências operacionais e contas sintéticas permanecem em `.local/`, fora do Git.

## Arquivos principais

- `src/shared/messages`: formatos, provas e vínculo das identidades Matrix.
- `src/client/message-crypto`, `message-recovery`, `message-storage`, `message-profile`, `message-controls`, `message-visibility` e `messages`: motor, recuperação, armazenamento cifrado, perfil, invalidação, visibilidade e chat.
- `src/server/messages` e `src/server/database/{messages,matrix,message-recovery}.ts`: autorização, persistência, fila por aparelho e transporte. Migrações `012`–`015` versionadas; contratos de contatos e cotas reutilizados.
- `src/tools/frontend-matrix-source.ts`, `vendor/matrix-crypto-18.9.0` e integração no build/host: motor selecionado e distribuição de suas fontes/licenças, com limites explícitos de assets.
- Testes de mensagens/recuperação/visibilidade/índice, integração de mensagens/cofre, host web e recusa de deploy; fixture exclusiva para ensaios no navegador.

## Publicação de teste autorizada em 03/10/2026

O proprietário pediu “publica e ativa” e confirmou aumento do limite HTTP do site próprio de 5 para 8 MiB. O [executor específico dos blocos 06–07](GIT_E_DEPLOY.md) mantém Node/dependências e recursos existentes, verifica CI do commit exato, preserva backup e dados anteriores, aplica 010–015 e confere todos os assets/fontes publicados. A foto continua limitada a 3.000.000 bytes no app. Evidências e recibo de ativação ficam privados, fora do Git. A mesma publicação web/PWA atende desktop e mobile; instalações abertas precisam concluir a atualização. Testes físicos e aceite final de segurança continuam pendentes.

Atualização de 05/10/2026: cota pessoal de 1 GB decimal e grupo de 2 GB, com valores compartilhados pela aplicação; sem alteração automática do orçamento global nem ativação na VPS.
