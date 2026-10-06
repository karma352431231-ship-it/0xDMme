# Processamento local de mídia das comunidades

O corte 9 prepara fotos, GIFs e vídeos de posts/replies públicos. Estes bytes são legíveis pelo servidor para validação e futura moderação. DMs e chats privados mantêm E2EE e seus contratos próprios. [Contrato e estado da entrega](COMUNIDADES_PUBLICAS.md#corte-9--mídia-de-posts-e-replies-local-em-06102026).

## Configuração

O servidor chama FFmpeg e ffprobe como processos externos, sem shell, rede, relay, dependência npm nova ou binários incluídos no artefato. Configure executáveis já revisados por caminhos absolutos:

```dotenv
HASH_TALK_MEDIA_FFMPEG=/caminho/absoluto/ffmpeg
HASH_TALK_MEDIA_FFPROBE=/caminho/absoluto/ffprobe
```

Sem os dois executáveis, texto continua disponível e novas reservas de mídia retornam indisponibilidade explícita. Caminhos relativos/configuração parcial impedem a inicialização. Não há instalação automática nem processador simulado. Revisar a versão, configuração, encoders e obrigações de distribuição antes de instalar/ativar outro runtime; ver [licenças](../LICENSES.md).

Há uma preparação por vez, quatro operações de transferência simultâneas e nenhuma fila ilimitada. Cada decodificador/filtro/encoder usa até quatro threads; isso não é um teto agregado de quatro tarefas do sistema. A preparação tem prazo de 360 s e encerramento aborta os processos. No Linux, `prlimit` limita espaço de endereçamento a 8 GiB, processos a 128 e escrita ao máximo do resultado. Alocações individuais do FFmpeg têm limite de 256 MiB; isso não limita a memória total a 256 MiB. A inicialização examina os limites de memória herdados do cgroup v2 e recusa orçamento inferior a 8 GiB. O orçamento inclui folga para o servidor; não habilitar o processador no serviço web atualmente limitado sem revisão operacional própria. Em outros sistemas, esse isolamento deve ser fornecido pelo ambiente; o ensaio local no Mac não comprova uma sandbox de produção.

**Ponto importante:** os ensaios isolados com quatro threads por componente e 8 GiB foram autorizados e passaram. Isso não autoriza alterar o serviço existente, instalar dependências de produção, migrar o banco da VPS ou ativar esta entrega. Preparar isolamento, proteção do outro projeto e rollback antes da revisão de implantação.

## Formatos e validação

- Fotos: PNG/JPEG/WebP preparados no navegador pelo worker existente, até 3 MB e 2.048 px; resultado PNG/JPEG sem metadados. O servidor confere estrutura e decodifica o arquivo completo.
- GIFs: até 10 MB por arquivo, 20 s e 20 FPS, conservando animação/transparência. A preparação remove metadados e recusa resultado acima do limite.
- Vídeos: MP4/MOV/WebM, original até 100 MB/60 s, resultado MP4 H.264/AAC até 25 MB/720p/30 FPS. Preserva proporção, orientação e presença de áudio. Redução de qualidade é informada; excesso de duração é recusado, sem corte silencioso. Uma tolerância de 0,1 s no resultado acomoda o mux de áudio, sem permitir original acima de 60 s.

O conjunto de cada postagem/resposta aceita quatro fotos, três GIFs ou um vídeo, sem mistura. A legenda é opcional com mídia. Tipos declarados não bastam: formato/streams, bytes, duração, dimensões e resultado são conferidos. Protocolos/demuxers são restritos a arquivos locais e formatos previstos; SVG, playlists e imagens disfarçando animação não são aceitos como fotos. Não analisar conteúdo privado nem mandar mídia a serviços externos.

## Persistência, retomada e acesso

Reservas recebem partes de 262.144 bytes, com hash, ordem e gravação durável. Retries divergentes são recusados; o hash integral é conferido antes de preparar. A montagem lê partes em sequência, sem manter um vídeo de 100 MB em um buffer do servidor. Retomada reusa reservas próprias compatíveis; a interface aguarda respostas de frequência/capacidade ocupada com tentativas limitadas.

A admissão reserva capacidade global para partes, original montado, resultado, miniatura e metadados; não cobra cofre pessoal nem cria cota por comunidade. Ao concluir, a coleta remove as cópias de origem e reduz a reserva somente depois da limpeza física. Reserva sem postagem expira em 24 h; coleta em lotes de até 32. Conteúdo vinculado não expira automaticamente. Substituição/exclusão explícita marca somente os objetos substituídos para coleta. Falha de limpeza conserva a cobrança e permite nova tentativa. Reinício libera escritores interrompidos para retomada.

Vínculo ao post/reply e validação do conjunto são transacionais, exigindo autor, comunidade, participação e mídia pronta. Cada operação privada exige sessão/aparelho/prova vigentes. Antes do corte 10, apenas o autor consulta seus descritores e abre a prévia pela API assinada. Leitura pública não inclui IDs, hashes, URLs, bytes ou miniaturas; postagem sem legenda mostra “Mídia aguardando liberação.” Não há rota estática para esses arquivos. Aprovação automática, retenção de suspeitos, denúncia e revisão da análise pertencem ao corte 10.

## Verificação

Testes unitários cobrem seleção, conjuntos, formatos, limites, retomada e isolamento do filesystem. Integração usa PostgreSQL exclusivo e FFmpeg real com arquivos sintéticos, verificando autorização/revogação, partes/retries, reserva global, vínculo/substituição/exclusão/coleta e ausência de mídia na leitura pública. CI instala o runtime somente no runner descartável de integração.

O benchmark pesado executou quatro vídeos de 60 s/1080p/60 FPS e três GIFs de 20 s/20 FPS próximos de 10 MB, incluindo o processador real com montagem, verificação e miniatura. Todos passaram, com preservação dos serviços existentes conferida. Acesso, inventário, scripts, arquivos e evidências operacionais ficam exclusivamente em `.local/`. Os ensaios sintéticos não substituem testes físicos de codecs/navegadores, revisão de segurança, moderação ao longo dos frames nem calibração da capacidade global antes da exposição pública.
