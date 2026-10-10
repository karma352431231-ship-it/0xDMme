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

Antes de criar o `@`, o aviso oferece permitir GIFs/players externos ou manter somente links, sem obrigar a permissão para criar o perfil. A escolha geral vale por conta neste navegador, em comunidades, DMs pelo `@`, conversas e grupos privados; outros aparelhos pedem escolha própria. “Mídias externas”, na seção Perfil público, permite revisar a decisão. Contas existentes recebem o aviso antes do primeiro carregamento. Recusa e revogação impedem novas buscas/prévias e retiram players carregados, inclusive após mudanças da escolha em outra aba.

Visitantes e contas sem `@` não carregam players de vídeo externo. GIFs do KLIPY têm aviso específico antes de buscar ou carregar o item recebido, sem pressupor consentimento do remetente. Vídeos próprios do app seguem seu contrato de publicação/moderação; este aviso não os envia a provedores externos. O player integrado é YouTube, somente após toque, com identificação limitada à origem do app. Provedores ainda não integrados continuam como links. Não tratar consentimento como garantia de moderação do catálogo público de GIFs nem como anonimato perante o serviço.

**Ponto importante:** o aviso explica IP, buscas, dados do navegador/cookies e reprodução; não promete que o provedor seja incapaz de correlacionar acessos. O app mantém E2EE e não envia wallet, chaves ou histórico de conversas ao provedor.

**Ponto importante:** visualizar o candidato nas configurações não aprova sua publicação. A ativação da análise tem validação própria no [documento da moderação](MODERACAO_AUTOMATICA_COMUNIDADES.md).

Validação da prévia: os seis testes do cliente passaram, incluindo leitura anônima, apresentação no mesmo painel e cancelamento ao sair. A conferência no navegador em 320, 390 e 1.280 px, com dados sintéticos, verificou que o candidato privado não aparece na prévia pública, a foto aprovada é decodificada após recarregar, a página compartilhável ainda funciona e não há overflow horizontal ou erros de página. Isso não concede aprovação real a nenhuma foto nem valida a precisão do detector.

Publicada em 09/10/2026 no commit `41f93e2f32c3170000165ac36ed2acb61e5cbdbc`, depois da [CI integral aprovada](https://github.com/karma352431231-ship-it/0xDMme/actions/runs/38012493553), pelo executor existente `npm run deploy:staging` em checkout isolado e limpo. Conferidos build público, preservação e retorno dos workers; rollback conservado. A publicação da prévia não ativou a análise de fotos.
