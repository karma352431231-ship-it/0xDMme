# Conversas — revisão aprovada em 07/10/2026

Em 09/10/2026, a navegação e o tema desta revisão passam a ser substituídos por [painéis e temas](UI_PAINEIS_E_TEMAS.md), por etapas. As regras de conversa abaixo continuam.

O proprietário escolheu a proposta **Conversa em foco** e autorizou sua implementação, com o menu atual incorporado à composição. As imagens fornecidas são referências de organização; dados pessoais e conteúdo das imagens não entram na interface.

- Desktop mantém a navegação Conversas/Comunidades, os filtros Todos, Não lidas, Favoritos, Grupos e Arquivadas e o perfil no rodapé esquerdo. A lista rola independentemente do perfil.
- Cabeçalho reúne destinatário, presença permitida pelas preferências, ligação e opções. Autorizações de representantes e administração/cofre de grupos permanecem acessíveis nas opções.
- Mensagens recebidas ficam à esquerda; enviadas, à direita em verde suave. Contadores na lista destacam mensagens não lidas. Os sinais de entrega/leitura usam o contrato existente; não inventar horários ou recibos que não estão disponíveis nesse contrato.
- Responder, editar, reagir, encaminhar e apagar para ambos ficam no menu de cada mensagem. Os critérios existentes de autoria, arquivo local e consentimento continuam valendo.
- Campo de mensagem fica na base. Emoji e clipe permanecem junto ao texto; o microfone dá lugar ao envio quando há texto ou anexo. Foto otimizada e arquivo original continuam distintos, com prévia e aviso de metadados antes de enviar. Gravação exige conferir a prévia e enviar explicitamente.
- Resposta/edição, gravação, prévia e envios pendentes aparecem somente quando necessários. A conexão tem estado compacto e detalhes com sincronização manual.
- Mobile abre uma conversa por vez, com voltar no cabeçalho e compositor na base. O cabeçalho da marca e a navegação principal deixam espaço para a conversa; voltam na lista. Estrutura inspirada na referência do WhatsApp, usando identidade própria.
- Não mostrar os rótulos “Conversas privadas” e “Criptografia de ponta a ponta” nessa composição. Não remover proteção criptográfica.

**Ponto importante:** entrada, retomada e invalidação por exclusão/autorização mantêm o histórico oculto até a conferência. Atualizações normais conservam a visão anterior conforme a revisão de 08/10/2026. Desde 12/10/2026, uma pausa normal conserva o histórico validado para reuso após snapshot autenticado igual e confirmação final, sem repetir sua carga; ver [contrato de reuso](BLOCO_10A_AUDIO_E_TEMPO_REAL.md#reuso-do-histórico-na-sessão--12102026). O compositor impede novo envio enquanto essa verificação não terminou. Recuperação, revogação, permissões, cota e persistência continuam sob os módulos existentes; a revisão não muda o protocolo, dependências ou banco.

Validação: verificações estáticas e build do projeto, regressões do compositor/posição de leitura e testes dos contratos de mensagens. Conferência visual deve usar somente fixture local com dados fictícios, incluindo largura mobile, ações de mensagem, prévia, volta à lista e perfil no rodapé. Aceite em aparelhos físicos e eventual ativação na VPS são etapas separadas.

## Resultado local

Lint, tipos, fronteiras, formatação e build passaram; o build conserva 38 assets e distribui as fontes do novo módulo. Cinco regressões cobrem bloqueio de envio, gravação/prévia e posição de leitura durante sincronização/troca de conversa. Os testes existentes de filtros, busca, agenda, voz, anexos, navegação, visibilidade e ações cifradas passaram. A integração PostgreSQL/HTTP concluiu 27 testes de mensagens, recuperação, exclusão, bloqueio, cotas, recibos e revogação.

Na fixture local com duas contas sintéticas, foram conferidos envio/recebimento reais, contador de não lidos, resposta, edição, foco no campo, prévia de arquivo com aviso de metadados, remoção da prévia e volta à lista. Atualização do PWA preservou as contas de teste. Conferência responsiva usa 320/390 px e desktop; capturas e evidências ficam em `.local/`. Não houve alteração de dependências, protocolo, migração ou ativação na VPS.

## Private group directory identity — 14/10/2026

Opening a group from the directory must update both the conversation panel and the selected row. Clear the direct-conversation selection immediately, then notify the directory after the group controller resolves or fails. When projecting the list, an opened group takes precedence over a stale selected contact. Filters and search reuse the same entry identity and selected state.

Group rows load the same private profile photo already received by this device, using offline vault authority and the known local/current group. They never synchronize or open a group solely to obtain an avatar. Existing independent local copies preserve their local photo access without granting remote membership. The avatar reader uses the existing private cache/history contract and account-generation checks. Missing or unavailable photos preserve initials.

A dedicated directory-photo module observes visible rows, creates at most one blob URL per visible group avatar and releases it when the row leaves the viewport. Directory replacement, search replacement/close, navigation and session reset abort the row lifecycle and prevent late bytes from reappearing. The existing conversation renderer shares that lifecycle with search. Feature-owned CSS fills the circular frame without changing app-wide theme rules.

`messages/index.ts`, `groups/index.ts` and `groups/controller.ts` remain existing hotspots. This repair adds only selection notifications and small photo/lifecycle connections. A separate reviewed split should first extract group lifecycle, then local profile/history access, then chat composition/administration; validate selection, cancellation, offline copies, authorization and E2EE recovery after each step. Do not mix that refactor with this visual repair.
