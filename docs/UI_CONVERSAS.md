# Conversas — revisão aprovada em 07/10/2026

O proprietário escolheu a proposta **Conversa em foco** e autorizou sua implementação, com o menu atual incorporado à composição. As imagens fornecidas são referências de organização; dados pessoais e conteúdo das imagens não entram na interface.

- Desktop mantém a navegação Conversas/Comunidades, os filtros Todos, Não lidas, Favoritos, Grupos e Arquivadas e o perfil no rodapé esquerdo. A lista rola independentemente do perfil.
- Cabeçalho reúne destinatário, presença permitida pelas preferências, ligação e opções. Autorizações de representantes e administração/cofre de grupos permanecem acessíveis nas opções.
- Mensagens recebidas ficam à esquerda; enviadas, à direita em verde suave. Contadores na lista destacam mensagens não lidas. Os sinais de entrega/leitura usam o contrato existente; não inventar horários ou recibos que não estão disponíveis nesse contrato.
- Responder, editar, reagir, encaminhar e apagar para ambos ficam no menu de cada mensagem. Os critérios existentes de autoria, arquivo local e consentimento continuam valendo.
- Campo de mensagem fica na base. Emoji e clipe permanecem junto ao texto; o microfone dá lugar ao envio quando há texto ou anexo. Foto otimizada e arquivo original continuam distintos, com prévia e aviso de metadados antes de enviar. Gravação exige conferir a prévia e enviar explicitamente.
- Resposta/edição, gravação, prévia e envios pendentes aparecem somente quando necessários. A conexão tem estado compacto e detalhes com sincronização manual.
- Mobile abre uma conversa por vez, com voltar no cabeçalho e compositor na base. O cabeçalho da marca e a navegação principal deixam espaço para a conversa; voltam na lista. Estrutura inspirada na referência do WhatsApp, usando identidade própria.
- Não mostrar os rótulos “Conversas privadas” e “Criptografia de ponta a ponta” nessa composição. Não remover proteção criptográfica.

**Ponto importante:** o histórico continua oculto durante a verificação de sincronização/exclusões. O compositor impede novo envio enquanto essa verificação não terminou. Recuperação, revogação, permissões, cota e persistência continuam sob os módulos existentes; a revisão não muda o protocolo, dependências ou banco.

Validação: verificações estáticas e build do projeto, regressões do compositor/posição de leitura e testes dos contratos de mensagens. Conferência visual deve usar somente fixture local com dados fictícios, incluindo largura mobile, ações de mensagem, prévia, volta à lista e perfil no rodapé. Aceite em aparelhos físicos e eventual ativação na VPS são etapas separadas.

## Resultado local

Lint, tipos, fronteiras, formatação e build passaram; o build conserva 38 assets e distribui as fontes do novo módulo. Cinco regressões cobrem bloqueio de envio, gravação/prévia e posição de leitura durante sincronização/troca de conversa. Os testes existentes de filtros, busca, agenda, voz, anexos, navegação, visibilidade e ações cifradas passaram. A integração PostgreSQL/HTTP concluiu 27 testes de mensagens, recuperação, exclusão, bloqueio, cotas, recibos e revogação.

Na fixture local com duas contas sintéticas, foram conferidos envio/recebimento reais, contador de não lidos, resposta, edição, foco no campo, prévia de arquivo com aviso de metadados, remoção da prévia e volta à lista. Atualização do PWA preservou as contas de teste. Conferência responsiva usa 320/390 px e desktop; capturas e evidências ficam em `.local/`. Não houve alteração de dependências, protocolo, migração ou ativação na VPS.
