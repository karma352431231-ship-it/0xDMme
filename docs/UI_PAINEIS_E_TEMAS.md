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
- Tipografia: as fontes novas continuam pendentes da conferência de licença/distribuição; a escala tipográfica entra junto com a etapa 2.

Validação: lint, TypeScript, fronteiras, formatação, build (38 assets, módulo novo incluído no pacote de fontes GPL) e 421 testes unitários passaram. Testes novos cobrem a leitura da preferência (ausente, válida, inválida, bloqueada), a aplicação na raiz/`theme-color` e a regra de que nenhum CSS de componente usa cor literal fora de `theme.css`. Prévia local sem backend conferiu Perfil, Aparência e Comunidades nos três temas, persistência após recarregar e Contatos em 375 px. Conversa aberta com mensagens, chamada e diálogos não foram vistos com conta real nesta etapa; a cobertura deles é pelos tokens e pela regra automatizada.
