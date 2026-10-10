# Painéis e temas — redesign aprovado em 09/10/2026

O proprietário avaliou a proposta de redesign apresentada em 09/10/2026 (página privada do proprietário: <https://claude.ai/artifact/BbkJaQgG4LP3oJLuiFNMcG>, versão 2) e aprovou a direção, com dois ajustes no desktop e um no mobile. A interface atual era uma base de MVP para testar funções; esta revisão define a interface do produto final. As imagens da FOMO e da GMGN foram referências de organização, não de conteúdo, dados ou marca.

## Decisões

- **Desktop em painéis.** Um trilho de ícones à esquerda leva a Painel completo, Conversas, Comunidades e Atividade; o avatar no pé do trilho abre Perfil, preservando o perfil no canto inferior esquerdo. O padrão é o Painel completo: **Contatos | Conversa | Feed**, com o feed das comunidades na maior área.
- **Recolher e abrir ao lado.** A seta no canto da conversa recolhe o painel; **Conversa ao lado**, no rodapé de Contatos, reabre (equivalente ao “Split right” da FOMO). Abrir um contato também reabre a conversa. A seta do feed recolhe as comunidades numa faixa lateral (**só conversas**); o trilho também leva a **só comunidades**. Em telas com menos de cerca de 1280 px, o modo completo usa duas colunas: Contatos e o painel em foco. O layout escolhido fica salvo somente no aparelho.
- **Privados e Públicos.** O painel de contatos no desktop e o topo de Conversas no mobile têm a escolha **Privados | Públicos**. Privados são contatos pela wallet e grupos privados. Públicos são as DMs pelo `@`, que saem da lateral de Comunidades. As listas nunca se misturam; o cabeçalho da conversa pública mostra a identidade pública usada. As regras da seção 5.9 continuam: só 1–1, sem chamadas, grupos, vídeos, transações ou acordos, sem expor wallet ou perfil privado e sem fundir contextos.
- **Painel de contexto.** Detalhes do contato ou grupo (mídia, representantes, fixar/favoritar/arquivar, bloquear, participantes, administração e cofre do grupo) ficam num painel lateral que pode ser fechado. No modo só comunidades, o painel mostra ranking ou Sobre a comunidade.
- **Mobile.** Barra inferior: **Conversas, Comunidades, Atividade e Perfil**. Adicionar contato fica no botão de nova conversa; agenda, bloqueados e Meu convite ficam em Perfil → Contatos; pedidos aparecem em Atividade. Salvar, solicitar e aceitar continuam operações separadas. Uma tela por vez, com a conversa aberta ocupando a tela.
- **Atividade.** Reúne pedidos de conversa, respostas em comunidades, chamadas perdidas, convites e transferências de grupo/comunidade. É montada no aparelho a partir das listas e avisos que o app já recebe; não cria tabela, notificação ou dado novo no servidor. Se algum item exigir dado novo, ele passa por revisão separada.
- **Três temas.** **Azul** (navy do logo, padrão), **Preto** (preto puro) e **Branco**. A escolha fica em Perfil → Aparência e é salva somente no aparelho. Os três usam os mesmos tokens; o degradê ciano → azul → violeta do logo aparece só como assinatura (marca, contadores, anel de status e área ativa). Verde e vermelho ficam reservados para sucesso e ações destrutivas.
- **Menos ruído.** Um único selo de ambiente de teste por tela; endereço sempre abreviado em fonte mono com cópia, e completo apenas em Detalhes; avatar sem foto com iniciais sobre degradê gerado localmente a partir do endereço; ações de mensagem no hover/toque longo; estado de entrega por ícone, com o texto completo em detalhes.

## Pré-requisitos antes de cada parte

- **Fontes.** Aprovadas em 09/10/2026: Sora e Figtree (OFL-1.1), entregues como arquivos do próprio app, sem CDN externo ([vendor/fonts](../vendor/fonts/README.md)). JetBrains Mono não entrou; o mono continua do sistema.
- **Código e licenças.** Aprovado em 09/10/2026: o rodapé sai e os links ficam em Perfil → Sobre o app, que abre sem conta.
- **Horário e prévia.** A lista e as bolhas mostram horário ou prévia somente quando o histórico local já tiver esses dados; não inventar horários ou recibos fora do contrato.

## Ordem de implementação

1. Tokens de cor e tipografia com os três temas e Perfil → Aparência, sem mudar o layout.
2. Limpeza de ruído (selo de teste, endereço curto, avatares, ações no hover, estados por ícone).
3. Painéis do desktop: trilho, Contatos com Privados/Públicos, Conversa recolhível, Feed, modos e duas colunas em telas menores.
4. Comunidades: abas Feed/Ranking/Minhas no painel, ranking em tabela e Sobre a comunidade.
5. Atividade, anéis de status e Cofre no topo do Perfil.
6. Barra mobile, Privados/Públicos em Conversas e Contatos no Perfil, com teste físico.

Cada etapa preserva rotas antigas, rascunhos, consentimento, criptografia, bloqueio durante a sincronização, permissões, cotas e persistência. Implementação local não ativa a revisão na VPS nem substitui aceite físico.

**Ponto importante:** juntar contatos privados e públicos no mesmo painel muda apenas o lugar de acesso. As identidades continuam separadas e nada passa a revelar wallet ou nome privado nas DMs pelo `@`. Preferências de tema e layout ficam no aparelho e não são enviadas ao servidor.

## Etapa 1 — tokens e temas

Implementada localmente em 09/10/2026, sem mudança de layout:

- `src/client/app/theme.css` concentra os tokens dos três temas (Azul padrão, Preto, Branco) e os padrões de campos, botões e diálogos sem cor própria. As 185 cores literais de `app.css`, `settings.css`, `chat.css`, `contacts.css` e `community.css` passaram a usar esses tokens; Comunidades deixou de ter paleta e tema escuro próprios. Bolha recebida e enviada, contador de não lidas (degradê da marca), QR (fundo claro) e vídeo (fundo preto) têm tokens específicos.
- Perfil → **Aparência** escolhe o tema. A escolha fica em `localStorage` (`0xdmme:theme`), sem servidor, cofre ou sincronização; valor ausente, inválido ou ilegível volta para Azul com aviso. O tema é aplicado antes da primeira renderização do app e também na página de retorno da recuperação. Barra do navegador (`theme-color`) acompanha o tema; o manifesto PWA usa o navy padrão.
- Tipografia: as fontes novas continuam pendentes da conferência de licença/distribuição; a escala tipográfica entrou na etapa 2.

Validação: lint, TypeScript, fronteiras, formatação, build (38 assets, módulo novo incluído no pacote de fontes GPL) e 421 testes unitários passaram. Testes novos cobrem a leitura da preferência (ausente, válida, inválida, bloqueada), a aplicação na raiz/`theme-color` e a regra de que nenhum CSS de componente usa cor literal fora de `theme.css`. Prévia local sem backend conferiu Perfil, Aparência e Comunidades nos três temas, persistência após recarregar e Contatos em 375 px. Conversa aberta com mensagens, chamada e diálogos não foram vistos com conta real nesta etapa; a cobertura deles é pelos tokens e pela regra automatizada.

## Etapa 2 — limpeza de ruído

Implementada localmente em 09/10/2026, sem mudança de layout ou de regras:

- **Um aviso de teste.** O selo **TESTE**, ao lado do logo (lateral no desktop e cabeçalho no mobile), substitui os avisos repetidos da lateral, do topo das páginas e de Perfil. O texto completo continua no título e para leitores de tela. Contatos mantém só o aviso funcional de que a busca cobre os itens carregados neste aparelho.
- **Endereço curto.** Contatos sem nome aparecem como `0xbff0…7867` na lista, no cabeçalho do chat e em Contatos; o endereço completo fica no título (hover), na cópia e na busca, que continua usando o valor completo. Sem presença compartilhada, o subtítulo do chat mostra o endereço curto em fonte mono quando o contato tem nome, no lugar de “Presença não compartilhada”.
- **Avatares.** Sem foto, o avatar mostra as iniciais do nome (ou os dois caracteres depois de `0x`) sobre um dos seis degradês da marca, escolhido no aparelho por hash FNV-1a do endereço ou do id do grupo. Nada é consultado fora do aparelho. Lista, cabeçalho e Contatos usam a mesma semente, então a cor de uma pessoa é igual nos três lugares. O módulo `src/client/identity-display` concentra essas regras e substituiu o `shortWallet` de Contatos.
- **Mensagens.** O estado de entrega aparece só pelos ✓/✓✓, com o texto no título e no rótulo acessível. “Recebida e preservada”, o estado normal, fica apenas no título; estados que pedem atenção (entrega pendente, suspensa) continuam visíveis. Em aparelhos com mouse, o botão de ações da mensagem aparece no hover ou foco; no toque continua visível.
- **Escala tipográfica.** Vinte tamanhos de fonte viraram seis tokens: legenda 12, pequeno 13, corpo 15, campo 16, seção 20 e título 24 px. Textos de 9 a 11 px passaram a 12 px. Dois tamanhos decorativos (32 e 42 px) ficaram fora da escala.

Validação: lint, TypeScript, fronteiras, formatação, build e 424 testes unitários passaram, com testes novos para endereço curto, nomes, iniciais e estabilidade da cor. Prévia local sem backend conferiu o selo e Comunidades no desktop, e Comunidades e Perfil em 320 px, sem rolagem horizontal e com a barra inferior cabendo. Lista com contatos reais, bolhas, grupos e chamada não foram vistos com conta nesta etapa. A troca do texto de teste no fixture de integração passa a atingir o título do selo; os testes de integração (PostgreSQL) não foram executados.

Pendente desta etapa, por depender de conferência: mover os links de código e licenças do rodapé para Perfil → Sobre o app.

## Etapa 3 — painéis do desktop

Implementada localmente em 09/10/2026:

- **Trilho** (a partir de 1280 px): Painel completo, Só conversas e Só comunidades. Substitui os botões Conversas/Comunidades da lateral nessa largura; abaixo de 1280 px eles continuam.
- **Painel completo** em `#conversas`: Contatos | Conversa | Feed. O feed é a mesma área de Comunidades montada num painel (`community-scope`), sem a lista de seguidas. Links de comunidade dentro do painel abrem no próprio painel; **Tela cheia** leva a `#comunidades`.
- **Recolher e abrir ao lado:** a seta no cabeçalho da conversa (individual, grupo ou @) recolhe a coluna; o botão **Conversa ao lado** no topo de Contatos alterna; abrir qualquer conversa reabre. A seta do feed recolhe as comunidades numa faixa lateral (**Só conversas**), e a faixa reabre. O arranjo fica em `localStorage` (`0xdmme:layout`), só neste aparelho.
- **Privados | Públicos** no topo de Contatos. Públicos lista as DMs pelo `@` com avatar e estado da relação, e abre a conversa pública na coluna do meio a partir de 701 px, com o aviso de que é uma mensagem pública. Em telas menores o link continua levando à página de DMs. A lista de DMs saiu da lateral de Comunidades; `#comunidades?view=dms` continua funcionando.
- O módulo de Comunidades passou a montar o feed sem lista lateral e a compartilhar a área de DM: a página de comunidades e a coluna da conversa nunca encerram a DM uma da outra, e sair de Conversas encerra a DM aberta no painel, sem polling escondido.
- Correção encontrada na conferência: no mobile sem conta, o cartão de login empurrava o chat vazio sobre o rodapé; nesse estado a área passa a rolar.

Validação: lint, TypeScript, fronteiras, formatação, build e 427 testes unitários passaram, incluindo testes novos do arranjo salvo, da reabertura da conversa e da leitura de links de comunidade/DM. Prévia local sem backend conferiu em 1440 px os três arranjos, recolher/reabrir, faixa, Públicos, persistência após recarregar e Só comunidades nos temas Azul e Branco; em 1100 px, o arranjo de duas colunas sem trilho e sem excesso horizontal; no mobile, sem mudança além da correção acima. Conversas, grupos e DMs com conta real ainda não foram conferidos nos painéis; os testes de integração (PostgreSQL) não foram executados.

## Etapa 4 — Comunidades

Implementada localmente em 09/10/2026, sem mudar ordenação, filtros válidos ou requisições:

- **Abas no painel:** Feed, Ranking e Minhas no cabeçalho do painel de comunidades do desktop. Abrem dentro do painel, sem sair de Conversas; **Tela cheia** continua levando à página de Comunidades.
- **Filtros:** os selects nativos de ordem, período e classificação viraram menus compactos (`Recentes ▾`, `Todo o histórico ▾`, `Trending ▾`) no feed geral, no ranking e nos posts de cada comunidade, com os mesmos valores e validação. O bloco recolhível "Ordenar e filtrar" do mobile saiu, porque os menus cabem na largura do celular. O filtro de tag continua nativo, alinhado na mesma linha.
- **Cabeçalho do feed:** saiu o subtítulo explicativo; o aviso de leitura pública continua.
- **Ranking em tabela:** posição, comunidade com descrição em uma linha, seguidores, ativos e upvotes em alta, com os mesmos números de antes. Sem histórico completo, o crescimento mostra "em formação" e o texto completo no título. Ordenado por tamanho, mostra só seguidores. No mobile fica apenas o último número da linha.
- **Comunidade a partir de 1280 px:** posts à esquerda; resumo/sobre (fixo ao rolar) e gestão numa coluna de 320 px à direita. Abaixo disso, a ordem continua em uma coluna.
- Removidos estilos sem uso: invólucro de filtros, subtítulo, cartão antigo do ranking e lista de DMs da lateral.

**Correção da etapa 3:** o app recebia o atributo `data-contact-scope`, o mesmo usado pelos botões Privados/Públicos. Como o clique procura o controle mais próximo, qualquer clique dentro do app era tratado como troca de escopo e os links de comunidade e de DM @ nunca abriam nos painéis (iam para a página inteira). Os botões passaram a usar `data-scope-choice`; os atributos dos controles ficam centralizados em `layout.ts`, com teste garantindo que nenhum atributo de estado do app coincide com eles. Abas do painel, links dentro do feed e DMs @ na coluna da conversa foram conferidos depois da correção.

Validação: lint, TypeScript, fronteiras, formatação, build e testes unitários passaram. Fixture sintético de comunidades (cópia local atualizada para o formato atual do ranking) conferiu ranking e menus em 1440 px e 390 px sem excesso horizontal; a grade da comunidade foi conferida com a mesma estrutura de elementos; o app real sem backend conferiu abas, links e DMs nos painéis. Com conta real, a página de uma comunidade com resumo e gestão ainda não foi vista.

## Etapa 5 — Atividade, status e cofre

Implementada localmente em 09/10/2026:

- **Atividade** (`#atividade`): pedidos de conversa recebidos, convites e ofertas de propriedade de grupo, respostas não lidas nas comunidades e transferências de comunidade pendentes. Cada seção lê a mesma API do lugar original (Contatos → Solicitações, ferramentas de grupos, Respostas ao seu conteúdo, Transferências) e usa as mesmas ações: aceitar/recusar pedido, entrar/aceitar propriedade/recusar convite, marcar respostas como lidas. Não há tabela, notificação ou dado novo no servidor.
- **Carga:** ao abrir a Atividade e uma vez por sessão autorizada, para o contador. Não há consulta periódica. Uma fonte com erro mostra o aviso na própria seção, sem esconder as demais.
- **Acesso:** item com contador no trilho (a partir de 1280 px) e sino no cabeçalho em telas menores. A barra mobile fica para a etapa 6.
- **Chamadas perdidas:** inicialmente fora, porque o app não as registrava. Em 09/10/2026 o proprietário escolheu guardá-las no cofre cifrado (ver plano, seção 5.11); implementação registrada abaixo.
- **Anel de status:** contatos com status ativo na primeira página da lista de status ganham um anel no avatar da lista de conversas. A lista é lida uma vez por sessão autorizada; se falhar, a lista simplesmente fica sem anéis. Tocar no contato continua abrindo a conversa; os status seguem em Perfil → Meu status.
- **Cofre e backup** virou uma categoria do Perfil com os mesmos cartões de uso, backup, validação e reset; `#cofre` continua funcionando e o link avulso saiu. Logo abaixo da identidade, no topo do Perfil, um medidor compacto mostra o uso (por exemplo, 312 MB de 1 GB) com a mesma consulta do cartão, sem pedido extra; fica oculto sem conta.

Validação: lint, TypeScript, fronteiras, formatação, build e testes unitários passaram, com testes novos para a soma do contador, o isolamento de falha entre fontes e a ausência de leitura sem sessão. Prévia local sem backend conferiu a Atividade sem conta, o contador no trilho, o sino oculto quando há trilho e a categoria Cofre e backup. Pedidos, convites, respostas, transferências e anéis com dados reais não foram conferidos; os testes de integração (PostgreSQL) não foram executados.

### Chamadas perdidas no cofre — 09/10/2026

Implementado conforme a escolha do proprietário (plano, seção 5.11):

- `src/client/call-log` guarda no cofre cifrado um registro `settings` com entidade e rótulo próprios ("Chamadas perdidas"), lido pelos aparelhos da conta. Versões antigas do app filtram por rótulo e ignoram o registro; o servidor recebe só blocos opacos. Sem migração ou mudança no servidor.
- O controlador de chamadas avisa quando uma chamada **recebida** some enquanto ainda tocava neste aparelho (não atendida nem recusada aqui) e quando este aparelho **atende**. Como o servidor não diferencia "atendida em outro aparelho" de "desligou", cada aparelho grava o que viu e a lista descarta chamadas marcadas como atendidas em qualquer aparelho.
- Retenção: últimas 50 de cada tipo, até 30 dias; **Limpar** na Atividade remove a lista em todos os aparelhos. Versões concorrentes se juntam ao gravar (todas as versões atuais viram pais). Se a gravação falhar, a chamada fica pendente na memória, continua listada e é regravada na próxima escrita.
- A Atividade ganhou a seção **Chamadas perdidas** e soma essas chamadas no contador.

Limitação aceita: só registra chamadas que tocaram com algum aparelho aberto e logado. Validação: testes de junção entre aparelhos, chamada atendida em outro aparelho, retenção, limpeza e recusa de registro malformado. Detecção ao vivo com duas contas reais não foi conferida.

## Etapa 6 — mobile

Implementada localmente em 09/10/2026:

- **Barra inferior:** Conversas · Comunidades · Atividade · Perfil, com o contador da Atividade no ícone. O sino do cabeçalho fica só entre 701 e 1279 px.
- **Conversas** mostra Privados/Públicos no topo da lista; o título da lista é "Conversas" no celular e "Contatos" no painel do desktop. Tocar numa conversa @ no celular abre a página de DMs, como antes.
- **Contatos sai da barra.** Agenda, bloqueados, Meu convite e pedidos continuam na tela de Contatos, aberta por **Perfil → Contatos, agenda e convite** e pelo **+** da lista (adicionar contato). O módulo de Contatos é montado uma vez por tela e o Perfil já o usa em "Quem pode me encontrar"; por isso o Perfil leva à tela existente em vez de repeti-la. Pedidos recebidos também aparecem na Atividade. Links de convite `#contatos?convite=` continuam iguais.

Validação: lint, TypeScript, fronteiras, formatação, build e testes unitários passaram. Prévia local sem backend conferiu em 390 e 320 px a barra com contador, a lista com Privados/Públicos (estado conectado simulado só na apresentação), o atalho do Perfil e a tela de Contatos, sem excesso horizontal. Toque físico em Android/iPhone continua pendente, como nas etapas anteriores.

## Orçamento do manifesto de publicação — 09/10/2026

A CI recusou a publicação a partir da etapa 3: o manifesto da release chegou a 549 arquivos para um teto de 540 no executor, porque a versão anterior já estava no limite e o redesign criou 9 arquivos. Seguindo o precedente de `574d678`, o executor não foi ampliado; os arquivos novos foram reunidos em módulos existentes da mesma responsabilidade, sem mudar comportamento:

- tokens dos temas (antes `app/theme.css`), painéis (`app/panels.css`) e Atividade (`activity/activity.css`) ficam em `app/app.css`, logo após as importações, na mesma ordem de cascata. Os tokens ficam num bloco marcado; o teste de cores literais ignora só esse bloco;
- arranjo dos painéis (antes `app/layout.ts`) fica em `app/panels.ts`;
- exibição de nomes, endereços e avatares (antes `identity-display`) fica em `appearance`;
- registro de chamadas perdidas (antes `call-log`) fica em `calls/controller.ts`, exportado por `calls/index.ts`;
- seções do Perfil (antes `app/settings.ts`) ficam em `app/pages.ts`;
- os marcadores vazios `src/client/.gitkeep` e `src/shared/.gitkeep` foram removidos.

**Ponto importante:** com a consolidação, o manifesto ficou exatamente no teto. No mesmo dia o proprietário ampliou o teto para 1024 arquivos ([Git e deploy](GIT_E_DEPLOY.md)); a consolidação foi mantida porque não muda comportamento.

## Ajuste fino ao modelo aprovado — 09/10/2026

Depois da ativação, o proprietário apontou que o desktop não estava igual ao modelo aprovado: elementos grandes demais e espaço ocupado sem necessidade. A correção vale só a partir de 1280 px; tablet e celular ficam como estavam.

- **Trilho:** marca no topo, aviso "Teste" vertical e avatar do Perfil na base. A barra da marca e o bloco de conta da coluna de Contatos saem do desktop largo; foto, wallet e configurações continuam no Perfil.
- **Contatos (272 px):** "+" compacto, Privados/Públicos com ícones e um campo "Buscar contatos e mensagens", que também abre com a tecla `/` quando ninguém está digitando. Os chips ficam Todos, Não lidas, Grupos e Fav. "Arquivadas" vira linha própria, que aciona o mesmo filtro. Linhas, avatares e o botão "Conversa ao lado", no rodapé da coluna, seguem as medidas do modelo.
- **Conversa:** coluna sem moldura nem margem, cabeçalho, bolhas e campo de mensagem compactos, e opções da mensagem num botão flutuante ao passar o mouse. A faixa de sincronização some enquanto as conversas estão em dia e volta durante a sincronização, em falhas e avisos.
- **Comunidades ao lado:** cabeçalho com abas e **Postar**. No Feed e no Ranking, o título repetido e "Mensagens pelo @" saem do painel: as DMs @ ficam em Contatos → Públicos e "Mais opções" vira ícone. Cartões, filtros, ações e "Recarregar do início" ficam compactos, e as legendas das ações seguem para leitores de tela.

**Ponto importante:** os links de código e licenças continuam visíveis numa linha fina sob a conversa, porque mover a oferta de código para o Perfil ainda depende de conferência. O status de conexão e a frase de privacidade ficam só para leitores de tela. A fonte continua Inter; Figtree/Sora seguem pendentes de conferência de licença e tamanho.

Validação: lint, TypeScript, fronteiras, formatação, build e testes unitários passaram. A prévia local com dados fictícios, só na apresentação, conferiu a 1440 px a conversa, o feed com posts sintéticos, o Perfil e o atalho Arquivadas. Também confirmou que 1000 px e 375 px não mudaram.

## Rodapé, fontes e aba de Comunidades — 09/10/2026

Decisão do proprietário no mesmo dia:

- **Sem rodapé.** Os três links de código e licenças ficam em **Perfil → Sobre o app** (antes "Aplicativo"), junto da versão e das atualizações. O build continua trocando os endereços com hash num `<template>` do shell, e o Perfil o copia ao abrir. O status de conexão segue só para leitores de tela. As páginas avulsas (carteira, recuperação, prova Phantom) mantêm o próprio rodapé.
- **Fontes Figtree e Sora**, latinas e variáveis, servidas pela própria origem (`/figtree-latin-5.3.0.woff2`, `/sora-latin-5.3.0.woff2`). O build confere o SHA-256 e o pacote de código inclui as licenças. Isso soma 54 KB, e o teto de assets do servidor web passou de 38 para 40.
- **Aba de Comunidades (≥1280 px):**
  - Lateral com o título "Comunidades" e "+" (criar), as abas **Comunidades | Mensagens @**, Feed e Ranking, e a lista **Seguidas** com avatares quadrados coloridos.
  - O feed principal tem uma linha só com o título, Descobrir/Seguindo, a ordem, **Postar** e "⋯".
  - Os cartões ficam compactos, com a tag na linha das ações.
  - Sem a coluna de ranking à direita do modelo, a pedido do proprietário.
  - Avatares de comunidade passam a ser quadrados arredondados com iniciais e tom estável em todas as larguras.

## Perfil e mobile no padrão do modelo — 09/10/2026

Pedido do proprietário: configurações do desktop e todo o mobile iguais ao modelo aprovado.

- **Perfil no desktop (≥1280 px):** a coluna de Contatos dá lugar ao Perfil, com uma coluna de 300 px à esquerda e a categoria aberta à direita.
  - A coluna mostra avatar, nome, endereço curto, Copiar wallet e Sair, os atalhos **Editar perfil**, **Meu status** e **Contatos**, o medidor do Cofre e a lista de categorias.
  - As categorias usam as próprias seções do Perfil. A lista é montada a partir delas, sem duplicar conteúdo, e sempre há uma aberta.
  - O módulo de conta continua dono da sua marcação. O layout usa `display: contents`, sem mover elementos.
- **Interruptores** substituem as caixas de seleção das preferências do Perfil, em todas as larguras.
- **"Quem pode me encontrar"** passa a se chamar **Privacidade** e mantém o subtítulo.
- **Endereço curto:** o Perfil mostra a forma curta (`EVM · 0x80c3…cf71`). O endereço completo continua no título e em Copiar wallet.
- **Mobile:**
  - A barra superior mostra o nome da tela (Conversas, Comunidades, Atividade) com o aviso "Teste" pequeno, sem a marca. A lupa aparece só em Conversas.
  - A barra inferior marca a aba ativa pela cor.
  - "+" (Conversas) e **Postar** (Comunidades) viram botões flutuantes.
  - Os chips ficam como no desktop, com "Fav." e a linha Arquivadas. Linhas, bolhas e compositor ficaram compactos.
  - Comunidades ganha abas segmentadas e uma linha de filtros, que quebra em duas para os menus não serem cortados.
  - O Perfil não tem barra superior. Ele mostra identidade, Cofre e uma lista agrupada em que cada categoria abre como tela própria, com "‹" para voltar.

**Ponto importante:** a fileira de status e os filtros da Atividade foram feitos logo depois, na seção abaixo.

## Fila de status e filtros da Atividade — 09/10/2026

Pedido do proprietário:

- **Fila de status (Conversas, celular, em Privados):** "Seu status" e os contatos aprovados com status ativo, com anel no degradê da marca.
  - Usa a mesma lista de autores que já colore os anéis dos avatares, sem rota, tabela ou dado novo no servidor.
  - A lista é atualizada ao abrir a sessão e ao voltar para Conversas, no máximo uma vez por minuto.
  - Tocar num contato abre `#status?autor=…`, e a tela de Status abre o status ativo mais novo dele. "Seu status" leva à publicação ou ao seu status ativo.
  - Contatos removidos e grupos não entram na fila.
- **Atividade:** filtros **Tudo | Pedidos | Respostas**. Pedidos reúne o que espera resposta: pedidos de conversa, convites de grupo e transferências de comunidade. Respostas mostra as respostas nas comunidades. Chamadas perdidas aparecem em Tudo. O filtro volta para Tudo ao trocar de conta.

Validação: testes do mapeamento dos filtros e da regra de quem entra na fila, mais a prévia a 390 px com nomes fictícios.

## Post em foco e respostas em fio — 09/10/2026

Pedido do proprietário: abrir um post clicando nele, com hierarquia clara entre o post, as respostas e as respostas das respostas.

- **Clique no cartão:** em qualquer feed (página de Comunidades, painel ao lado e lista de posts de uma comunidade), clicar no cartão abre o post, como o link de comentários. Botões, links, mídia, menus e texto selecionado mantêm o próprio comportamento.
- **Post em foco:** com um post aberto, saem o cartão da comunidade, a gestão e a criação de postagem.
  - No topo fica "← nome da comunidade"; depois o post com borda e título maiores e texto em contraste total.
  - Em seguida vêm **Escrever uma resposta** e **Respostas (n)**.
  - Funciona igual no painel ao lado, que já abre o post na mesma área.
- **Respostas em fio:** sem cartão próprio, com divisória entre elas e avatar menor.
  - O título fixo "Resposta" saiu. Ele aparecia em destaque e deixava o texto da resposta cinza; agora o texto é o conteúdo em destaque, e o título só aparece se a resposta tiver um.
  - Respostas de respostas ficam recuadas com uma linha guia. "Ver N respostas" some quando não há mais páginas.
  - Na terceira camada aparece "Continuar este fio →".
  - Uma resposta aberta sozinha mostra "↑ Resposta anterior" e "Postagem original" acima dela.
- As legendas das ações (comentários, visualizações, Salvar) ficam só para leitores de tela também nas telas largas. "Opções da postagem" vira o botão discreto "Opções" na linha de ações.

Sem mudança de API, servidor ou moderação. Validação: lint, TypeScript, testes unitários e uma prévia local com respostas aninhadas fictícias a 1440 e 390 px.
