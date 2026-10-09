# Bloco 08 — Fotos e arquivos

Implementação local autorizada em 03/10/2026. O proprietário escolheu as recomendações 1A, 2A e 3A e delegou escolhas rotineiras dentro dos contratos existentes. Também autorizou continuar a implementação após compactação de contexto. A entrega mantém o motor Matrix 18.9.0, as cotas e a identidade do armazenamento existentes; não adiciona dependências ou serviços externos.

## Experiência atual

O [ajuste de chats solicitado em 09/10/2026](CHAT_ORIGINAIS_E_PREVIAS.md) substitui a escolha de otimização e o carregamento integral por toque: enviar sempre o original até 3 MB, mostrar imagens compatíveis automaticamente no histórico verificado e manter cartões de perfil fora da linha de mensagens. Autorização, cifras, cache, recuperação e exclusão permanecem. As regras abaixo registram a experiência histórica de 03/10/2026; processamento de fotos fora do chat conserva seus contratos específicos.

## Experiência histórica de 03/10/2026

- Foto otimizada por padrão, com prévia local antes de enviar. JPEG, PNG e WebP estáticos são decodificados e reencodados no aparelho; metadados privados do resultado são removidos e verificados. PNG conserva transparência; JPEG/WebP viram JPEG. Não se promete fidelidade sem perda. Outros formatos podem seguir como arquivo original.
- Arquivo original de até **3.000.000 bytes**, preservando os bytes e avisando sobre GPS/EXIF e outros metadados. Selecionar ou preparar um arquivo não envia nada. Legenda é opcional, limitada a 4.000 caracteres e cifrada com o descritor.
- Miniaturas cifradas carregam ao abrir a conversa verificada. Foto completa e arquivo original exigem toque. O arquivo original usa download como `application/octet-stream`, sem execução ou prévia HTML/SVG no chat. Salvar no aparelho cria uma cópia independente, fora da exclusão bilateral.
- Envios iniciados ficam cifrados em IndexedDB e retomam na abertura/reconexão com aplicativo e autorização válidos. A retomada consulta as partes duráveis e envia somente as ausentes. Tentativas automáticas adicionais são limitadas a três, espaçadas em pelo menos um minuto; o botão de reenvio continua disponível. App fechado pausa a transferência.
- Upload de vídeo permanece adiado. Gravação de áudio continua no bloco 10A; figurinhas e experiência específica de GIF não foram antecipadas.

## Criptografia e recuperação

Arquivo e miniatura usam separadamente `Attachment.encrypt`/`Attachment.decrypt` do SDK já selecionado. Cada objeto recebe cifra aleatória própria. Chave, IV, informação criptográfica do SDK, nome, MIME e legenda trafegam somente dentro do conteúdo Olm/Megolm autenticado. O backend recebe cifras, IDs aleatórios, participantes, tamanhos e hashes de integridade; esses metadados de transporte não são privados perante o servidor.

As referências públicas são vinculadas à assinatura do pacote e conferidas com o descritor após descriptografia. Partes e arquivo integral são verificados antes de abrir o conteúdo. Segredo errado, parte ausente ou adulteração falham sem simular sucesso. O processamento criptográfico e de imagens ocorre em Worker da própria origem, encerrado ao concluir ou exceder 30 segundos.

A integração reutiliza a [API de anexos do SDK Matrix](https://matrix-org.github.io/matrix-sdk-crypto-wasm/classes/Attachment.html). O processamento 2D separado usa uma API disponibilizada pelo [WebKit no Safari 16.4](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/), compatível com o alvo do build; documentação de suporte não substitui validação física de memória, armazenamento e ciclo de vida no iPhone.

O arquivo precisa estar integralmente durável antes da aceitação da mensagem. O descritor e suas chaves ficam recuperáveis desde a aceitação pelos arquivos de leitura do bloco 07; um aparelho novo não precisa esperar que um aparelho antigo volte. Desde o ajuste de 09/10/2026, imagens compatíveis carregam automaticamente na conversa verificada; arquivos genéricos e áudio continuam sob demanda.

A confirmação por aparelho atesta recebimento verificado e gravação do **pacote/descritor**, sem afirmar que a mídia completa foi baixada ou lida. As referências individuais do bloco 07 continuam independentes. Resolver essas referências não remove o anexo aceito: sua cópia cifrada recuperável permanece no cofre até exclusão explícita.

## Persistência, cotas e limpeza

A migração `016-attachments.sql` acrescenta reservas e referências de objetos ao PostgreSQL. O armazenamento opaco existente conserva partes em namespaces por UUID de anexo, sem URL pública. Escrita de arquivos e espera de rede ficam fora de transações SQL; leases curtos coordenam a publicação durável e impedem cancelamento durante escrita. Na inicialização, leases interrompidos retornam ao estado retomável.

A retomada sob lease exclusivo limpa temporários de escrita interrompida do próprio namespace, inclusive recentes, preservando partes finais e outros anexos. Isso impede acumular cópias temporárias ao repetir uploads depois de um reinício. O armazenamento compartilhado do cofre conserva sua política anterior; somente o namespace exclusivo do anexo recebe essa limpeza imediata.

Reserva exige sessão/aparelho atuais, prova assinada e consentimento bilateral. Cada upload reserva previamente seus bytes mais 4.096 bytes de metadados na cota de **ambos** os participantes, sem multiplicar a cobrança por aparelho. A capacidade física global contabiliza a cópia armazenada uma vez; pacote, recuperação e referências mantêm sua própria cobrança. Cota pessoal de 1.000.000.000 bytes e capacidade global existentes permanecem. Falta de capacidade desfaz a reserva antes de receber partes.

São permitidos no máximo quatro objetos incompletos por remetente e 256 globais; uma foto com miniatura ocupa dois. O serviço processa até quatro operações de transferência simultâneas. As partes têm até 262.144 bytes, no máximo 12 por arquivo. A rota de upload limita o corpo a 360.000 bytes e verifica origem, sessão, CSRF e propriedade de uma reserva antes de consumir esse corpo; a prova assinada é verificada antes de gravar.

Somente reservas **não aceitas** podem expirar após 24 horas. Limpeza acontece na inicialização, em novas reservas/cancelamentos e após exclusão, com lotes de até oito objetos. Não há timer que expire mensagens ou anexos aceitos. A exclusão bilateral marca os objetos inacessíveis na mesma transação que apaga a mensagem e encerra suas referências; a remoção física ocorre depois. A cobrança só é liberada após remover os arquivos. Falha de limpeza é reportada e deixa a cobrança conservada para uma nova tentativa.

Bloqueio suspende downloads sem apagar conteúdo. Desbloqueio exige novo consentimento para retomá-los. Revogação impede acesso do aparelho; verificações de autorização e snapshot cercam a leitura de partes. O cliente confere novamente o estado remoto antes de exibir a mídia completa. Exclusões recebidas removem partes cifradas do cache local e fecham a visão; não se promete apagar uma cópia já vista offline, salva ou exportada.

## Orçamentos do cliente

- Foto de origem: até 20.000.000 bytes, 24 milhões de pixels e lado de até 16.384 pixels, conferidos antes da decodificação. Saída com lado máximo de 2.048 pixels, reduzida adicionalmente se necessário para caber em 3 MB.
- Miniatura PNG: lado máximo de 240 pixels, reduzido para 144 se necessário, até 96.000 bytes; cifra independente.
- Jobs de Worker: fila serial de até quatro operações e prazo de 30 segundos por execução. A interface limita a fila de mídias a 18 jobs, compatível com a janela de 16 mensagens e ações manuais.
- Cache: até 16 entradas de mídia recente, com expulsão apenas de cifras locais baixadas. Envios pendentes são protegidos. O orçamento existente de 1 GB do armazenamento de mensagens continua bloqueante; não se apagam objetos remotos aceitos para liberar cache.
- Buffers da seleção e URLs Blob são liberados ao remover a seleção/fechar a visão. Nenhum conteúdo ou segredo é enviado a logs, telemetria ou serviços de análise.

## Verificação e limites de aceite

`npm run check` passou com lint, TypeScript estrito, fronteiras, licenças, formatação, build, 175 testes da aplicação e 44 testes do executor de deploy. Ajustes posteriores na retomada e na remoção de metadados foram revalidados nas camadas afetadas, incluindo a nova regressão do encoder. O build entrega 36 assets, mantendo os tetos anteriores e as fontes correspondentes completas.

Os quatro testes de anexos usam o SDK real e cobrem o limite de 3 MB, cifra independente, segredo errado, adulteração, contrato de referências, pixels/formatos e remoção de EXIF/texto acrescentado pelo encoder. Os cinco testes da base web passaram, incluindo fontes públicas e política restrita do Worker. Os 16 testes da integração de mensagens passaram com PostgreSQL e arquivos exclusivos de teste: retomada após escrita interrompida, repetição idempotente, recuperação sem sessão antiga, preservação de anexo aceito após 25 horas, cotas dos dois participantes/global, preflight HTTP, cancelamento, bloqueio, exclusão física e cópia independente. Os nove testes do cofre também passaram com a contabilização de anexos.

Os quatro testes de objetos passaram, incluindo a regressão de limpeza de temporário recente sob lease, com preservação das partes duráveis e isolamento de outro namespace. As verificações de lint/tipos dos ajustes finais também passaram. Resultados válidos das camadas não alteradas foram preservados, sem repetir toda a suíte a cada ajuste.

Ensaio no navegador do Mac com dados sintéticos exercitou os módulos reais de preparação/interface, Worker de produção, SDK e IndexedDB: foto com EXIF, prévia sem envio, miniatura automática, foto completa por clique, original de 3.000.000 bytes e recusa de cache adulterado. O ensaio da interface de mídia e a integração do backend são validações complementares; não se apresenta esse ensaio como um novo teste integral entre wallets físicas.

**Publicação em 03/10/2026:** fontes enviadas ao GitHub e ao Git exclusivo da VPS; release `8acc99d` preparada no Mac e ativada pelo executor existente após CI completa e 49 testes do deploy. Backup privado, ensaio de restauração, checksums 001–016, digests dos dados preexistentes e contabilidade foram verificados antes de abrir. A primeira verificação após abrir falhou e o executor preservou o estado novo; após investigação e reabertura deliberada da mesma release, saúde e hashes dos 36 arquivos públicos passaram, sem reproduzir a falha. A causa exata da falha inicial não foi isolada. A conclusão foi registrada somente após revisão e nova conferência, sem repetir a migração ou restaurar dados. Configurações, processos e respostas dos demais serviços passaram nas comparações; nenhuma alteração de Nginx, Node ou dependências. Evidências operacionais permanecem exclusivamente em `.local/`.

**Ponto importante:** o bloco está ativo no ambiente de testes. Testes físicos Android/iPhone, consumo de recursos nesses aparelhos e aceite final de segurança permanecem pendentes conforme a sequência do projeto. Backups e release anterior foram conservados; outras mudanças de banco/dependências continuam exigindo revisão própria. Publicação de testes não equivale a aceite para dados reais.

## Arquivos principais

- `src/shared/attachments`: contratos e limites; `src/shared/messages`: vínculo das referências ao pacote.
- `src/client/attachment-crypto`, `attachment-images`, `attachments` e `attachment-ui`: SDK, processamento, transferência/cache e apresentação.
- `src/client/messages` e `message-crypto`: rascunho, retomada, recuperação, consentimento/exclusão e chat.
- `src/server/attachments`, `database/attachments.ts`, `database/migrations/016-attachments.sql` e `object-store`: reservas, autorização, persistência durável e limpeza.
- Build, host e [fontes correspondentes](FONTES_FRONTEND.md): Worker na origem própria, WASM existente e distribuição completa sem nova dependência.
- `tests/attachments.test.ts` e integrações de mensagens/cofre: contratos de integridade, persistência, cotas e autorização.

Atualização de 05/10/2026: cota pessoal de 1 GB decimal e grupo de 2 GB, com valores compartilhados pela aplicação; sem alteração automática do orçamento global nem ativação na VPS.
