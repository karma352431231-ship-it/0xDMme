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
