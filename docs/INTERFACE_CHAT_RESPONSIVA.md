# Interface de chat responsiva — 05/10/2026

Revisão solicitada pelo proprietário: lista de contatos/grupos na coluna esquerda do desktop, perfil fixo no rodapé, Configurações pelos três pontos; no celular, cabeçalho compacto com marca/lupa e navegação inferior. Decisão em [5.7 do plano](../DECISOES_E_PLANO_DE_IMPLEMENTACAO.md#57-navegação-de-chat-aprovada-em-05102026).

A lista compartilha o controlador de conversas existente; não duplica sessões ou permissões. A rolagem da lista e da área principal são independentes. A foto continua editável no desktop e no Perfil mobile; wallet completa pode ser copiada. Contatos aprovados e histórico local mantêm o fluxo existente. Status e Cofre ficam fora da navegação principal, com suas rotas preservadas. Ações de organização/criação/convites ficam recolhidas junto à lista.

A lupa encontra chats por nome/wallet e consulta o índice local cifrado das mensagens individuais, o histórico importado e as cópias locais dos grupos carregados. Consultas são paginadas, não trazem histórico remoto ausente e não enviam termos ao backend. Resultados mostram contexto e trechos locais. Troca de conta, revogação e suspensão limpam a pesquisa; resultados assíncronos antigos não podem reaparecer. Conversas arquivadas também podem aparecer na pesquisa.

**Ponto importante:** esta entrega muda a apresentação; não remove consentimento, criptografia, recuperação ou limites. Não inclui ativação na VPS, novas dependências ou migrações.

Validação local: lint, TypeScript estrito, fronteiras de módulos, formatação e build de 38 assets passaram. Testes direcionados cobriram normalização de nomes/wallets, paginação entre grupos, legendas de anexos e invalidação por sessão/cursor; também passaram os testes de conta/perfil, visibilidade, grupos e regras do cotidiano. Nenhuma dependência ou migração foi acrescentada.

Conferência no navegador integrado: login/abertura da conta com wallet sintética, lupa, paginação da busca e Perfil mobile. Prévia visual separada com 45 contatos/grupos fictícios confirmou lista de 426 px com conteúdo de 3.840 px, perfil na borda inferior da tela de 720 px e sem rolagem da página; abertura/retorno de chat em 390 × 844 sem transbordamento horizontal. Essa prévia exercita apresentação e não substitui o fluxo entre duas contas reais. Screenshots e fixtures de apresentação ficam em `.local/`, fora do produto/Git. Aceite em aparelhos físicos permanece pendente; publicação da nova interface na VPS não foi realizada.
