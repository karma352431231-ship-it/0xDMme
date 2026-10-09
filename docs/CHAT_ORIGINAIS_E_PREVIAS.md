# Chats: originais, imagens e identidade — 09/10/2026

O proprietário pediu retirar a confirmação adicional ao criar um `@`, a escolha entre foto otimizada/arquivo original e as mensagens automáticas de perfil, além de mostrar imagens diretamente no chat. Preservar a UI final e as regras de consentimento e identidade.

- **Perfil público:** o botão Criar perfil público confirma explicitamente o `@` informado. O `@` continua único/fixo e é o nome desse perfil; não copiar nome, foto ou wallet privados para o perfil público.
- **Envio em chat individual, grupo e DM:** bytes originais, até 3.000.000 bytes decimais. Recusar excesso antes de ler/processar/enviar; selecionar continua sendo uma prévia local e Enviar é explícito. Nenhuma redução automática para contornar o limite. Originais conservam metadados; formatos genéricos seguem como arquivos, vídeos continuam indisponíveis e os formatos permitidos nas DMs permanecem.
- **Prévia no histórico:** PNG/JPEG/WebP validados carregam automaticamente na conversa aberta e verificada, inclusive imagens antigas enviadas como arquivo. GIF nas DMs conserva a validação estrutural e o orçamento de quadros. Não renderizar HTML/SVG nem executar arquivos genéricos. Imagens inválidas, incompatíveis ou acima do orçamento de pixels continuam disponíveis como arquivo original, com aviso de prévia indisponível.
- **Orçamentos:** manter teto de 3 MB, fila serial de 18 trabalhos da interface, quatro trabalhos de Worker, prazo de 30 segundos e cache de 16 mídias cifradas. Imagens originais usam o orçamento de 24 milhões de pixels já adotado na inspeção local de origem; miniaturas antigas conservam o teto de 4.194.304 pixels. Proporção/naturalidade da imagem se preserva dentro da bolha; liberar buffers e URLs ao trocar sessão/conversa ou fechar a visão. Não carregar áudio automaticamente.
- **Conversa vazia:** cartões cifrados de perfil continuam autenticados para nome/foto do cabeçalho, recuperação e exclusão, mas não aparecem como mensagens nem abrem a paginação sozinhos. Não apagar histórico existente nem criar conteúdo de demonstração.

E2EE, integridade de partes/arquivo, confirmação de snapshot e autorização cercam o download/exibição. O servidor continua recebendo apenas cifras e metadados de transporte. Fotos públicas, posts e status conservam seus próprios contratos de preparo/moderação; não alterar banco, migrações, dependências ou infraestrutura.

**Ponto importante:** abrir uma conversa com imagens passa a baixar os originais compatíveis automaticamente e pode consumir mais banda/memória. Preservar o original também preserva possíveis GPS/EXIF e comentários de GIF. Salvar no aparelho cria uma cópia independente do cofre e da exclusão bilateral.

## Verificação local

As regressões de criação pelo botão, conversa sem bolha de perfil e imagem antiga enviada como arquivo falharam contra o código anterior e passaram com a correção. Passaram 38 testes direcionados, 39 testes de integração de mensagens/DMs no banco exclusivo de testes, lint, tipos estritos, fronteiras/ciclos, formatação e build de 40 assets. Os testes conservam SDK real, adulteração/cotas/consentimento/exclusão, descarte de download atrasado, retry explícito e bytes originais com metadados.

Doze fluxos em Chromium com dados sintéticos, nas larguras 320, 390 e 1280 px, usaram Worker de produção, SDK e IndexedDB reais: original PNG de 12 MP decodificado no chat com bytes idênticos, arquivo de imagem legado, formulário de grupo, recusa de 3.000.001 bytes antes de preparar, criação do `@` sem checkbox e ausência de mensagens de perfil. Sem erros JavaScript ou excesso horizontal; captura mobile inspecionada. Evidências ficam em `.local/`. Aceite de teclado/câmera, memória e ciclo de vida em Android/iPhone físicos permanece posterior.
