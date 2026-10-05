# Interface de chat responsiva — 05/10/2026

Revisão solicitada pelo proprietário: lista de contatos/grupos na coluna esquerda do desktop, perfil fixo no rodapé, Configurações pelos três pontos; no celular, cabeçalho compacto com marca/lupa e navegação inferior. Decisão em [5.7 do plano](../DECISOES_E_PLANO_DE_IMPLEMENTACAO.md#57-navegação-de-chat-aprovada-em-05102026).

## Revisão de filtros e contatos — implementação local

Decisões em [5.8 do plano](../DECISOES_E_PLANO_DE_IMPLEMENTACAO.md#58-filtros-e-menu-por-contato--aprovados-em-05102026). “Organizar conversas” dá lugar aos filtros Todos, Não lidas, Favoritos, Grupos e Arquivadas. A lista conserva rolagem própria; opções de criação/convites ficam no filtro Grupos. Menus por linha usam seta no desktop, toque prolongado no mobile e teclado. Um deslocamento de mais de 10 px ou cancelamento interrompe o gesto; segurar não abre o chat nem marca leitura.

Salvar inclui a wallet na lista imediatamente, sem consulta de descoberta ou aprovação. Contatos da agenda e chats aprovados são deduplicados por wallet; o apelido particular tem precedência. Abertura da agenda usa páginas de 16 entidades e até 16 versões por entidade. Wallet sem chat aprovado abre o formulário contextual. Os botões Novo contato e Bloquear esta wallet saem do formulário; bloquear/remover são ações da linha.

Favoritos usam registro separado e cifrado de preferências, compatível com os registros legados de arquivamento/fixação. Versões concorrentes preservam o favorito até uma escolha explícita juntar seus ramos. O vínculo individual usa a referência da wallet já existente na agenda e permanece ao obter aprovação. Troca de sessão invalida a carga e limpa menus, agenda e favoritos.

Quando uma wallet arquivada obtém aprovação, a conferência dos estados aplica o silêncio à conta aprovada; retomar alertas continua exigindo desarquivar. O menu permanece aberto durante atualizações de contadores; ações ficam temporariamente indisponíveis durante uma operação, evitando descartar um clique concorrente.

Validação: a verificação integral local passou com 260 testes de aplicação e 86 do executor. Após os ajustes de menu e silêncio, lint, TypeScript, build e testes direcionados foram repetidos nas camadas afetadas. A conferência em navegador com wallet fictícia confirmou inclusão imediata, favoritar/desfavoritar, fixar, arquivar/desarquivar, remoção sem bloqueio e restauração ao salvar novamente. Em 390 × 844, a lista não transborda horizontalmente, a seta fica oculta e o menu aparece na base da tela. O gesto de 500 ms e seu cancelamento foram verificados em teste; toque físico em Android/iOS continua pendente. Evidências visuais e fixture permanecem em `.local/`.

**Ponto importante:** Remover contato grava um marcador versionado; preserva histórico, versões antigas e consentimento. Bloquear continua sendo a ação que impede novos envios. Nenhuma dependência, migração ou mudança de infraestrutura faz parte desta revisão. A release pública `685b9d1` permanece com o visual anterior até uma nova ativação autorizada.

## Entrega anterior publicada

A lista compartilha o controlador de conversas existente; não duplica sessões ou permissões. A rolagem da lista e da área principal são independentes. A foto continua editável no desktop e no Perfil mobile; wallet completa pode ser copiada. Contatos aprovados e histórico local mantêm o fluxo existente. Status e Cofre ficam fora da navegação principal, com suas rotas preservadas. Nesta primeira entrega, ações de organização/criação/convites ficaram recolhidas junto à lista.

A lupa encontra chats por nome/wallet e consulta o índice local cifrado das mensagens individuais, o histórico importado e as cópias locais dos grupos carregados. Consultas são paginadas, não trazem histórico remoto ausente e não enviam termos ao backend. Resultados mostram contexto e trechos locais. Troca de conta, revogação e suspensão limpam a pesquisa; resultados assíncronos antigos não podem reaparecer. Conversas arquivadas também podem aparecer na pesquisa.

**Ponto importante:** esta entrega muda a apresentação; não remove consentimento, criptografia, recuperação ou limites. A ativação na VPS foi autorizada explicitamente em 05/10/2026, pelo executor existente, sem novas dependências ou migrações.

Validação local: lint, TypeScript estrito, fronteiras de módulos, formatação e build de 38 assets passaram. Testes direcionados cobriram normalização de nomes/wallets, paginação entre grupos, legendas de anexos e invalidação por sessão/cursor; também passaram os testes de conta/perfil, visibilidade, grupos e regras do cotidiano. Nenhuma dependência ou migração foi acrescentada.

Conferência no navegador integrado: login/abertura da conta com wallet sintética, lupa, paginação da busca e Perfil mobile. Prévia visual separada com 45 contatos/grupos fictícios confirmou lista de 426 px com conteúdo de 3.840 px, perfil na borda inferior da tela de 720 px e sem rolagem da página; abertura/retorno de chat em 390 × 844 sem transbordamento horizontal. Essa prévia exercita apresentação e não substitui o fluxo entre duas contas reais. Screenshots e fixtures de apresentação ficam em `.local/`, fora do produto/Git. Aceite em aparelhos físicos permanece pendente.

Publicação concluída em 05/10/2026: release `685b9d1`, com [CI integral aprovada](https://github.com/karma352431231-ship-it/0xDMme/actions/runs/37269326144), manifesto e 38 assets públicos verificados. HTTPS público confirmou prontidão e HTML do commit exato. Banco permaneceu com 25 migrações e 48 tabelas, checksums e contabilidade consistentes. Configurações, processos e respostas passaram nas comparações de preservação; nenhum serviço compartilhado foi reiniciado. Release anterior e backups históricos ficaram retidos e conferidos. Pacote de 8.333.792 bytes, dentro de 16 MiB. Acesso e evidências operacionais permanecem em `.local/`.
