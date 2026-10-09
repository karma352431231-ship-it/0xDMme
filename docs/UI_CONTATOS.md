# Contatos — revisão solicitada em 07/10/2026

Em 09/10/2026, [painéis e temas](UI_PAINEIS_E_TEMAS.md) tirou Contatos da barra mobile: a tela abre por Perfil → Contatos, agenda e convite e pelo + da lista; pedidos recebidos também aparecem na Atividade. As regras abaixo continuam.

O proprietário pediu uma interface de contatos mais clara, com menos texto e ações dispersas. A implementação mantém a identidade visual do menu lateral e do chat, sem alterar as regras de contato ou descoberta.

- Contatos liberados aparecem em linhas com nome, wallet abreviada e ação **Conversar**. Nome e endereço completos ficam nas opções da linha; nomes continuam sendo informações escolhidas pelo usuário.
- Solicitações ficam em uma aba, com Recebidas, Enviadas e Recusadas. Aceitar/Recusar são ações explícitas; cancelar um pedido fica no menu. O contador representa pedidos recebidos da página carregada, não um total global inventado.
- Agenda particular e Bloqueados têm suas próprias listas. Versões da agenda, remoções e conflitos continuam conferidos pelo cofre; abrir/editar e resolver conflitos seguem os contratos existentes. Não apresentar todos os registros como contatos autorizados.
- Adicionar contato abre um formulário contextual para wallet ou convite. Salvar apelido e solicitar conversa continuam separados. Link/QR usa o fluxo já existente; câmera encerra ao fechar o formulário ou voltar ao modo wallet. Visibilidade continua no Perfil. Na revisão posterior de configurações solicitada em 07/10/2026, o próprio convite passa para **Contatos → Meu convite**, com criação, cópia, troca, revogação e QR no mesmo painel.
- A busca filtra apenas itens carregados no aparelho. Nomes/labels e termos não são enviados ao servidor. As páginas de permissões e agenda conservam os limites existentes; indicação de página não promete pesquisa no que ainda não foi carregado.
- No mobile, botões da linha ficam juntos, com formulário em painel modal e abas acessíveis por toque/teclado. O perfil do desktop conserva a posição no rodapé esquerdo.

**Ponto importante:** salvar não aprova uma conversa. Desbloquear exige novo consentimento; o histórico e as limitações de cópias anteriores permanecem. Nenhuma dependência, migração, formato cifrado, regra de descoberta ou permissão é alterada. Implementação e sincronização de fontes não autorizam ativação na VPS.

Validação local: lint, tipos, limites de dependências e formatação conferidos; build com 38 assets públicos. Os 22 testes relacionados cobrem busca local, ciclo de sessão, agenda/contatos e navegação. Uma regressão reproduziu a perda do convite por um evento de fechamento atrasado durante o login; o formulário reaberto conserva o convite após a correção. As dez integrações de contatos passaram, incluindo visibilidade conservadora, aparelho autorizado, consentimento, bloqueios, paginação, concorrência, idempotência, sessão e CSRF.

No navegador, duas contas fictícias confirmaram busca, abertura de conversa, bloqueio/desbloqueio, salvamento/edição de apelido particular, solicitação e aceite bilateral, convite inválido com erro dentro do formulário e navegação das abas por teclado. Lista, menus e formulário foram conferidos no desktop; larguras de 320/390 px preservam abas e formulário sem rolagem horizontal do documento. Capturas e dados ficam em `.local/`. Aceite físico, teclado virtual, câmera e QR reais permanecem separados; nenhuma ativação na VPS foi executada nesta revisão.
