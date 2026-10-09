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

- **Fontes.** A proposta usa Sora, Figtree e JetBrains Mono. Elas só entram depois de conferir licença (OFL), tamanho e distribuição como arquivos do próprio app, sem CDN externo. Até lá, as fontes do sistema seguem a nova escala tipográfica.
- **Código e licenças.** Mover os links de código/licenças do rodapé para Perfil → Sobre o app e para a tela de visitante exige confirmar antes que a oferta de código-fonte continua acessível o bastante.
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
