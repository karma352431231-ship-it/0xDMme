# Diagnóstico HTTP do cliente — 08/10/2026

O cliente interpretava respostas como JSON antes de conferir seu status e tipo. HTML de erros HTTP 429, 502 e 504 produz a mesma mensagem `Unexpected token '<'`; o experimento com respostas sintéticas reproduziu a captura. A configuração ativa foi conferida por leitura, mas os registros HTTP desativados não permitem identificar retrospectivamente a operação/status da captura. 429 por rajadas é hipótese, não causa confirmada. Saúde atual não exclui falha transitória anterior.

## Contrato de erro

As chamadas de conta, aparelhos, login/recuperação, cofre, contatos, mensagens, chamadas, perfis públicos, comunidades e consulta de push usam `src/client/api-response/index.ts`. Preservam credenciais, redirects, cache, assinaturas, limites de tempo e guardas existentes. Nenhuma chamada é repetida por esse módulo.

Um erro informa a operação fixa e pública (por exemplo, `messages/object`), status HTTP ou ausência de resposta, categoria (`http`, `non-json`, `invalid-json`, `network`, `timeout`, `cancelled`) e tipo reduzido (`json`, `html`, `other`, `missing`). Rótulos recusam URLs, query strings e identificadores. Respostas HTML não são exibidas nem interpretadas; seu stream é cancelado. JSON malformado também não expõe bytes. Mensagens de erro JSON válidas do contrato atual do servidor permanecem limitadas a 200 caracteres. O erro continua sendo `AccountError`, preservando tratamento de autorização e o retry limitado já existente na leitura de backup. O retorno de recuperação mantém seu tipo específico para a retomada existente.

Não registrar corpo, parâmetros, headers, URL, wallet, ticket, assinatura, CSRF ou conteúdo decifrado. Não há buffer de telemetria, envio a terceiros, gravação de diagnóstico ou habilitação de logs HTTP. A consulta de push continua produzindo somente a notificação genérica autorizada; falhas não liberam notificações.

O status compartilhado de Conversas pode apresentar falhas de contatos/cofre/grupos e das consultas de presença, além da leitura da mensagem. O identificador permite separar essas operações. Erros de conteúdo/protocolo e criptografia mantêm suas validações próprias; a correção HTTP não transforma dados inválidos em sucesso ou libera histórico parcial.

## Limite do site

Pedido do proprietário: substituir 5 por 30 r/s por IP, com rajada de 120. Manter CPU/RAM, concorrência e as demais proteções. O proxy ainda pode retornar 429 quando seus limites são atingidos. Compartilhar um IP público compartilha o orçamento por IP, conforme a [documentação do Nginx](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html). Não inferir capacidade de produção do parâmetro. Publicação pelo [executor existente](GIT_E_DEPLOY.md#ajuste-restrito-do-limite-http--08102026), com proposta privada exata, CI, preservação, teste de sintaxe, reload gracioso e rollback limitado ao arquivo próprio.

## Verificação

Regressões cobrem HTML 429/502/504, JSON válido, autorização 403, respostas vazias/malformadas, rede/prazo/cancelamento, ausência de segredos, ausência de retry e guarda de sessão. Os testes do executor cobrem escopo das duas diretivas, hashes, symlinks, recusa de tentativa incompleta, preservação, idempotência e retorno após falha de sintaxe/reload/saúde. Conferência local não estabelece que o erro original era 429; novas falhas terão a informação necessária para fechar esse diagnóstico.
