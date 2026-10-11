# Perfil e configurações — revisão solicitada em 07/10/2026

O proprietário pediu enxugar a tela no browser e mobile e mover os links privados de convite para a nova aba Contatos. Perfil e Configurações continuam reunidos; a revisão organiza a apresentação sem alterar regras de conta, descoberta ou recuperação.

- Foto, nome, wallet e cópia permanecem no topo. Editar nome e preferências privadas usa uma seção compacta na mesma tela.
- As categorias Quem pode me encontrar, Perfil público, Notificações e chamadas, Aparelhos, Organizações e representantes e Aplicativo abrem sob demanda. Fechadas, usam duas colunas no desktop amplo e uma no mobile; abertas, ocupam a largura disponível. Uma categoria fica aberta por vez; fechar não remonta widgets nem descarta rascunhos.
- Botões ficam junto das opções e usam a mesma composição no desktop/mobile. Instruções longas ficam em ajuda recolhível; público do perfil, @ fixo, consentimento, dados recebidos pelo provedor de push e restrições da foto continuam explícitos nos controles relevantes.
- Cofre/backups e Status conservam acesso direto. Ações de wallet, entrada incompleta e feedback da conta continuam visíveis; nenhuma confirmação sensível é contornada pela UI.
- Criar/copiar/trocar/revogar o convite privado de contato e exibir seu QR ficam exclusivamente em Contatos → Meu convite. Abrir o painel não cria um link. Receber um convite continua em Adicionar contato → Por convite. Solicitação e aceite seguem separados.
- QR/código de vinculação pertence a Aparelhos. Recolher essa categoria encerra a câmera, preservando o pedido e as chaves; não cancela nem revoga um aparelho.

**Ponto importante:** não há mudança de dependência, criptografia, persistência, visibilidade padrão, consentimento, retenção ou infraestrutura. Texto resumido não transforma convite em aprovação nem foto privada em foto pública. Fontes enviadas não ativam a release na VPS.

Validação local: lint sem avisos, tipos estritos, limites de módulos, formatação e build de 38 assets passaram. Os testes relacionados de conta, navegação, contatos, perfil público, avisos e retorno da wallet passaram; as 30 regressões de sessão/retorno e categorias passaram depois de atualizar o mock de tela para registrar o atributo visual. A aparência conectada permanece desativada durante um pedido de retorno ainda não concluído.

Revisão no navegador com conta fictícia em 1280, 390 e 320 px: sem rolagem horizontal, campos de 16 px e botões mobile de pelo menos 44 px. Conferidos abertura por teclado, uma categoria aberta por vez, rascunho ao alternar e ao usar o alias `#configuracoes`, salvar nome/preferências/visibilidade e preferências de push, alternar sons e acesso às demais categorias. Meu convite abre sem criar um link; criação, cópia, troca, revogação, QR gerado e fechamento por Escape foram conferidos. A câmera é encerrada pelo contrato de fechamento de Aparelhos; captura e leitura reais continuam no aceite físico.

Aceite físico de teclado, câmera, QR, push e wallets permanece separado; evidências exclusivamente em `.local/`. Envio das fontes e resultado da CI são informados na entrega, sem implicar ativação da UI.

## Prévia pública na mesma seção — solicitada em 09/10/2026

A seção Perfil público mostra também como o perfil aparece para visitantes, sem exigir navegação pelo link “Ver perfil público”. A prévia reutiliza a leitura pública anônima e exibe apenas o @ e a foto já aprovada; a foto preparada restrita continua separada nos controles do proprietário. A página pública compartilhável e a solicitação de DM pelo @ permanecem disponíveis. Recarregar atualiza a prévia; sair ou trocar de conta cancela a leitura e libera suas imagens temporárias.

## Consentimento de mídia externa — 10/10/2026

Antes de criar o `@`, o aviso oferece permitir GIFs/players externos ou manter somente links, sem obrigar a permissão para criar o perfil. A escolha geral vale por conta em comunidades, DMs pelo `@`, conversas e grupos privados; desde 11/10/2026 ela acompanha a conta nos outros aparelhos (Configurações iniciais, abaixo) e, se já foi feita lá, não é perguntada de novo ao criar o `@`. “Mídias externas”, na seção Perfil público, permite revisar a decisão. Contas existentes recebem o aviso antes do primeiro carregamento. Recusa e revogação impedem novas buscas/prévias e retiram players carregados, inclusive após mudanças da escolha em outra aba.

Visitantes e contas sem `@` não carregam players de vídeo externo. GIFs do KLIPY têm aviso específico antes de buscar ou carregar o item recebido, sem pressupor consentimento do remetente. Vídeos próprios do app seguem seu contrato de publicação/moderação; este aviso não os envia a provedores externos. O player integrado é YouTube, somente após toque, com identificação limitada à origem do app. Provedores ainda não integrados continuam como links. Não tratar consentimento como garantia de moderação do catálogo público de GIFs nem como anonimato perante o serviço.

**Ponto importante:** o aviso explica IP, buscas, dados do navegador/cookies e reprodução; não promete que o provedor seja incapaz de correlacionar acessos. O app mantém E2EE e não envia wallet, chaves ou histórico de conversas ao provedor.

**Ponto importante:** visualizar o candidato nas configurações não aprova sua publicação. A ativação da análise tem validação própria no [documento da moderação](MODERACAO_AUTOMATICA_COMUNIDADES.md).

Validação da prévia: os seis testes do cliente passaram, incluindo leitura anônima, apresentação no mesmo painel e cancelamento ao sair. A conferência no navegador em 320, 390 e 1.280 px, com dados sintéticos, verificou que o candidato privado não aparece na prévia pública, a foto aprovada é decodificada após recarregar, a página compartilhável ainda funciona e não há overflow horizontal ou erros de página. Isso não concede aprovação real a nenhuma foto nem valida a precisão do detector.

Publicada em 09/10/2026 no commit `41f93e2f32c3170000165ac36ed2acb61e5cbdbc`, depois da [CI integral aprovada](https://github.com/karma352431231-ship-it/0xDMme/actions/runs/38012493553), pelo executor existente `npm run deploy:staging` em checkout isolado e limpo. Conferidos build público, preservação e retorno dos workers; rollback conservado. A publicação da prévia não ativou a análise de fotos.

## Configurações iniciais por conta — 11/10/2026

Decisão do proprietário: um “pacote de configurações básicas” para quem entra, com as escolhas valendo **por conta, não por aparelho**, e o push pedindo permissão assim que a pessoa escolhe as opções. Registro da decisão na seção 5.11 do [plano](../DECISOES_E_PLANO_DE_IMPLEMENTACAO.md).

**Quando aparece.** Depois que a conta e o aparelho estão prontos (perfil cifrado aberto e cofre carregado), se a conta ainda não tem o registro “Configurações da conta” no cofre. Vale para contas novas e para contas existentes que ainda não passaram pelo assistente. “Agora não” fecha sem mudar nada; o assistente volta na próxima entrada.

**Leitura ao entrar ou recarregar.** Conferir a sincronização antes de decidir que o registro está ausente: o checkpoint local pode estar completo enquanto outro leitor ainda consulta o servidor. Essa leitura preserva o limite de carregamento do cofre e usa a cópia local autorizada sem rede quando o aparelho está offline; falhas de sincronização não contam como configurações ausentes.

**Etapas.** (1) Escolher um ponto de partida; (2) revisar todas as opções, já marcadas; (3) salvar. Os perfis prontos não mexem no tema, nos sons nem no lembrete de backup, que são gosto ou segurança; a revisão parte dos valores atuais.

| Opção                    | Reservado  | Equilibrado       | Social            |
| ------------------------ | ---------- | ----------------- | ----------------- |
| Quem pode pedir conversa | Só convite | Wallet ou convite | Wallet ou convite |
| Online / último acesso   | Não        | Não               | Sim               |
| Confirmação de leitura   | Não        | Sim               | Sim               |
| GIFs e vídeos externos   | Só link    | Sim               | Sim               |
| Push                     | Desligado  | Ligado, completo  | Ligado, completo  |

**Onde fica cada escolha.**

- Tema, sons, mídia externa e push: registro `settings` do cofre cifrado, com entidade fixa derivada da conta e rótulo “Configurações da conta”. O servidor guarda só o bloco opaco, como os demais registros do cofre. Ao entrar em outro aparelho, o registro é aplicado ali. Mudar essas opções em Perfil atualiza o registro; gravações iguais ao que já está salvo não são feitas.
- Online, último acesso, confirmação de leitura e lembrete de backup: o perfil privado cifrado de sempre (mesma gravação do formulário).
- Quem pode pedir conversa: a configuração de descoberta no servidor, pela mesma operação assinada de Privacidade; o convite privado continua como está.
- Ficam no aparelho: arranjo dos painéis, última categoria aberta do Perfil e as escolhas de visitantes.

**Push.** “Salvar e começar” pede a permissão do navegador no próprio toque, antes de qualquer outra gravação. Em outro aparelho a permissão é do navegador: já concedida, a inscrição acontece sozinha; nunca pedida, aparece uma vez o convite “Ativar notificações neste aparelho”; negada, nada é tentado. Push desligado na conta desinscreve o aparelho quando ele abre. Falhas de uma etapa (por exemplo, permissão negada) aparecem na tela final e não impedem as demais; se o registro do cofre não puder ser salvo, o assistente volta na próxima entrada.

**Limites.** Uma conta antiga aberta numa versão anterior do app ainda guarda essas escolhas só no aparelho até atualizar. O teste físico do pedido de permissão (Android, iPhone com o app na tela inicial) e da aplicação em dois aparelhos reais continua pendente.

Validação local: lint, tipos, limites de módulos, formatação e build passaram; testes novos cobrem o formato do registro, os perfis prontos, a gravação que substitui versões concorrentes no cofre, conteúdo inválido, cofre incompleto, a aplicação da cópia da conta em outro aparelho sem gravar ecos e a troca de conta. A prévia local sem backend conferiu as três etapas do assistente em 1.280 e 375 px, sem rolagem horizontal. O fluxo com conta real, cofre e push não foi visto nesta etapa.
