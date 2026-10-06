# Interface de chat responsiva — 05/10/2026

Revisão solicitada pelo proprietário: lista de contatos/grupos na coluna esquerda do desktop, perfil fixo no rodapé, Configurações pelos três pontos; no celular, cabeçalho compacto com marca/lupa e navegação inferior. Decisão em [5.7 do plano](../DECISOES_E_PLANO_DE_IMPLEMENTACAO.md#57-navegação-de-chat-aprovada-em-05102026).

## Perfil unificado — corte 1 implementado localmente

Em 05/10/2026, o proprietário definiu reunir Perfil e Configurações na mesma tela em desktop/mobile. Foto, nome, wallet e demais dados da própria conta ficam no topo; todos os controles existentes ficam abaixo, sem obrigar a abrir outra página de Configurações. Preservar permissões, confirmações, estados de operações, links e parâmetros de retorno da rota atual.

No desktop, o acesso Perfil da coluna esquerda abre essa tela completa; entradas antigas de Configurações passam a conduzir a ela. No mobile, a barra inferior será Conversas, Contatos, Comunidades e Perfil. Comunidades terá Feed, Explorar e Seguindo no topo e botão de DMs no cabeçalho, conforme alternativa visual adotada no fechamento. DMs pelo `@` ficam na área Comunidades e usam somente perfil público; o fluxo por wallet permanece na área Conversas.

Perfil/Configurações foi implementado localmente em 05/10/2026. O nome/foto/wallet da própria conta e preferências privadas aparecem antes dos painéis de configuração existentes, incluindo aparelhos e acesso a cofre/backups/status. Links `#configuracoes` abrem essa mesma tela sem reescrever o fragmento ou consumir parâmetros de assinatura/retorno. Alternar entre atalhos de Perfil conserva a montagem, rascunhos e operações; mudança real de página volta ao topo.

Ao concluir o corte 1, Comunidades/DMs/perfil público ainda não existiam no aplicativo. A barra mobile tinha Conversas, Contatos e Perfil, sem entrada duplicada de Configurações. O corte 2 acrescentou a identidade pública; o corte 3 adicionou Comunidades com seu fluxo funcional, conforme registros abaixo. A disposição das releases publicadas abaixo é histórica e continua na VPS até uma ativação autorizada. Ver [seção 5.10](../DECISOES_E_PLANO_DE_IMPLEMENTACAO.md#510-perfil-e-configurações-reunidos--plano-fechado-em-05102026) e [plano de cortes](COMUNIDADES_PUBLICAS.md#cortes-de-implementação--10-entregas-revisáveis).

Validação integral: lint, TypeScript, fronteiras/ciclos, licenças, formatação, build de 38 assets e 290 testes da aplicação/91 do executor passaram. Servidores/sockets de teste exigiram execução fora do sandbox depois de `EPERM`. Conferência em navegador com conta e imagem fictícias verificou edição de nome/foto, preferências, restauração da sessão, rascunho no atalho antigo, painéis sem duplicação e links de conteúdo. Após os ajustes visuais/rolagem, passaram lint, TypeScript, build e 37 testes direcionados. A revisão final corrigiu a montagem de representantes para preservar seu painel durante a restauração da sessão; lint, TypeScript, build e testes desse módulo passaram depois da correção.

Conferência final em 1280 × 720, 390 × 844 e 320 × 850 confirmou painel de representantes após restauração, campo de organização dentro do cartão, um painel de cada configuração, rascunho preservado entre `#perfil` e `#configuracoes`, e retorno do Cofre ao Perfil com rolagem no topo. A largura da área principal coincide com a largura do conteúdo nos três tamanhos. Fotos/preferências salvas foram restauradas; screenshots ficam em `.local/`. Não foi repetida a matriz física de wallets.

**Ponto importante:** a tela Perfil mostra dados privados somente ao próprio usuário autenticado. Reunir os controles não publica wallet/nome/foto, não remove funções nem altera protocolos, banco ou dependências. Corte 1 é entrega local, sem push/deploy; toque físico Android/iOS e retorno físico pela wallet permanecem pendentes.

## Identidade pública — corte 2 implementado localmente

Em 06/10/2026, Perfil recebeu um bloco separado para criação explícita do `@` público, antes das configurações existentes. Nome/foto privados não preenchem esse bloco. O `@` é único, fixo e normalizado sem distinguir caixa; a foto escolhida separadamente permanece candidata restrita ao dono até a moderação. A página `#publico?handle=...` oferece leitura sem conta, com cabeçalho de leitura pública, sem montar o painel privado ou expor a candidata.

A conferência final verificou restauração do `@` e foto preparada, limpeza após encerrar sessão e leitura do perfil sem conta. A área principal não excede sua largura em 1280 × 720, 390 × 844 e 320 × 850. Validação de código, integrações, migração e limites está no [registro do corte 2](COMUNIDADES_PUBLICAS.md#corte-2--identidade-pública-local-em-06102026); evidências de navegador ficam somente em `.local/`.

**Ponto importante:** no fechamento do corte 2, Comunidades/DMs permaneciam para os próximos cortes. Só o `@` e o identificador público são expostos; fotos aguardam moderação. A migração 028 foi aplicada apenas no banco de testes, sem ativação na VPS ou nova dependência.

## Comunidades e governança — corte 3 implementado localmente

Em 06/10/2026, desktop recebeu a alternância Conversas/Comunidades e lista de comunidades seguidas à esquerda. Conversas conserva contatos/grupos e filtros existentes. No mobile, Comunidades ocupa a quarta área da barra com Conversas, Contatos e Perfil. Na área social, Explorar abre o diretório público, Seguindo abre a lista da própria conta e os demais acessos oferecem criação, gestão e transferências. Feed classificado e DMs ainda pertencem aos próximos cortes.

A comunidade mostra nome, descrição, contagem de seguidores, proprietário público e regras sem conta. Ao autenticar com perfil público, permite seguir/deixar de seguir e indica elegibilidade para participar, independente de seguir. “Gerenciar comunidade” recolhe edição, foto preparada e controles autorizados; participantes têm acompanhamento de sanções/denúncias. Transferência exige aceite do destinatário; arquivar/reabrir exige escolha explícita. Fotos preparadas aparecem somente aos gestores.

A conferência usou exclusivamente dados fictícios: criação, seguir e lista lateral, edição, restauração da foto restrita, arquivamento legível e reabertura, Seguindo no mobile e retorno a Conversas. Após encerrar a sessão, a comunidade continuou legível sem foto preparada, controles de gestão ou painel privado. Área principal sem excesso horizontal em 1280 × 720, 390 × 844 e 320 × 850, inclusive com gestão expandida no menor tamanho. Evidências em `.local/`; matriz física Android/iOS e wallets não foi repetida. Validações de código, autorização e persistência estão no [registro do corte 3](COMUNIDADES_PUBLICAS.md#corte-3--comunidades-e-governança-local-em-06102026).

**Ponto importante:** entrega local com migração 029 somente no banco de testes. Nenhum dado privado é publicado; fotos continuam restritas até a moderação automática validada. Posts, feed e DMs pelo `@` permanecem nos cortes seguintes, sem ativação na VPS.

## Revisão de filtros e contatos — publicada

Decisões em [5.8 do plano](../DECISOES_E_PLANO_DE_IMPLEMENTACAO.md#58-filtros-e-menu-por-contato--aprovados-em-05102026). “Organizar conversas” dá lugar aos filtros Todos, Não lidas, Favoritos, Grupos e Arquivadas. A lista conserva rolagem própria; opções de criação/convites ficam no filtro Grupos. Menus por linha usam seta no desktop, toque prolongado no mobile e teclado. Um deslocamento de mais de 10 px ou cancelamento interrompe o gesto; segurar não abre o chat nem marca leitura.

Salvar inclui a wallet na lista imediatamente, sem consulta de descoberta ou aprovação. Contatos da agenda e chats aprovados são deduplicados por wallet; o apelido particular tem precedência. Abertura da agenda usa páginas de 16 entidades e até 16 versões por entidade. Wallet sem chat aprovado abre o formulário contextual. Os botões Novo contato e Bloquear esta wallet saem do formulário; bloquear/remover são ações da linha.

Favoritos usam registro separado e cifrado de preferências, compatível com os registros legados de arquivamento/fixação. Versões concorrentes preservam o favorito até uma escolha explícita juntar seus ramos. O vínculo individual usa a referência da wallet já existente na agenda e permanece ao obter aprovação. Troca de sessão invalida a carga e limpa menus, agenda e favoritos.

Quando uma wallet arquivada obtém aprovação, a conferência dos estados aplica o silêncio à conta aprovada; retomar alertas continua exigindo desarquivar. O menu permanece aberto durante atualizações de contadores; ações ficam temporariamente indisponíveis durante uma operação, evitando descartar um clique concorrente.

Validação: a verificação integral local passou com 260 testes de aplicação e 86 do executor. Após os ajustes de menu e silêncio, lint, TypeScript, build e testes direcionados foram repetidos nas camadas afetadas. A conferência em navegador com wallet fictícia confirmou inclusão imediata, favoritar/desfavoritar, fixar, arquivar/desarquivar, remoção sem bloqueio e restauração ao salvar novamente. Em 390 × 844, a lista não transborda horizontalmente, a seta fica oculta e o menu aparece na base da tela. O gesto de 500 ms e seu cancelamento foram verificados em teste; toque físico em Android/iOS continua pendente. Evidências visuais e fixture permanecem em `.local/`.

**Ponto importante:** Remover contato grava um marcador versionado; preserva histórico, versões antigas e consentimento. Bloquear continua sendo a ação que impede novos envios. Nenhuma dependência, migração ou mudança de infraestrutura faz parte desta revisão. Em 05/10/2026, o proprietário autorizou ativar `e0cb062` pelo executor existente, com CI exata e preservação. O aceite de toque em aparelhos físicos permanece pendente.

Publicação concluída em 05/10/2026: release `e0cb062`, com [CI integral aprovada](https://github.com/karma352431231-ship-it/0xDMme/actions/runs/37279726940). Manifesto ativo e 38 assets públicos verificados; HTTPS confirmou prontidão e HTML exato dos novos filtros. A conferência independente confirmou 25 migrações, 48 tabelas, checksums e contabilidade consistentes, configurações e processo do banco preservados, backups e release anterior retidos. Nenhum serviço compartilhado foi reiniciado. Pacote de 8.344.195 bytes, dentro de 16 MiB. Acesso e evidências ficam exclusivamente em `.local/`.

## Entrega anterior publicada

A lista compartilha o controlador de conversas existente; não duplica sessões ou permissões. A rolagem da lista e da área principal são independentes. A foto continua editável no desktop e no Perfil mobile; wallet completa pode ser copiada. Contatos aprovados e histórico local mantêm o fluxo existente. Status e Cofre ficam fora da navegação principal, com suas rotas preservadas. Nesta primeira entrega, ações de organização/criação/convites ficaram recolhidas junto à lista.

A lupa encontra chats por nome/wallet e consulta o índice local cifrado das mensagens individuais, o histórico importado e as cópias locais dos grupos carregados. Consultas são paginadas, não trazem histórico remoto ausente e não enviam termos ao backend. Resultados mostram contexto e trechos locais. Troca de conta, revogação e suspensão limpam a pesquisa; resultados assíncronos antigos não podem reaparecer. Conversas arquivadas também podem aparecer na pesquisa.

**Ponto importante:** esta entrega muda a apresentação; não remove consentimento, criptografia, recuperação ou limites. A ativação na VPS foi autorizada explicitamente em 05/10/2026, pelo executor existente, sem novas dependências ou migrações.

Validação local: lint, TypeScript estrito, fronteiras de módulos, formatação e build de 38 assets passaram. Testes direcionados cobriram normalização de nomes/wallets, paginação entre grupos, legendas de anexos e invalidação por sessão/cursor; também passaram os testes de conta/perfil, visibilidade, grupos e regras do cotidiano. Nenhuma dependência ou migração foi acrescentada.

Conferência no navegador integrado: login/abertura da conta com wallet sintética, lupa, paginação da busca e Perfil mobile. Prévia visual separada com 45 contatos/grupos fictícios confirmou lista de 426 px com conteúdo de 3.840 px, perfil na borda inferior da tela de 720 px e sem rolagem da página; abertura/retorno de chat em 390 × 844 sem transbordamento horizontal. Essa prévia exercita apresentação e não substitui o fluxo entre duas contas reais. Screenshots e fixtures de apresentação ficam em `.local/`, fora do produto/Git. Aceite em aparelhos físicos permanece pendente.

Publicação concluída em 05/10/2026: release `685b9d1`, com [CI integral aprovada](https://github.com/karma352431231-ship-it/0xDMme/actions/runs/37269326144), manifesto e 38 assets públicos verificados. HTTPS público confirmou prontidão e HTML do commit exato. Banco permaneceu com 25 migrações e 48 tabelas, checksums e contabilidade consistentes. Configurações, processos e respostas passaram nas comparações de preservação; nenhum serviço compartilhado foi reiniciado. Release anterior e backups históricos ficaram retidos e conferidos. Pacote de 8.333.792 bytes, dentro de 16 MiB. Acesso e evidências operacionais permanecem em `.local/`.
