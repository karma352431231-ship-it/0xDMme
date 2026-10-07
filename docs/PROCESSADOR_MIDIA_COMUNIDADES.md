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

**Ponto importante:** em 07/10/2026, depois da explicação sobre a ausência do runtime e a necessidade de isolamento, o proprietário autorizou habilitar envio/preparação na VPS. O detector ainda não foi aceito; publicação permanece aguardando moderação. Essa autorização adicional cobre o runtime e unidades próprios descritos abaixo, preservando as restrições do outro projeto.

## Worker isolado autorizado

O web envia somente comandos canônicos e caminhos por socket Unix privado, sem buffers completos de mídia. O worker aceita inspeção, validação de foto, normalização e miniatura gerados pelo mesmo módulo de comandos do preparador. Campos extras, comandos divergentes, protocolos/argumentos arbitrários, symlinks, hardlinks e arquivos fora de uma única reserva são recusados. Há uma execução por vez, até quatro conexões e nenhum backlog de tarefas sem limite; cancelamento e encerramento matam o processo filho. Limites de bytes, retenção e regras dos formatos continuam os mesmos.

`0xdmme-media.service` usa usuário dinâmico e slice separado com CPUQuota=400%, MemoryMax=8G, swap desligada e até 128 tarefas. O namespace expõe apenas o runtime imutável e `objects/community-media`; não monta o release, banco, ambiente web ou objetos privados. Rede privada e AF_UNIX apenas. Diretórios públicos usam grupo primário do web e modo 0770, sem bits SUID/SGID; partes continuam 0600, original montado e resultados 0640. Um drop-in do web monta apenas o socket e configura o runtime remoto. A inicialização verifica o handshake; falhas não caem silenciosamente para execução no web.

O usuário dinâmico é `xdmme-media`, com nome aceito pelo systemd. O volume de dados conserva `noexec`; `ExecPaths=/opt/0xdmme-media` permite executar somente o alias imutável do runtime dentro do namespace próprio, sem remontar o volume do host. Um ensaio isolado confirmou recusa sem essa configuração e execução do ffprobe com ela. Validar o worker e seus executáveis antes de acrescentar a dependência do web; em retorno, remover o drop-in e recarregar as unidades antes de parar o socket, evitando parada em cascata do web.

Runtime revisado: BtbN `autobuild-2026-10-05-13-07`, FFmpeg `n9.0.2-22-g46d8f462ee`, Linux64 GPL. SHA-256: ffmpeg `cb5baa7e3156a6426e8c199e55da7914694dac08b693f9d62b8d6802e813158a`; ffprobe `9808798971b7da3333a1599ce754cc85a25d263c33b5139d2689d96645e5f99c`. Executáveis externos usados por CLI, com licença preservada, fora dos assets distribuídos ao navegador. A configuração inclui libx264; ver [licenciamento oficial do FFmpeg](https://ffmpeg.org/legal.html) e [release original](https://github.com/BtbN/FFmpeg-Builds/releases/tag/autobuild-2026-10-05-13-07).

A preparação operacional guarda baselines, arquivos, hashes, licenças, plano de retorno e evidências somente em `.local/`. Não instala pacotes de sistema. A atualização do aplicativo continua exclusivamente por `npm run deploy:staging` a partir de checkout limpo, enviado ao Git e com CI exata aprovada. Antes de ativar, conferir espaço para runtime e backups, configuração efetiva de systemd, handshake e mídia sintética real, preservação de serviços/configurações existentes e da galeria. Em falha, remover somente as adições desta instalação; nenhum dado de usuário é descartado.

## Formatos e validação

- Fotos: PNG/JPEG/WebP preparados no navegador pelo worker existente, até 3 MB e 2.048 px; resultado PNG/JPEG sem metadados. O servidor confere estrutura e decodifica o arquivo completo.
- GIFs: até 10 MB por arquivo, 20 s e 20 FPS, conservando animação/transparência. A preparação remove metadados e recusa resultado acima do limite.
- Vídeos: MP4/MOV/WebM, original até 100 MB/60 s, resultado MP4 H.264/AAC até 25 MB/720p/30 FPS. Preserva proporção, orientação e presença de áudio. Redução de qualidade é informada; excesso de duração é recusado, sem corte silencioso. Uma tolerância de 0,1 s no resultado acomoda o mux de áudio, sem permitir original acima de 60 s.

O conjunto de cada postagem/resposta aceita quatro fotos, três GIFs ou um vídeo, sem mistura. A legenda é opcional com mídia. Tipos declarados não bastam: formato/streams, bytes, duração, dimensões e resultado são conferidos. Protocolos/demuxers são restritos a arquivos locais e formatos previstos; SVG, playlists e imagens disfarçando animação não são aceitos como fotos. Não analisar conteúdo privado nem mandar mídia a serviços externos.

## Persistência, retomada e acesso

Reservas recebem partes de 262.144 bytes, com hash, ordem e gravação durável. Retries divergentes são recusados; o hash integral é conferido antes de preparar. A montagem lê partes em sequência, sem manter um vídeo de 100 MB em um buffer do servidor. Retomada reusa reservas próprias compatíveis; a interface aguarda respostas de capacidade ocupada com tentativas limitadas. Em 06/10/2026, o proprietário aprovou remover os tetos gerais de 60 escritas e 240 leituras HTTP/min por endereço de conexão. Partes, reservas, conclusão, consultas de estado e downloads não têm outro teto por minuto nem consomem o orçamento de desafios de autenticação. Concorrência, tamanho, capacidade global e prazo de preparação continuam valendo.

A admissão reserva capacidade global para partes, original montado, resultado, miniatura e metadados; não cobra cofre pessoal nem cria cota por comunidade. Ao concluir, a coleta remove as cópias de origem e reduz a reserva somente depois da limpeza física. Reserva sem postagem expira em 24 h; coleta em lotes de até 32. Conteúdo vinculado e aprovado não expira automaticamente. No corte 10, bytes ainda não aprovados passam pelo descarte global de no máximo sete dias contado desde a reserva, inclusive quando vinculados a posts/replies; texto e links são preservados. Substituição/exclusão explícita marca somente os objetos substituídos para coleta. Falha de limpeza conserva a cobrança e permite nova tentativa. Reinício libera escritores interrompidos para retomada.

Vínculo ao post/reply e validação do conjunto são transacionais, exigindo autor, comunidade, participação e mídia pronta. Cada operação privada exige sessão/aparelho/prova vigentes. Antes do corte 10, apenas o autor consulta seus descritores e abre a prévia pela API assinada. Leitura pública não inclui IDs, hashes, URLs, bytes ou miniaturas; postagem sem legenda mostra “Mídia aguardando liberação.” Não há rota estática para esses arquivos. A aprovação automática e a liberação pública continuam pendentes do aceite do scanner. A fila e o descarte do corte 10 já estão ligados à mídia preparada, com avisos/contestação em Perfil e revisão restrita do operador; ver [estado da moderação](MODERACAO_AUTOMATICA_COMUNIDADES.md#fotos-de-comunidades-e-mídia-de-postsreplies).

## Verificação

Testes unitários cobrem seleção, conjuntos, formatos, limites, retomada e isolamento do filesystem. Integração usa PostgreSQL exclusivo e FFmpeg real com arquivos sintéticos, verificando autorização/revogação, partes/retries, reserva global, vínculo/substituição/exclusão/coleta e ausência de mídia na leitura pública. CI instala o runtime somente no runner descartável de integração.

O benchmark pesado executou quatro vídeos de 60 s/1080p/60 FPS e três GIFs de 20 s/20 FPS próximos de 10 MB, incluindo o processador real com montagem, verificação e miniatura. Todos passaram, com preservação dos serviços existentes conferida. Acesso, inventário, scripts, arquivos e evidências operacionais ficam exclusivamente em `.local/`. Os ensaios sintéticos não substituem testes físicos de codecs/navegadores, revisão de segurança, moderação ao longo dos frames nem calibração da capacidade global antes da exposição pública.
