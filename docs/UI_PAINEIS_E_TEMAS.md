# Painéis e temas — redesign aprovado em 09/10/2026

**Revisão de 15/10/2026:** o arranjo e o destino público do painel passam a ter
URL própria em inglês, restaurável pela recarga e pelo histórico, preservando a
conversa privada montada. Perfis de usuário/comunidade e categorias de configurações
também têm destinos próprios. [Formatos, privacidade e validação](PERFIL_PRIVADO_E_ROTAS.md).

O proprietário avaliou a proposta de redesign apresentada em 09/10/2026 (página privada do proprietário: <https://claude.ai/artifact/BbkJaQgG4LP3oJLuiFNMcG>, versão 2) e aprovou a direção, com dois ajustes no desktop e um no mobile. A interface atual era uma base de MVP para testar funções; esta revisão define a interface do produto final. As imagens da FOMO e da GMGN foram referências de organização, não de conteúdo, dados ou marca.

## Decisões

- **Desktop em painéis.** Um trilho de ícones à esquerda leva a Painel completo, Conversas, Comunidades e Atividade; o avatar no pé do trilho abre Perfil, preservando o perfil no canto inferior esquerdo. O padrão é o Painel completo: **Contatos | Conversa | Feed**, com o feed das comunidades na maior área.
- **Recolher e abrir ao lado.** A seta no canto da conversa recolhe o painel; **Conversa ao lado**, no rodapé de Contatos, reabre (equivalente ao “Split right” da FOMO). Abrir um contato também reabre a conversa. A seta do feed recolhe as comunidades numa faixa lateral (**só conversas**); o trilho também leva a **só comunidades**. Em telas com menos de cerca de 1280 px, o modo completo usa duas colunas: Contatos e o painel em foco. O layout escolhido fica salvo somente no aparelho.
- **Privados e Públicos.** O painel de contatos no desktop e o topo de Conversas no mobile têm a escolha **Privados | Públicos**. Privados são contatos pela wallet e grupos privados. Públicos são as DMs pelo `@`, que saem da lateral de Comunidades. As listas nunca se misturam; o cabeçalho da conversa pública mostra a identidade pública usada. As regras da seção 5.9 continuam: só 1–1, sem chamadas, grupos, vídeos, transações ou acordos, sem expor wallet ou perfil privado e sem fundir contextos.
- **Painel de contexto.** Detalhes do contato ou grupo (mídia, representantes, fixar/favoritar/arquivar, bloquear, participantes, administração e cofre do grupo) ficam num painel lateral que pode ser fechado. No modo só comunidades, o painel mostra ranking ou Sobre a comunidade.
- **Mobile.** Barra inferior: **Conversas, Comunidades, Atividade e Perfil**. Adicionar contato fica no botão de nova conversa; agenda, bloqueados e Meu convite ficam em Perfil → Contatos; pedidos aparecem em Atividade. Salvar, solicitar e aceitar continuam operações separadas. Uma tela por vez, com a conversa aberta ocupando a tela.
- **Atividade.** Reúne pedidos de conversa, respostas em comunidades, chamadas perdidas, convites e transferências de grupo/comunidade. É montada no aparelho a partir das listas e avisos que o app já recebe; não cria tabela, notificação ou dado novo no servidor. Se algum item exigir dado novo, ele passa por revisão separada.
- **Três temas.** **Preto** (preto puro, padrão desde 12/10/2026), **Azul** (navy do logo) e **Branco**. A escolha fica em Perfil → Aparência; desde 11/10/2026 acompanha a conta pelo cofre cifrado ([Configurações iniciais](UI_CONFIGURACOES.md)), e visitantes guardam no aparelho. Os três usam os mesmos tokens; o degradê ciano → azul → violeta do logo aparece só como assinatura (marca, contadores, anel de status e área ativa). Verde e vermelho ficam reservados para sucesso e ações destrutivas.
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

- `src/client/app/theme.css` concentra os tokens dos três temas (Preto padrão, Azul, Branco) e os padrões de campos, botões e diálogos sem cor própria. As 185 cores literais de `app.css`, `settings.css`, `chat.css`, `contacts.css` e `community.css` passaram a usar esses tokens; Comunidades deixou de ter paleta e tema escuro próprios. Bolha recebida e enviada, contador de não lidas (degradê da marca), QR (fundo claro) e vídeo (fundo preto) têm tokens específicos.
- Perfil → **Aparência** escolhe o tema. A escolha fica em `localStorage` (`0xdmme:theme`); com conta conectada, desde 11/10/2026 também é copiada para o cofre cifrado e aplicada nos outros aparelhos da conta ([Configurações iniciais](UI_CONFIGURACOES.md)), nunca legível no servidor; valor ausente, inválido ou ilegível volta para Preto com aviso. O tema é aplicado antes da primeira renderização do app e também na página de retorno da recuperação. Barra do navegador (`theme-color`) acompanha o tema; o manifesto PWA usa Preto desde 12/10/2026.
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

## Imagens, marcação de entrega e painel de emojis — 09/10/2026

Pedido do proprietário:

- **Imagem só com o conteúdo:** fotos e GIFs no chat não mostram mais nome e tamanho em cima nem "Salvar no aparelho" embaixo; a legenda escrita por quem enviou continua. Clicar na imagem abre um visualizador em tela cheia, que fecha pelo fundo, pela imagem, por Esc ou por **Fechar**. **Salvar no aparelho** e o aviso de que a cópia salva fica fora do cofre ficam nesse visualizador. Arquivos e áudio mantêm a linha de informação.
- **Marcação de entrega em SVG**, com cerca de 11 px de altura: um traço quando o servidor aceitou, dois quando um aparelho do destinatário recebeu e na cor de leitura quando visualizada, se a confirmação de leitura estiver ativa. A regra de `messageChecks` não mudou; vale para conversas 1-1 e grupos.
- **Painel de emojis menor** (360 × 420 px), aberto junto ao botão; no celular, uma folha que sobe de baixo.
  - No topo ficam a busca e o tom de pele em ícone; logo abaixo, **Recentes**.
  - As categorias viram ícones numa barra embaixo, e a lista carrega mais conforme rola, sem botões de página.
  - Busca, tons, catálogo e desenhos continuam os mesmos. Os recentes continuam só na memória da sessão, como decidido em 03/10.

**GIFs de catálogo:** feitos logo depois, na seção abaixo, conforme a decisão do proprietário.

## Aba GIF (KLIPY) — 10/10/2026

Decisão do proprietário de 09/10/2026, registrada na seção 5.11 do plano.

- **Onde:** o painel de emojis do compositor das conversas 1-1 ganha **Emoji | GIF**. As reações continuam só com emoji.
- **Uso:** a aba abre com os GIFs em alta; a busca espera 450 ms após a digitação e carrega mais conforme rola. Um toque envia o GIF na hora como mensagem própria.
- **O que vai na mensagem:** só o link da mídia (`https://static.klipy.com/ii/…mp4`), dentro do texto E2EE de sempre. Quem recebe vê o clipe em loop, sem som e sem legenda. Versões antigas do app mostram o link.
- **Privacidade:** o navegador consulta `api.klipy.com` direto, sem identificador de usuário, cookies ou referência. O IP, os termos buscados e os GIFs vistos chegam ao KLIPY. A política de segurança libera esses dois endereços só na página do app; as demais continuam fechadas a origens externas.
- **Validação:** a resposta do KLIPY é validada. Apenas mídias `https://static.klipy.com/ii/…` em mp4, webp ou gif passam, e itens fora do formato são descartados.
- **Chave:** vem de `HASH_TALK_KLIPY_API_KEY` pela configuração pública `/api/account/config`. Sem a chave, a aba não aparece. A chave de teste do proprietário fica só em `.local/KLIPY_API_KEY`.
- **Atribuição:** "Search KLIPY" no campo e "Powered by KLIPY" no rodapé da aba.

Limitações: grupos e DMs pelo `@` ainda não enviam GIF de catálogo. A chave de teste permite 100 chamadas por hora para todo o servidor. Ativar na VPS exige colocar a chave na configuração do nosso serviço.

Validação: testes de validação da resposta, da detecção de mensagem-GIF, da chave e da política de segurança. Uma prévia local com a chave de teste conferiu em alta, busca, envio e reprodução do GIF.

## Responder pelo botão, autor em destaque e topo da comunidade — 10/10/2026

Pedido do proprietário:

- **Responder:** a caixa fixa "Escrever uma resposta" saiu. No post aberto, o botão de comentários (com a contagem) abre a caixa de resposta logo abaixo daquele post ou daquela resposta, com **Cancelar** e **Responder**, e as respostas vêm logo abaixo do post. Nos feeds, o mesmo botão continua abrindo o post.
- **Autor em destaque:** o `@` de quem postou aparece primeiro e em destaque. Nos feeds que misturam comunidades, o nome da comunidade e o horário vêm depois, mais discretos. Dentro da comunidade e no post aberto aparecem o avatar da pessoa (redondo, com a foto pública quando houver) e só o horário.
- **Topo da comunidade:** banner na cor própria da comunidade, foto grande (88 px) sobre a borda do banner, nome, seguidores, botão **Seguir/Seguindo**, descrição em destaque e "Sobre e regras". A página fica em uma coluna: topo e depois posts.
- **Gerenciar comunidade:** dono e moderadores veem o link no canto superior direito do banner. Ele abre uma tela isolada (`#comunidades?id=…&view=manage`) com nome, descrição e regras, foto, tags e as ferramentas de governança. Participantes continuam com "Participação e denúncias" na página.

**Ponto importante:** o banner é gerado a partir da cor da comunidade. Um banner enviado pelo dono seria mídia pública nova, com envio, armazenamento, migração e passagem pela moderação automática. Fica para decisão do proprietário.

## Respostas visíveis na Atividade — 10/10/2026

Pedido do proprietário: a Atividade mostra direto o que foi respondido, sem precisar abrir.

- Cada resposta mostra o avatar e "**@pessoa respondeu**", o começo do texto em contraste total (até 3 linhas) e o horário relativo; **Abrir** leva ao post aberto.
- O servidor anexa a prévia à mesma consulta de avisos, por uma leitura em lote limitada ao tamanho da página e com as mesmas regras de qualquer post público. Respostas removidas pela moderação ou excluídas não trazem autor nem texto, e a validação compartilhada recusa uma prévia oculta que traga esses dados.
- A prévia leva até 280 caracteres. Uma resposta só com mídia aparece como "Enviou uma mídia".

## Logo no app e na aba do navegador — 10/10/2026

Pedido do proprietário: usar a logo do 0xDMme no canto superior esquerdo e na aba do navegador. A escolhida é o finalista "os três juntos": balão em contorno com os pontinhos, o `0x` e o selo `1`, sobre fundo navy.

- `src/client/app/icon.svg` virou o SVG original do finalista. Ele aparece na aba (favicon), no trilho do desktop e na marca das telas estreitas.
- `icon-192.png` e `icon-512.png` (ícone instalado e manifesto) foram gerados do PNG 512 do finalista. Eles usam paleta de 256 cores e não levam metadados.
- A paleta é necessária porque o pacote "Código e licenças" tem teto de 2 MiB e os PNGs em cores completas o ultrapassavam. A diferença visual é imperceptível.
- Quem já tem o app aberto vê a logo nova depois de "Atualizar agora", porque o service worker guarda os ícones da versão anterior.

## GIF sem balão e marcação dupla legível — 10/10/2026

- **GIF carregado:** aparece sozinho, sem balão, borda ou espaçamento e sem o rótulo "GIF do KLIPY". A marcação de entrega fica logo abaixo. O consentimento para mídia externa continua o mesmo: enquanto o GIF não é permitido ou não carregou, o link segue visível.
- **Atribuição do KLIPY:** fica só no painel de GIFs ("Search KLIPY" e "Powered by KLIPY"), como no Discord. Nas mensagens não há marca d'água.
- **Marcação dupla:** dois traços inteiros lado a lado, com o segundo começando depois da perna longa do primeiro, para não parecer um traço só.

## Clipe, arrastar e soltar, aviso de limites e gestão pelo menu — 10/10/2026

Pedido do proprietário:

- **Só o clipe:**
  - O seletor de mídia de posts e respostas perdeu a descrição longa e o "Escolher arquivos"; ficaram o clipe, um resumo curto da escolha e, ao editar, "Remover a mídia atual".
  - Mensagens pelo `@` e foto do status também passaram a usar o clipe. Chat e perfil público já usavam botão.
- **Aviso de limites:** quando a escolha passa de um limite, um aviso aparece na parte de baixo, no centro da tela, por 6 segundos, e é lido por leitores de tela. Vale para posts e respostas (4 fotos, 3 GIFs ou 1 vídeo, sem mistura, tamanhos), anexo do chat (3 MB) e imagem das mensagens pelo `@`. Os limites e as validações são os mesmos de antes.
- **Arrastar e soltar** em todo lugar que aceita arquivo: conversas 1-1 e grupos, mensagens pelo `@`, posts, respostas e status. O arquivo solto passa pelo mesmo campo do clipe, com as mesmas validações; um campo desativado (por exemplo, durante gravação de voz) recusa. Fora dessas áreas, soltar um arquivo não troca a página do app.
- **Gerenciar comunidade:** o link saiu do banner. Dentro de uma comunidade que a pessoa gerencia, o menu "⋯" mostra **Gerenciar esta comunidade**, que abre a tela de configuração dela (nome, descrição, regras, foto, tags e governança). Na lista "Comunidades que você gerencia", cada comunidade abre direto essa tela.
- **Topo da comunidade:** só a foto sobrepõe o banner; nome, seguidores e "Seguir/Seguindo" ficam abaixo dele.

**Ponto importante:** o texto sobre análise da mídia, prazos de descarte e contestação deixou de aparecer junto ao seletor. As regras não mudaram, e a análise e a contestação continuam no Perfil.

## Foto sem moldura e novo áudio — 10/10/2026

Pedido do proprietário:

- **Foto sozinha:** imagem no chat aparece sem balão e sem moldura, como o GIF. A moldura escura vinha do estilo genérico de botão do chat aplicado ao botão que amplia a foto. Hora e marcação ficam abaixo da foto.
- **Mensagem de voz:** a bolha mostra só um play redondo, uma barra de posição e o tempo; não mostra mais tamanho em MB nem "Carregar áudio para ouvir". O primeiro toque baixa, decripta e toca; durante a reprodução, a mesma bolha pausa e permite arrastar a posição. Se a bolha sair da tela enquanto toca (troca de conversa, mensagem retirada), aparece um mini-player flutuante com pausa, posição e fechar.
- **Gravação:** durante a gravação, a linha de digitação dá lugar a uma barra com lixeira (cancelar), ponto vermelho, tempo `0:05 / 1:30` e botão de parar (parar e conferir). As duas funções antigas continuam.
- **Gestos no celular:**
  - segurar o microfone grava, e soltar para e abre a prévia;
  - toque duplo grava sem segurar, e a parada é pelo botão da barra;
  - toque simples mostra a dica "Segure para gravar ou toque duas vezes.".
  - No desktop, o clique continua iniciando a gravação.
  - Se o dedo soltar antes de o microfone abrir (primeira permissão), a gravação continua sem segurar.
- **Prévia:** o mesmo player da bolha, a lixeira e o aviso curto "Não enviado · some se a página recarregar". Nada é enviado sem tocar em Enviar.

**Ponto importante:** o envio continua sempre explícito. Soltar o dedo nunca envia: só abre a prévia. As mensagens pelo `@` usam o novo player nas bolhas, mas os botões de gravação delas ficaram como estavam.

## Comunidade em página cheia e perfil no painel — 10/10/2026

Pedido do proprietário:

- **Comunidade em página cheia:** na aba Comunidades isolada, o topo da comunidade usa a escala do perfil público: banner alto (até 230px), foto de 112px sobre a borda, nome grande e botão maior. No painel ao lado do chat e no celular o topo continua compacto.
- **Perfil no painel:** no modo dividido (chat à esquerda, feed à direita), clicar num `@autor` no feed, no topo de uma comunidade ou numa DM pública abre o perfil público no painel da direita, sem sair da conversa. A versão compacta tem uma coluna, banner curto, foto de 68px, "Sobre" acima da atividade e botões menores. Links do perfil continuam no painel ("Comunidades" abre a comunidade, "Solicitar DM" abre a DM na coluna do chat). As abas do painel voltam ao feed. Fora do modo dividido, o link abre a página cheia como antes.

**Ponto importante:** o perfil no painel usa as mesmas leituras públicas sem cookies e o mesmo seguir com sessão assinada da página cheia; só muda onde aparece.

## Perfil público nas configurações — 10/10/2026

Pedido do proprietário:

- O cartão "Perfil público" virou um editor no formato da página pública: banner, foto sobre a borda, `@`, "Ver meu perfil público" e a descrição.
- Tocar no banner ou na foto abre a escolha do arquivo; uma lixeira pequena no canto remove.
- Saíram os botões "Escolher/Remover", os textos de formato e prazo, o cartão separado "Como outras pessoas veem seu perfil" com "Solicitar DM pelo @", "Recarregar perfil público" (volta só como "Tentar de novo" após falha) e as mensagens de sucesso.
- Avisos de análise só aparecem quando o arquivo fica fora do público. "Mídias externas" continua.
- A página pública mostra a descrição abaixo do nome, também no perfil compacto do painel.

**Ponto importante:** a foto ou o banner em análise aparecem na prévia do dono antes de serem públicos, e nenhum aviso diz que estão em análise. Visitantes continuam vendo só o que foi aprovado.

## Perfil volta à última categoria — 10/10/2026

Pedido do proprietário: ao recarregar a página do Perfil, a categoria aberta por último (Privacidade, Perfil público, Aparelhos…) volta aberta, em vez de sempre voltar para Privacidade. A escolha fica só neste navegador (`localStorage`, chave `0xdmme:settings-section`), como o arranjo dos painéis; sem armazenamento disponível, o Perfil abre como antes.

## Seta do post volta à origem — 10/10/2026

Pedido do proprietário: no post aberto, a seta voltava sempre para a comunidade, mesmo quando o post foi aberto pelo Feed. Agora a seta volta para a última lista vista em Comunidades (Feed, Explorar, Seguidas, a própria comunidade…), com os mesmos filtros. A foto e o nome da comunidade ao lado da seta viraram um link separado para entrar nela. Sem lista de origem (post aberto pela Atividade, por um link ou depois de outra página do app), a seta leva à comunidade. Vale na página cheia e no painel ao lado do chat.

## Página da comunidade: postar, filtros, vazio e gerenciar — 10/10/2026

Pedido do proprietário (itens 2 a 4 da proposta; a coluna "Sobre" à direita foi recusada):

- **Postar:** "Criar postagem" virou uma caixa com ícone e o campo "Escreva algo para a comunidade…"; ao tocar, o formulário abre embaixo.
- **Filtros:** a fileira de botões virou abas (Destaques, Recentes, Mais votados, Mais comentados e, com conta, Meus posts) e um menu "⋯" com período, tag e, para quem modera, posts e respostas ocultos.
- **Comunidade sem posts:** em vez de "Nenhuma postagem nesta lista.", aparece um convite com "Escrever a primeira postagem" (quem pode postar) e até quatro "Outras comunidades em alta", da mesma lista pública do Explorar. Não há dado de comunidades parecidas; as sugestões são as em alta da semana. Listas filtradas (tag, período, meus posts) continuam com a mensagem curta.
- **Gerenciar:** o menu "⋯" do topo tem só "Gerenciar comunidade", e apenas para dono ou moderador da comunidade aberta; ele abre a tela de configuração dela (nome, descrição, regras, foto, tags e governança). A lista "Gerenciar comunidades" saiu. A tela de configuração não abria antes: a rota recusava `view=manage` e caía na página comum da comunidade.

**Ponto importante:** comunidades ainda não têm banner próprio enviado pelo dono; o banner continua sendo o degradê do tom da comunidade. Enviar banner exige mídia pública nova, migração e análise, como o banner de perfil.

## Gerenciar comunidade em abas e Enter para enviar — 10/10/2026

Pedido do proprietário:

- **Gerenciar comunidade:** a tela virou abas — Geral (nome, descrição, regras e foto), Tags, Moderação (moderadores, suspensão, sanções e denúncias) e, para o dono, Propriedade (transferência e arquivamento). Um grupo por vez, com os cartões lado a lado em telas largas, campos e botões menores. Tags e moderadores carregam sozinhos, sem "Carregar…"; "Mais" só aparece quando há próxima página. A aba aberta continua após salvar.
- **Enter envia** nas conversas privadas, nos grupos e nas mensagens pelo `@`: texto, foto ou prévia de voz, o mesmo que o botão Enviar enviaria. Shift+Enter quebra a linha. Em teclados de toque, Enter continua quebrando a linha (o botão de enviar fica ao lado); Ctrl/Cmd+Enter envia. Depois de escolher um arquivo com mouse e teclado, o foco volta ao campo, então Enter já envia. Nas mensagens pelo `@`, com o campo vazio, Enter envia a mídia preparada.

## Chat público igual ao privado — 10/10/2026

Pedido do proprietário: as mensagens pelo `@` usam o mesmo quadro do chat privado, na coluna de conversas e na página de Comunidades.

- **Cabeçalho:** foto e `@`, subtítulo com o estado da conversa (no lugar da presença) e menu "⋯" com Ver perfil público, Bloquear/Desbloquear e Recarregar.
- **Histórico:** bolhas iguais às do privado (enviadas à direita), emojis, GIF do KLIPY, vídeos externos e mídia com o mesmo player; "Mensagens anteriores" no topo.
- **Compositor:** o mesmo do privado (emoji com aba GIF, clipe, microfone com segurar/toque duplo, barra de gravação, prévia, Enter). Foto, GIF ou voz ficam em memória com prévia até Enviar; o envio prepara e manda a mídia com o texto digitado como legenda. Mídia salva antes neste aparelho aparece como pendente, com envio ou lixeira.
- **Pedido de conversa:** solicitar, aguardar, aceitar ou recusar aparecem num aviso no lugar do compositor.
- **Lista de conversas `@`:** linhas iguais às de Conversas, com as cópias deste aparelho embaixo.

As regras genéricas de botão/campo/ícone de Comunidades não se aplicam mais dentro do quadro de chat (`:where(:not(.chat-panel *))`, sem mudar a especificidade do restante).

**Ponto importante:** o servidor das mensagens pelo `@` não tem reações, responder, editar/apagar, confirmação de leitura nem chamadas, e as mensagens não guardam horário; por isso as bolhas públicas não mostram hora nem marcações de entrega. Esses recursos exigem trabalho de protocolo e servidor próprio.

## Prévia ao passar o mouse, Editar perfil e descrição — 11/10/2026

Pedido do proprietário:

- **Prévia ao passar o mouse** sobre o nome ou a foto de quem postou/respondeu, ou sobre o nome de uma comunidade: um cartão pequeno abre depois de um instante e fecha ao sair, rolar ou apertar Esc; o mouse pode entrar no cartão.
  - **Perfil:** foto, `@`, descrição (até 3 linhas), seguidores, posts e respostas, e Seguir/Seguindo (ou "Editar perfil público" no próprio perfil; "Entrar para seguir" sem sessão).
  - **Comunidade:** foto, nome, descrição, seguidores, quem criou e Seguir/Seguindo para quem está conectado.
  - Leituras públicas sem cookies, guardadas por 60 s para passar de novo sem nova consulta; o "Seguindo" usa a mesma assinatura do aparelho de antes. Telas de toque continuam abrindo a página ao tocar.
- **"Mensagens pelo @"** saiu do topo de Comunidades (as conversas pelo `@` continuam na coluna de conversas e na aba "Mensagens @").
- **Editar perfil público** (e "Criar perfil para seguir") abre o Perfil direto na categoria Perfil público (`#perfil?secao=profile`), também quando o Perfil já está aberto.
- **Descrição do perfil:** Enter salva (Shift+Enter quebra a linha; no celular Enter quebra a linha) e um botão "Finalizar" aparece enquanto há alteração não salva.

## Criar post: título, tags em botões, miniaturas e Postar direto — 11/10/2026

Pedido do proprietário:

- **Título** obrigatório e **texto** opcional.
- **Tags** como botões lado a lado, todas visíveis; o autor marca de 1 a 5 (as da própria comunidade, inclusive as criadas pelos gestores). Uma tag já usada no post e depois desativada continua marcável na edição.
- **Mídia:** cada foto, GIF ou vídeo escolhido aparece como miniatura com um X para tirar só aquele arquivo; escolher de novo soma à seleção, dentro dos mesmos limites (4 fotos, 3 GIFs ou 1 vídeo).
- **Postar:** o botão do topo leva à lista de comunidades e, ao escolher uma, o formulário já abre com o cursor no título.
- O post mostra todas as suas tags; cada uma filtra a comunidade por ela.

## Conversas sem wallet — 11/10/2026

Pedido do proprietário: quem entra sem conectar a wallet não vê a lista de contatos nem a conversa vazia. Em Conversas, com o shell em `data-account='guest'` e sem histórico local (`data-history` diferente de `available`):

- **Desktop (1280 px ou mais):** a coluna de Contatos sai; o cartão **Conta por wallet** ocupa a coluna da esquerda (340–440 px) e as comunidades ocupam o espaço que era da lista. Em **Só conversas**, fica só o cartão (até 560 px) e a faixa de Comunidades. O modo sem conversa (`nochat`) mostra o cartão, porque o botão que reabriria a conversa ficava na lista escondida.
- **Abaixo de 1280 px:** some a lista de contatos; marca, navegação e conta da lateral continuam.
- **Mobile:** fica só o cartão, sem “Vamos conversar?” e sem a barra de conexão.

Visitante com histórico salvo neste aparelho continua vendo a lista e a conversa, como antes. Validação: prévia local sem backend em 1.600 px (painel completo e Só conversas) e 375 px; nenhuma regra de sessão ou de dados mudou.

## Linhas mais visíveis — 12/10/2026

Pedido do proprietário: separadores entre posts, abas e painéis estavam apagados demais. Os tokens `--line` e `--line-strong` subiram um degrau nos três temas, mantendo a diferença entre eles: Azul `#27335a` / `#34426e`, Preto `#29292e` / `#3a3a40`, Branco `#d6dce9` / `#bcc6db`. Todas as bordas que usam esses tokens acompanham; nenhuma cor literal saiu do bloco de tema.

**Atividade, revisão de 13/10/2026:** abrir a caixa zera o sino; o cinza indica abertura individual do aviso. Reconhecimento de novidades local e leitura do item são estados separados. A aba Menções identifica quem marcou o usuário em post, reply ou descrição e oferece o destino atual. [Contrato de notificações](PERFIL_PUBLICO_E_FEEDS.md#contador-de-novidades-e-notificações-de-menção--13102026).

## Ping character and community actions — 14/10/2026

Owner decision after reviewing the character and placement proposals.

**Ping.** The logo's chat bubble with a face (option A1, no arms) is the app's character. Module: `src/client/ping` (SVG authored in code, colors from `--ping-*` tokens that are the same in every theme). The app icon, favicon, PWA icon and X profile photo stay faceless, which keeps the brand mark more serious.

| Moment                             | Expression                                                                  | Where                                                   |
| ---------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------- |
| Signed out                         | hello                                                                       | Wallet account card                                     |
| Opening the account                | typing (animated dots, still with reduced motion)                           | Same card while busy                                    |
| No conversation selected (desktop) | hello, large                                                                | Middle column, replacing the `#`                        |
| No conversations yet               | wink                                                                        | Conversation list                                       |
| Empty filter or no message found   | puzzled                                                                     | Conversation list filter, message search                |
| Activity empty                     | sleepy                                                                      | Activity                                                |
| Offline                            | offline (looking up, worried brows)                                         | One line above the conversation list                    |
| Start of a private conversation    | salute (🫡: hand on the forehead, not covering the face; lock on the clasp) | One-line chip “Encrypted on this device”                |
| Public `@` conversation            | alert                                                                       | One-line chip “Support never asks for your seed phrase” |
| Confirmation                       | happy                                                                       | Notices “Post published” and “Post saved”               |

Rules: one Ping per screen, only for empty, waiting, warning and confirmation moments, never inside people's messages or content. Refusal and error notices keep plain text. Desktop and mobile use the same components, so the same moments show the same face. New texts exist in English and Simplified Chinese. The offline line uses the browser's online state only; nothing is sent to the server.

**Communities “⋯”.** The menu no longer repeats My communities (Mine tab) or Following feed (Following chip); it keeps Saved, Hidden, Replies to your content and Transfers, plus Manage community where allowed. Its button now looks like the filter chips (bordered pill, readable icon, visible focus).

**Creating a community.** A floating “+” button sits bottom-right of the communities area. On the full Communities page it is filled blue. Beside Contacts, whose “+” is already the filled blue action, it is outlined in blue, so the two do not compete while the action stays exposed in the same place. On phones (700 px or less) Post remains the floating action and Create community stays in “⋯”. The small “+” in the desktop directory header was removed to avoid two create buttons on one screen. Styles live in `communities/community-actions.css`.

### Fixes and create form — 14/10/2026 (later the same day)

- **Split screen fix.** Inside the communities panel the tools row is itself positioned, so the absolute create button followed that small box and crossed the header. The button is now fixed to the viewport corner, which is the communities column in both layouts (outlined beside Contacts, filled on the full page). The “⋯” icon is centered again: its hidden text label had become a second grid row.
- **Create community form.** A banner and a photo can be added while creating, with the same local preview, review notice and limits as editing an existing community. The server still creates the community with name, description and rules; chosen images then go through the existing confirmed presentation request and app review. If the images are refused after the community exists, the form says so with the reason, and pressing Create community again retries only the images. No server, migration or privacy change.
- **Clearer hierarchy.** The form no longer reads as one white block: the lead text and field labels use the secondary tone, the public content notice sits in its own quiet box with a small warning-colored title, and Create community is the one filled blue button. Image slots are shared with the editor through `communities/image-slots.ts`; the form lives in `communities/community-create.ts` and `community-create.css`.
- **Back from creating.** The create form has a back arrow beside its title that returns to the feed, on the full page and inside the panel (community links keep the panel in place). The “⋯” menu and the floating create button are not shown while creating.

## Center feed and fixes — 15/10/2026

Owner decision after reviewing three options (option A chosen).

- **Layout.** At 1280 px or more the full layout is Contacts (unchanged) | Feed | Conversation, with the conversation in a fixed 400 px column on the right edge and its collapse arrow pointing right. Collapsing the conversation leaves Contacts | Feed, and the feed content is centered at the Communities page width (900 px plus padding). Visitors without local history keep the sign-in card on the left. Screens below 1280 px and phones are unchanged.
- **Post and Create community.** The Post buttons in the panel heading and the Communities toolbar were removed. The floating "+" opens a small menu with **Post** (pencil, same composer as before) and **Create community** (person-plus icon, same page as before). It is outlined beside Contacts, filled on the full page and on phones, where it replaced the floating Post button. Create community left the "⋯" menu. With the conversation column on the right, the button sits at the bottom-right of the feed column.
- **Opened post.** No box around the opened post: a divider below it and its larger title keep it leading, and the replies start closer, as on X. Replying still opens the box only after Reply is pressed.
- **Reply media.** Pictures and GIFs in replies are 49% of the post presentation (70% × 70%), with a 180 px floor on phones.
- **Activity.** Read items dim their text only; avatars keep their colors.
- **Private contact photos.** The conversation list and the private chat header show the photo from the contact's verified private profile card already received on this device, decrypted once per card version and never looked up publicly. After a profile change, the app sends the new card to every confirmed private contact in the background, one at a time, skipping contacts that already have that exact card. Before, the card only went to a contact whose conversation was opened. Cards remain end-to-end encrypted messages.

## Ranking sidebar and Chat | Communities — 16/10/2026

Owner decision after reviewing the sidebar (https://claude.ai/artifact/RNiWCXQr76ZREsgVRJYhP5) and the switch (https://claude.ai/artifact/UYxQs6rMMNcJXaXUw3sc62), option A.

- **Full Communities page (1280 px or more).** The layout is rail | left navigation (260 px) | feed | ranking sidebar (380 px), FOMO "Trending" style. The left navigation stays at the owner's request on 16/10/2026: it holds Feed, Ranking and the followed communities, which the sidebar's **Following** tab also lists. The tabs are Trending, Largest, New and Following. Each row shows position, photo, name, topic, followers and active growth. **»** collapses the sidebar into a strip of photos and **«** expands it; this choice is kept on the device. **See full ranking** opens the full table.
- **Split screen.** A **Chat | Communities** switch sits above the right column, which shows the conversation or the ranking. It starts on **Chat**. Opening a conversation, private or public, returns to Chat. The switch shares the column's divider and background so both read as one column, with compact buttons. New messages never switch the view; they add to the badge on Chat, which sums the unread counters the conversation list shows.
- **Realtime.** See [active members and growth](RANKING_COMUNIDADES_TRENDING.md#active-members-and-growth-display--owner-decision-on-16102026).
- Phones and screens below 1280 px are unchanged. Follower faces from the mockup are not drawn yet: they would need one extra request per row on every refresh.

## Public videos in the feed — 16/10/2026

At the owner's request, public post videos use one X-like height on every layout: up to `min(560px, 75vh)` on desktop, `min(560px, 68vh)` on phones, and `min(392px, 55vh)` in replies. The frame matches the video's proportion, so vertical "shorts" no longer sit inside side bars. Touch screens show an explicit **Full screen** button over the player's corner, because phone controls drop or hide that choice; desktops keep the native control. Loading and playback rules are unchanged.

## Ranking fixes, topic button and new-posts pill — 16/10/2026

- **Ranking table.** The sidebar's styles reused the table's class names and squeezed the community names out of the isolated Ranking page; the sidebar now uses its own `ranking-side-*` classes, guarded by a test. The "active" column label is translated.
- **Topics.** The ranking topic filter sits behind a **Topics** button on every screen size; it shows how many topics are selected while closed.
- **New-posts pill.** "Reload from the beginning" is replaced by an X-style pill at the top of the feed. It appears after the reader has gone deep into the feed (more than one and a half screens) and then returns to the top, or presses the active Feed/Discover tab again. While the reader is away from the top, the app checks the first feed page at most once every 45 seconds; when posts newer than the ones shown exist, the pill shows up to three author photos and "posted". Pressing it scrolls up and reloads only the feed, not the page. Near the top, pressing the active tab still reloads directly. Next-page navigation is unchanged.

## Profile, feed and chat polish — 16/10/2026

Owner-approved batch after testing on phone and desktop:

- **Topics** show as a pill with a colored dot and the name instead of emoji, everywhere topics appear (creation form, ranking filter, cards, ranking sidebar). Colors are theme tokens `--topic-<id>`. On a community page the topics sit quietly under the name, beside the creation date.
- **Feed "+ Follow" on phones** never offers your own profile; your own posts only offer the community.
- **Public profile on phones** is one compact card: header, bio, the four numbers in a row and the communities. Your own profile has no "Message"; editing is a round pencil button. Message, Following, the bell, the pencil and "…" share one height (40 px, 34 px beside the chat).
- **Bell:** off is an outline bell; on is a filled accent bell with a small green check. Turning it on or off confirms with a toast.
- **Post composer:** a missing title or tag shows a red summary on top and a red mark with a short message on the part itself, which receives focus.
- **Chat reactions** hang from the bubble's bottom edge, at its start, in private and public chats.
- **Uploads:** a ring fills while a file is sent and spins while it is processed. Posts show it over each chosen thumbnail; the private chat shows it in its status strip. The chat composer shows the chosen file as a card (thumbnail or file icon, name, size, "may keep GPS/EXIF"). Group and `@` chats have no upload progress events yet, so they keep their busy state.

## Framing, profile card and sending — 16/10/2026

- **Framing editor** (`src/client/image-crop`): choosing a community photo or banner, a public profile photo or banner, or the private profile photo first opens an X-style editor. Drag to move, slider/wheel/pinch to zoom, arrows and +/- on the keyboard; the picture always covers the frame. Photos use a 1:1 frame (round for profiles, rounded square for communities) saved at 800 × 800; banners use 3:1 at 1500 × 500. PNG keeps transparency, the rest becomes JPEG. Cancel keeps the current picture. The framed copy then goes through the same local preparation (size, pixels, metadata removal) as before; nothing leaves the device earlier.
- **Public profile:** on phones Message, Following, the bell and "…" fit one row (36 px). The numbers read Posts, Replies, Followed communities, then the date. In one column (up to 900 px and beside the chat) the header and the numbers form one card.
- **Sending a message:** a message on its way shows as an outgoing bubble with pulsing dots and a small × to discard it, only in its own conversation, instead of the raw "pending send to <id>" line.
- **Profile tab on phones** opens the category list; a direct link to a category still opens it, and wide screens keep reopening the last category.

## Banner frame and profile editor layout — 16/10/2026

- **Banners** of profiles and communities always show the 3:1 frame chosen in the editor, on phones, desktops, beside the chat and in the editors themselves. Desktop banners grow taller to keep the same crop instead of cutting top and bottom.
- **Public profile editor:** same contents, more even spacing. Inner margins are uniform (24 px, 16 px on phones), the remove buttons sit away from the corners, the "View my public profile" link is a quieter label, and "Confirm changes" sits inside the card (right-aligned on desktop, full width on phones). On phones the handle has its own line under the photo instead of breaking mid-word.

## All black, dividers and scrollbars — 17/10/2026

- **Preto theme is all black.** The rail, Contacts, feed, chat and ranking columns use the `--panel` token: black in Preto, the previous panel color in Azul and Branco. Columns are separated by their existing hairlines. Buttons, chips and inputs keep their dark gray so they still read as controls.
- **Post dividers.** Posts in the split feed, the full Communities feed, a community's posts and profile activity are separated by a hairline, like X, with no box, gap or rounded corners (`communities/post-dividers.css`). The opened post keeps its own layout.
- **Less empty space on large monitors.** From about 1700 px the side columns grow with the window: Contacts 272→320 px, chat 400→460 px, the Communities list 260→300 px and the ranking 380→440 px. The feed keeps its reading width (944 px split, 900 px full page), so the empty space beside it shrinks without disappearing.
- **"+" inside the feed.** The floating button is placed from the right edge of the centered feed instead of the window, on the split screen (with or without the chat) and on the full Communities page (with the ranking open or collapsed).
- **Scrollbars.** On mouse devices, every scrollable area of every page (app, wallet, recovery, Phantom probe and source listings) has a thin thumb with no track. It shows while the area scrolls and fades 2 s after scrolling stops (`src/client/scrollbars`). Touch devices keep their system overlay scrollbars.
- **Public contact photos.** In Contacts → Public, the approved photo covers the whole avatar; the initials only show while it loads or when there is no photo.
