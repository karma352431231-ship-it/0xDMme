# Testes manuais prioritários — blocos 05 a 10

Executar depois de disponibilizar esta revisão, com duas contas sintéticas A/B, uma conversa aprovada e dois aparelhos. Estes cenários cobrem integração com câmera, wallet, armazenamento e ciclo de vida mobile; não repetem a matriz automatizada de autorização, hashes, quotas e consentimento.

## 1. QR/código no celular e uma confirmação por sessão

Na origem A já conectada, abra Configurações e gere uma vinculação. Mantenha a página aberta/visível. Em outro navegador/aparelho sem wallet conectada, entre pelo QR; repita por código em outra sessão de teste. Ambos devem abrir a mesma conta e histórico sem aprovação técnica adicional. No QR, confira câmera traseira/foco e que ela para depois da leitura e ao sair da tela.

No aparelho vinculado, tente uma tarefa sensível, como gerar vínculo para outro aparelho. Confirme a wallet da mesma conta e complete o retorno ao navegador original. Depois execute outra tarefa sensível na mesma sessão: não deve pedir novo login/assinatura pública de confirmação. Ao sair da sessão, a confirmação anterior não deve valer. A configuração/recuperação inicial das chaves privadas pode exigir sua prova própria; ela não é a assinatura pública de login.

**Observar:** retorno Safari/Chrome/wallet, conta correta após voltar e ausência de ciclo “confirmar → voltar → confirmar” nas demais tarefas sensíveis.

## 2. Backup grande salvo pelo sistema e reaberto

Prepare texto editado, reação, imagem com miniatura, arquivo original e voz, além de histórico importado anterior. Para conferir o caminho de arquivo grande, use mídia sintética suficiente para que o backup passe de 64 MiB. Toque em Salvar arquivo de backup; salve pelo Safari/Chrome em Arquivos/Downloads. Valide **a cópia efetivamente salva**, escolhendo-a pelo seletor do sistema.

Feche e reabra a página e consulte mensagens antigas, edição/reação e imagem/arquivo/voz. Abra a cópia do arquivo em outro aparelho da mesma conta com as chaves recuperadas. Não deve existir escolha de itens/mídias nem upload do arquivo inteiro. Nenhum erro de download, espaço ou importação pode aparecer como backup completo validado.

**Observar:** travamento/fechamento do navegador, uso de memória, seletor de arquivo grande, nome/extensão e reprodução/download da mídia. Anote modelo, navegador e tamanho sem conteúdo privado.

## 3. Reset seguido de história antiga + mensagens novas

Salve e valide um backup completo. Envie uma mensagem **depois** desse backup, antes do reset. Confirme o reset no Cofre e observe a quota: ela pode conservar perfil/metadados e não precisa zerar.

Em Conversas, o histórico do arquivo e a mensagem posterior ao backup devem continuar disponíveis. Troque mensagens novas com B. Recarregue, desligue a rede e abra a história antiga e as mídias locais. Reconecte: história antiga e novas mensagens continuam juntas, sem duplicar. Em outro navegador limpo da mesma conta, a história apagada deve depender da importação do arquivo, enquanto as mensagens posteriores continuam remotas.

**Observar:** preservação da mensagem criada após o corte, persistência da importação ao fechar/reabrir, continuidade offline e mídias após reset. Importar não deve reaprovar contato nem reativar aparelho revogado.

## 4. Suspensão/cancelamento e controles da interface mobile

Durante exportação/importação grande, bloqueie a tela ou alterne para a wallet e volte. Se a plataforma interromper, o app deve informar falha/interrupção e não habilitar reset com arquivo incompleto. Cancele uma importação em andamento: o histórico previamente concluído deve continuar acessível; registros parciais não aparecem como importação concluída. Repita selecionando o arquivo salvo.

Confira em largura real do celular: Cofre com quota e três ações; preferências, lembrete, silêncio e QR em Configurações; avatar na navegação com troca de foto; wallet abreviada e cópia do endereço inteiro para um campo de texto local. Teclado/seletor não devem esconder confirmação/cancelamento. Entre pela URL padrão, feche e reabra: a versão nova deve continuar aparecendo sem parâmetro especial.

**Ponto importante:** não limpar os dados do site durante estes testes; eles contêm as chaves e o histórico cifrado do aparelho. Use arquivos e contas fictícios. Os aceites físicos de Safari/Chrome/PWA ainda são distintos dos testes de navegador no Mac.
