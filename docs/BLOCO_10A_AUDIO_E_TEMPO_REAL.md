# Bloco 10A — Voz gravada e recebimento por evento

Implementação local do 0xDMme, com envio HTTPS e recepção de avisos SSE na própria origem. Esta etapa não altera a VPS, dependências, migrações, limites do cofre ou identidade criptográfica. Aceite físico em desktop, Android e iOS permanece necessário.

## Decisões do proprietário

- WAV mono PCM16 a 16 kHz, até 90 segundos e 2.880.044 bytes, dentro do teto de 3 MB. Sem compressão com perdas nesta etapa.
- Corrigir recebimento em tempo real antes de concluir áudio; envio HTTPS existente e avisos por evento via SSE foram aprovados em 04/10/2026.
- Proposta de oito canais globais/dois por aparelho rejeitada. O módulo SSE não impõe essa divisão. Limites existentes do host continuam independentes; não houve revisão/alteração da VPS nem comprovação de capacidade para mil usuários.
- Mensagem nova, edição, exclusão e sincronização não cortam voz já iniciada. Bloqueio ou revogação verificados encerram a reprodução. Fim/troca de sessão e fechamento da página encerram seus recursos.
- Continuidade após compactação autorizada especificamente até concluir o 10A. Novas decisões materiais continuam sendo apresentadas ao proprietário.

## Voz no cliente

O botão Gravar voz solicita microfone somente na origem própria e por ação do usuário. AudioWorklet coleta amostras mono, converte para PCM16/16 kHz e encerra ao atingir 90 segundos. Há prévia, parada e cancelamento; enviar continua sendo uma ação explícita. Interrupção do microfone, suspensão ou navegação preserva o trecho capturado como prévia em RAM enquanto a página permanecer viva. Trocar de destinatário exige enviar/remover essa prévia; troca de sessão a apaga. Recarregar/fechar ou descarte do processo pelo sistema podem perder uma gravação não enviada; a interface informa isso e bloqueia atualização da PWA com voz pendente.

A seleção preparada segue o upload de anexos do SDK Matrix, cifrada antes de persistir/transmitir. O descritor privado v2 inclui amostras/taxa e cabeçalho canônico; formato, tamanho e duração são conferidos antes da reprodução. Arquivos v1 continuam compatíveis. Nomes, duração e segredo de mídia permanecem dentro do conteúdo Megolm; o backend recebe somente pacote/ref/partes cifradas. Voz aceita ocupa o cofre automaticamente, respeitando seus 300 MB e admissão global por bytes reais; não duplica cobrança lógica ao sincronizar outro aparelho.

Áudio completo é baixado somente por ação do usuário. Depois de carregado, o controle nativo oferece Play, pausa e posição, sem autoplay remoto. Um player compartilhado entre chat e backup vive fora da lista de mensagens e pode continuar enquanto o chat fica oculto ou outra página do app abre. Iniciar outro áudio ou fechar o player são ações explícitas do usuário. Som de notificação e reprodução deliberada têm controles distintos.

**Ponto importante:** a regra de continuidade foi aprovada como exceção para voz já aberta. Excluir remove a mensagem e impede abrir/baixar novamente, mas bytes que já estão no player continuam até o fim ou uma ação explícita. Não baixar nem reiniciar a mensagem excluída como fallback. Uma consulta assinada de autorização da reprodução existente verifica bloqueio, sem exigir que a mensagem ainda exista; novos downloads preservam todas as conferências de consentimento, exclusão e snapshot anteriores.

Backup independente inclui descritor/partes selecionados no formato existente e oferece reprodução local após validar/decriptar a mídia. Não muda histórico, autorização ou bloqueios atuais. A cópia salva mantém a independência já aprovada para backups; encerramento da sessão/revogação conhecida encerra players abertos no app.

## Recebimento por evento

`POST /api/account/messages/live` exige origem, sessão, CSRF, assinatura do aparelho e diretório atual antes de abrir SSE. Envio/publicação/ACK continuam nas operações HTTPS assinadas. Aviso não confirma recebimento, não confirma leitura e não entrega chaves ou conteúdo legível.

A operação de persistência registra contas afetadas e só publica após COMMIT. Rollback não gera aviso. Publicação, exclusão, consentimento, limpeza pessoal e confirmações relevantes acordam os clientes correspondentes, incluindo outras abas do próprio aparelho. Leitura privada não avisa o remetente. Bloqueio gera somente sinal genérico para conferir autorização; revogação e fim de sessão encerram os streams correspondentes. Identificadores privados usados para encaminhar/encerrar ficam na memória do servidor; frames não carregam wallet, conta, aparelho, mensagem ou texto.

Uma tabela em memória indexa conexões por conta; envio visita somente os destinatários. Cada conexão guarda um marcador de atualização, consolidado por 100 ms, sem fila de mensagens crescente. Comentários de manutenção a cada cinco segundos não consultam PostgreSQL nem seguram conexão do pool. Autorização é conferida na abertura e antes de aviso de conteúdo; eventos de dispositivos/sessão e expiração encerram acesso. Buffers de saída limitados/cliente lento causam desconexão e nova conferência do estado durável.

O cliente assina o pedido dentro da trava do cofre e libera a trava antes de manter o stream. Ready/reconexão acionam sincronização completa e verificada; não há replay de aviso nem presunção de estado atual a partir de um canal antigo. Três falhas consecutivas limitam reconexão automática; retorno online, retorno à página ou Sincronizar permitem nova tentativa. Falha transitória usa a sondagem existente a cada 30 segundos com indicação na interface. Enquanto SSE está saudável, a sondagem periódica de mensagens é dispensada; atividade/presença continuam com seu ciclo separado.

## Primeira otimização do cliente — 08/10/2026

Presença e recibos de leitura atualizam seus indicadores sem reconstruir as bolhas, ações, mídias ou posição de leitura. Avisos próximos são agrupados numa janela fixa de 150 ms, com um único pedido pendente; uma conferência completa tem precedência sobre uma sondagem. Avisos recebidos durante uma operação aguardam seu término, e trocar de sessão ou fechar a página cancela o pedido antigo. Invalidações continuam ocultando o histórico imediatamente; a janela agrupa somente o trabalho posterior na rede.

Um `changed` não autoriza reabrir conteúdo: primeiro consulta o snapshot autenticado. Se for idêntico ao último snapshot completo, confere os estados de entrega no servidor e atualiza somente os metadados das mesmas mensagens. Os nós existentes permanecem ocultos durante essa conferência. Snapshot alterado, erro, troca de conta, revogação ou saída da conversa descartam a visão retida; o caminho completo continua aplicando exclusões e confirmando o estado antes de publicar. Reconexão/`ready` conservam esse caminho completo.

O histórico individual e o do grupo selecionado deixam de ser carregados fora de exibição, inclusive na lista de conversas mobile. A lista lateral continua recebendo atualização de contatos e contadores; presença continua respeitando as preferências. Retornar à conversa exige nova conferência completa. Um envio já persistido conserva seu rascunho e ID; sair da tela não apaga a pendência nem muda a responsabilidade de entrega. O player separado mantém a exceção de continuidade de voz aprovada.

Validação local: verificação integral com 378 testes da aplicação, 111 do executor e 16 de avaliação. As 22 regressões direcionadas incluem agrupamento/prioridade dos avisos, retomada após trabalho ou suspensão, cancelamento por sessão, preservação de bolhas/mídia/rolagem nos recibos e visão fechada diante de falha ou resposta antiga. Após refinar as guardas de navegação e evitar uma carga duplicada ao abrir um contato, lint, tipos e build foram repetidos nos arquivos afetados. O build conserva 38 assets; não há nova dependência ou arquivo de migração.

**Ponto importante:** esta etapa reduz recargas e redesenhos desnecessários. A sincronização de conteúdo novo ainda usa o índice, as verificações criptográficas e a sequência de requisições existentes; não estabelece latência final nem encerra a investigação dos demais gargalos. Não altera download/banda, dependências, banco ou infraestrutura. Aceite físico Android/iOS e ativação desta revisão permanecem separados da validação local.

Uma recusa HTTP 403 na abertura pode indicar que o diretório mudou depois da assinatura. O cliente reconfere a autorização sem anunciar revogação nem cortar voz já aberta. Fim de sessão 401, evento explícito de revogação e bloqueio confirmado mantêm seus encerramentos. Uma falha de rede não é tratada como prova de bloqueio.

Este encaminhamento após commit pertence ao processo único do serviço web atual. Vários processos, escritores externos ou outra topologia exigem distribuir esses avisos de forma coordenada, com revisão e testes próprios. Reconexão recupera eventos perdidos pelo estado persistido; mensagens aceitas preservam fila e retenção anteriores. Cadastro/conexão não significa capacidade física ilimitada.

## Validação e limites

Cobertura automatizada: PCM em 8/16/44,1/48/96 kHz, WAV máximo e adulteração, permissão/cancelamento/interrupção, compatibilidade v1/v2, cifra real de anexos, backup independente, encaminhamento SSE para mil clientes simulados sem teto de 8/2, ausência de consultas no heartbeat, isolamento, cliente lento, reconexão/cancelamento e encerramento de sessão. A simulação do módulo não é benchmark de VPS.

Integração usa HTTP e PostgreSQL locais exclusivos, SDK Olm/Megolm real, recuperação em outro aparelho, upload cifrado, rollback, assinaturas recusadas, avisos após persistência e conferência de bloqueio. Smoke de navegador usa somente tom sintético, sem solicitar microfone real: gravação pelo AudioWorklet, decodificação WAV, permissão negada e continuidade do player durante conferência/retirada da mensagem.

Verificação final em 04/10/2026: `npm run check` passou com lint, tipos, fronteiras, licenças, formatação, build de 38 assets públicos, 211 testes da aplicação e 71 testes do executor de deploy. Integrações locais passaram com 26 testes de mensagens e 32 testes de autenticação/aparelhos/contatos, incluindo rollback, sessão encerrada, revogação e bloqueio. Revisão de responsabilidade/complexidade manteve os limites existentes; novas responsabilidades de captura, PCM, reprodução e transporte têm módulos próprios, sem novas dependências, migrações ou exceções de lint.

Smoke do navegador produziu WAV mono canônico de 38,8 segundos pelo AudioWorklet e confirmou permissão negada, continuidade durante conferência/exclusão/diretório desatualizado e encerramento por bloqueio. Fixtures, logs e captura da tela permanecem privados em `.local/`, fora do Git. Isso valida os módulos com mídia sintética; ainda verificar o fluxo montado com microfone real, interrupções do SO e reprodução entre desktop/Android/iOS. Navegador/OS podem suspender execução ou áudio; offline/suspensão impedem garantir identificação instantânea de bloqueio/revogação. Não tratar esta implementação como aceite de segurança ou prontidão para conversas reais. Código desta etapa ainda não ativado na VPS.

Decisões de produto seguiram as aprovações acima. Escolhas rotineiras de implementação: um player de voz compartilhado, prévia temporária em RAM antes do envio, descritor privado v2 compatível com v1 e avisos consolidados sem conteúdo. Os limites internos de buffers, esperas e retentativas protegem recursos e não criam novas cotas de usuários, mensagens ou aparelhos.
