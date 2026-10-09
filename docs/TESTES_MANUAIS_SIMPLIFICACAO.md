# Testes manuais prioritários — blocos 05 a 10, incluindo 10A

Atualizado em 04/10/2026 para a release publicada `f7b48bb`, com Cofre simplificado, histórico local, autorização automática, voz e recebimento por SSE. Este roteiro substitui os passos das interfaces anteriores. Decisões vigentes: [seção 5.6 do plano](../DECISOES_E_PLANO_DE_IMPLEMENTACAO.md#56-simplificação-aprovada-em-04102026).

Use duas contas fictícias A/B e um celular mais um computador. Dois aparelhos da mesma conta servem para recuperação; A/B servem para conversar. Execute primeiro no celular que você usa. Se houver outro sistema disponível, repita nele os caminhos de wallet, câmera, voz e salvamento de arquivos. Safari/Chrome e PWA instalada são contextos distintos; anote qual usou.

O foco é integração física, permissões, seletores do sistema, suspensão e retorno à página. A matriz de hashes, quotas, assinaturas, consentimento e idempotência já tem cobertura automatizada e não precisa ser refeita manualmente.

## 1. URL normal, retorno da wallet e interface mobile

1. Abra `https://0xdmme.app/`, sem `?atualizar=1`. Entre com a wallet de uma conta A já usada em outro aparelho e volte ao navegador que iniciou o login.
2. Abra Contatos e Cofre logo depois do retorno e recarregue uma vez. Confira se ficam utilizáveis sem precisar trocar a URL ou fazer login novamente.
3. Confira Cofre com quota e três ações principais; preferências, lembrete, QR e aparelhos em Configurações. Altere a foto pelo avatar da navegação e copie a wallet para um campo de texto local.
4. Abra teclado e seletor de arquivos; teste também o painel de emojis com o teclado aberto. Feche e reabra a página pela URL normal.

**Esperado:** a mesma conta abre, sem perfil/agenda vazios de uma conta duplicada; a interface atual persiste. Foto não estica, endereço copiado é completo e botões de confirmar/cancelar permanecem acessíveis. As assinaturas privadas de abertura/recuperação das chaves continuam distintas da confirmação pública de login; não contar esses passos como confirmações repetidas de tarefas sensíveis.

## 2. Vinculação real por QR/código e confirmação sensível

1. Em A já aberta, gere a vinculação em Configurações. Mantenha a origem aberta e visível. No destino sem wallet conectada, leia o QR pela câmera; confira que ela encerra após a leitura e ao fechar a captura.
2. Abra a mesma conta e uma conversa existente. Repita por código em outro contexto de teste, sem apagar o armazenamento do primeiro.
3. No aparelho vinculado, toque em Vincular outro aparelho: confirme a wallet da mesma conta e volte ao navegador original. Depois revogue um aparelho descartável de teste nessa mesma sessão.
4. No aparelho revogado, volte à página/reconecte e tente enviar uma mensagem. Faça logout de outra sessão vinculada e entre novamente por vínculo antes de tentar uma tarefa sensível.

**Esperado:** QR e código levam à mesma conta e permitem uso comum sem wallet no destino. Uma confirmação de wallet cobre as demais tarefas sensíveis da sessão; após logout, o novo vínculo exige confirmação própria para essas tarefas. Revogação barra novas operações remotas quando o estado atual é conferido. Ela não apaga arquivos externos ou conteúdo já recebido. Origem oculta/fechada e código vencido podem impedir a vinculação; não são autorização concluída.

## 3. Convite de contato pelo celular

1. Em Configurações de A, crie um convite de contato. Em B, leia seu QR pela câmera ou abra/cole o link recebido e solicite conversa.
2. Em A, abra Contatos e aceite. Abra a conversa em B após o aceite.
3. Com uma conta configurada para descoberta por wallet exata, faça também um pedido usando seu endereço em Contatos.

**Esperado:** abrir o convite no celular conserva a sessão correta e apresenta o destinatário certo. Validação ocorre automaticamente; não há comparação de fingerprints ou confirmação técnica manual. O convite de contato gera um pedido, sem entrar na conta de A ou autorizar o aparelho de B. Conversar depende do aceite. O pedido por wallet funciona conforme a visibilidade escolhida.

## 4. Recebimento em tempo real, suspensão e reconexão

1. Deixe A/B abertos e conectados, com a conversa aprovada. Envie mensagens nos dois sentidos e faça uma edição e uma reação, observando o recebimento em tempo real.
2. Bloqueie a tela do celular ou alterne de aplicativo; enquanto isso, envie algumas mensagens pelo computador. Volte à página.
3. Desligue a rede do celular, prepare/envie uma mensagem e reconecte. Observe o estado do envio e a retomada.
4. Com alertas permitidos, volume audível e uma interação normal no app, confira o som de mensagem. Desligue o som em Configurações e repita; silenciar a conversa também deve impedir seus alertas.

**Esperado:** com o canal conectado em primeiro plano, as mudanças chegam por evento, sem esperar a consulta periódica de 30 segundos. Ao retornar/reconectar, o app recupera o que perdeu sem duplicar mensagens nem mostrar entrega falsa durante a falta de rede. Uma conexão em contingência deve indicar sua indisponibilidade. Som depende das permissões/políticas do navegador e do sistema; registre qualquer bloqueio ou necessidade de novo gesto. Este cenário não testa push com o app fechado.

## 5. Voz com microfone real e interrupções

1. Grave uma voz curta, pare, ouça a prévia e envie para B. Em B, reproduza, pause e mova a posição. Grave outra e cancele; ela não deve ser enviada nem continuar usando o microfone.
2. Durante uma gravação, alterne de aplicativo ou bloqueie/desbloqueie a tela. Ao voltar, confira o trecho preservado e o aviso de interrupção. Faça uma gravação até o limite de 90 segundos uma vez.
3. Durante a reprodução, receba texto/edição/reação e navegue para outra aba do app. Exclua pelo remetente a voz já aberta no player do destinatário.
4. Em uma reprodução de teste separada, bloqueie o contato com ambos os apps visíveis e conectados. Depois restaure o consentimento de teste para continuar os próximos cenários.

**Esperado:** voz inteligível entre aparelhos, sem autoplay do áudio recebido ou envio antes de tocar em Enviar. Interrupção preserva a prévia se a página continuar viva; limite encerra a captura. Atualização da lista, navegação interna e exclusão da mensagem não cortam a voz já aberta; exclusão impede nova abertura. Bloqueio confirmado encerra o player. Cancelar/parar encerra a captura do microfone. Se o sistema descartar/recarregar a página, a prévia não enviada pode ser perdida; não se promete gravação/reprodução contínua em segundo plano.

## 6. Foto/arquivo pelo seletor do celular e upload interrompido

1. Selecione uma foto JPEG/PNG/WebP do celular como Foto otimizada. Confira a prévia, envie, abra a foto completa em B e observe orientação e proporção. Outros formatos de foto podem seguir como arquivo original, dentro do limite.
2. Envie um arquivo original fictício de até 3 MB. Salve-o pelo seletor/Downloads/Arquivos de B e abra a cópia salva.
3. Durante um upload, retire a rede ou suspenda o aplicativo e depois volte/reconecte. Aguarde a retomada; se houver falha explícita, use a tentativa contextual.

**Esperado:** seletor retorna ao chat certo, prévia não envia sozinha, foto não fica girada/esticada e arquivo salvo é utilizável. Envio iniciado retoma com autorização/conectividade válidas; não cria duas mensagens nem informa sucesso antes de terminar. App fechado pode pausar a transferência. Metadados/hash/limites exatos já têm testes automatizados; não é necessário inspecioná-los manualmente.

## 7. Backup completo, arquivo externo e interrupção

1. Na conta A, reúna texto editado, reação, foto, arquivo e voz dos testes anteriores. Use Salvar arquivo de backup no Cofre e salve o `.0xdm` em Arquivos/Downloads.
2. Use Validar arquivo e selecione **a cópia efetivamente salva**. Feche/reabra a página e confira história, edição/reação e mídias. Abra o mesmo arquivo em outro navegador/aparelho de A com as chaves já recuperadas.
3. Repita uma vez com backup acima de 64 MiB, usando mídias fictícias dentro dos limites individuais. Observe salvamento, seletor, importação e responsividade no celular.
4. Durante uma importação grande, cancele. Confira que a importação anteriormente concluída continua disponível. Repita selecionando o arquivo salvo. Durante exportação/importação, suspenda a página e volte; se o sistema interromper a operação, confira o aviso e a impossibilidade de reset com arquivo incompleto.

**Esperado:** backup inclui tudo automaticamente, sem escolher chats ou mídias. Arquivo salvo reabre e voz/foto/arquivo funcionam em outro aparelho da mesma conta. Histórico concluído permanece após fechar/reabrir; importação parcial não aparece como concluída. Erro de download/espaço/importação não vira backup completo validado. Suspendê-lo não garante interrupção: se conseguir concluir corretamente, sucesso é válido.

## 8. Reset: história antiga local e mensagens novas juntas

Execute somente na conta fictícia A e depois de salvar e validar um backup completo no teste 7.

1. Envie uma mensagem depois do backup, antes do reset. Faça as confirmações de Resetar cofre.
2. Abra a história antiga importada e a mensagem posterior ao backup. Troque mensagens novas com B. Confira também a conversa de B, cuja cópia não foi resetada.
3. Recarregue/feche e reabra. Desligue a rede e consulte a história importada e suas mídias; reconecte e confira as novas mensagens sem duplicação.
4. Em outro navegador/aparelho de A sem essa importação, confira as mensagens posteriores e use Validar arquivo para importar a história apagada. Gere um novo backup contendo a história importada e as mensagens novas e valide essa nova cópia.

**Esperado:** reset limpa somente o conteúdo pessoal preservado no corte validado. A mensagem criada depois do backup permanece; a cópia de B permanece. Antigas e novas convivem no chat, inclusive após reabrir e reexportar. Em outro contexto, conteúdo antigo removido do backend depende do arquivo. A quota diminui conforme os itens liberados, mas perfil/metadados podem impedir que zere. Importar não reautoriza aparelhos nem reaprova contatos antigos.

## Pendência: push com o app fechado

Não executar como teste de funcionalidade disponível na VPS atual. O envio externo ainda depende de VAPID e da revisão de rede registrada no [bloco 10](BLOCO_10_NOTIFICACOES_E_EXPERIENCIA.md#envio-push-pendente-e-conflito-de-rede). Publicar áudio/SSE não ativou push. Quando essa etapa for aprovada e ativada, haverá aceite próprio com app fechado, PWA instalada quando necessária, permissão do sistema, mute e logout/revogação.

## Como registrar uma falha

Anote número do teste, aparelho, navegador/PWA, sequência de ações, resultado e mensagem exibida. Para tempo real, diga se a página estava visível e se mostrava conexão ativa ou contingência. Para backup, anote tamanho do arquivo e etapa que falhou. Não envie arquivo de backup, chave, assinatura ou conteúdo privado como evidência.

**Ponto importante:** guardar e validar o arquivo externo precede o reset. Não limpar dados do site para simular outro aparelho: use outro contexto de teste, pois o armazenamento contém chaves e histórico cifrado. Esta revisão atualiza o roteiro; não afirma que os aceites físicos foram executados.
