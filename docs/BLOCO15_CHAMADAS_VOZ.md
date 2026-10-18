# Bloco 15 — chamadas individuais de voz

## Decisão do proprietário em 05/10/2026

Implementação autorizada antes dos acordos assinados e dos itens ZK adiados. A autorização inclui continuar este bloco após compactações do chat. Voz individual inicialmente com app aberto e conectado. Ainda em 05/10/2026 o proprietário antecipou push para app fechado, escolheu emissor dedicado (opção B), controles separados por aparelho e aviso de chamada visível por padrão, com opção genérica. Isso não promete atendimento nativo em segundo plano.

- WebRTC do navegador, áudio apenas; Coturn próprio, sem serviço pago. Instalação/ativação da infraestrutura na VPS é uma revisão separada: não alterar outro projeto, serviços compartilhados ou firewall nesta implementação local.
- TURN obrigatório nos dois extremos, inclusive reconexão. Não usar STUN público nem conexão direta como fallback. SDP autenticado pela identidade dos aparelhos e cifrado com o envelope RSA-OAEP/AES-GCM já utilizado no projeto. Mídia DTLS-SRTP entre navegadores; o relay não termina a criptografia de mídia.
- Somente contatos aprovados. Preferência global “Receber chamadas”, inicialmente ligada. Conversa silenciada/arquivada não toca. Indisponibilidade, recusa, ocupado e offline têm resposta genérica para quem liga.
- Uma chamada por conta, sem espera ou transferência. Toca nos aparelhos autorizados com app aberto; aparelhos autorizados com push consentido podem abrir o app durante o convite. Primeiro atendimento confirmado no servidor vence. Recusa em qualquer aparelho encerra nos demais.
- Toque por 60 segundos, substituindo os 45 s iniciais por aprovação posterior do proprietário; conexão/reconexão por até 20 segundos. Não há limite artificial de duração. Sessões, diretórios e consentimento são revalidados, com prazo de autorização de 20 segundos.
- Pausar reprodução de mensagens de voz ao iniciar/atender. Gravação em andamento deve ser parada/cancelada primeiro; a prévia em RAM permanece enquanto a página existir.
- Nenhum histórico de chamada, chamada perdida, gravação, transcrição, sinal durável, IP ou áudio em banco/cofre/backup/logs. Somente preferências e inscrições consentidas são persistidas. Estado e envelopes em RAM têm limites e expiram; reiniciar o serviço encerra chamadas.

## Integração e limites

Sinalização separada de filas de mensagens. Consulta assinada periódica registra disponibilidade apenas transitória, sem publicar presença. Instância web única: atendimento e ocupação são decididos atomicamente em memória, após autorização em transação curta. Escalar para vários processos exige coordenação transitória própria e nova validação.

Configuração TURN ausente desabilita chamadas com aviso explícito. Credenciais temporárias não incluem conta/aparelho. Expiração de credencial TURN não é revogação instantânea de alocação existente; encerramento e prazo de autorização nos clientes continuam necessários.

Não expor segredos TURN ao frontend; não inserir IPs locais/reais no SDP encaminhado. Validar caminho de mídia por estatísticas de candidatos selecionados. Restrição de rede a TLS/443 exige planejamento específico: não ocupar a porta do Nginx compartilhado sem revisão.

## Foreground signaling wakeups — 18 October 2026

The owner reported roughly eight seconds before the recipient rang during the
physical Android/iPhone audit. The existing receiver only learns signaling from
its five-second signed snapshot poll; permission, directory verification and
non-trickle relay gathering add separate costs. This identifies a polling delay,
not an on-device breakdown of the reported eight seconds.

Successful offer, answer, accept and end operations now queue an empty `call`
event to the two accounts' existing authenticated SSE streams only when the
client opts in with `X-0xdmme-Call-Wake: 1`. Legacy tabs keep their existing
frames and polling until refreshed; unknown events never break their parser.
The header negotiates a frame type, not authority. The event carries
no call ID, participant, SDP, credential or audio. It uses the existing 100 ms
batch, current session validation, expiry and slow-socket bounds, with at most
one pending flag per event type. Call RAM state is not published as a database
commit. Failed commands and periodic sync do not create call hints; a failed
hint cannot undo a successful call operation.

The server coalesces hints for 100 ms; the client keeps one pending flag and
immediately advances its scheduled signed call snapshot. A hint arriving during a snapshot or user operation remains pending
until that work completes. It does not overlap signed requests, refresh chat or
status history, grant authority, or skip encrypted offer/identity verification.
SSE ready also requests a fresh call snapshot. The five-second polling fallback,
twenty-second authorization window and mandatory own TURN remain unchanged.

**Ponto importante:** this removes the avoidable five-second receiver wait when
the foreground SSE connection is healthy; it does not establish an end-to-end
ringing SLA. The owner's headphone/mute controls support an acoustic feedback
hypothesis, but residual noise/echo and speakerphone quality remain unaccepted.
Capture constraints, audio processing and relay configuration are unchanged.
Physical latency/audio retesting and network recovery remain necessary.

## Aceite

Testes automatizados: autorização e CSRF, replay/adulteração, contato/bloqueio/silêncio, preferência global, corrida entre aparelhos, orçamento de estado, timeouts, limpeza e credenciais; SDP somente áudio/relay, fingerprints autenticados e cancelamento de recursos. Teste sintético com dois navegadores e Coturn local para confirmar candidatos relay e fluxo de áudio. Validação física em Android/iPhone, redes distintas/restritas, suspensão e banda segue necessária antes de anunciar suporte nesses cenários.

Referências técnicas: [WebRTC/TURN](https://webrtc.org/getting-started/turn-server), [WebRTC — W3C](https://www.w3.org/TR/webrtc/), [RFC 8827](https://www.rfc-editor.org/rfc/rfc8827), [Coturn (BSD-3-Clause)](https://github.com/coturn/coturn).

## Implementação local e operação

Módulos `shared/calls`, `server/calls` e `client/calls` separam formatos/SDP, estado transitório e UI/WebRTC. Migração 026 guarda apenas “Receber chamadas” e sua revisão (256 bytes contabilizados). As novas fontes autorais do frontend entram no pacote GPL correspondente. Não há dependência npm nova.

Signed synchronization runs every five seconds, including during microphone
preparation. Leases last 20 seconds; anti-replay metadata remains for ten extra
seconds without retaining ended-call IDs/signals. The capacity follow-up of
16 October replaces the fixed call/channel counts with shared memory admission:
128 KiB per channel and one MiB per call, released by expiry/end/shutdown.
`HASH_TALK_CALL_CAPACITY` is retired. One call per account, up to 32 authenticated
devices per contact, 8 KiB encrypted signaling per device and the 365 KB HTTP
offer envelope remain. The first answer retires other offers; closing active
media also ends the call through its heartbeat if the explicit end request is
lost. ICE restart remains caller-owned, with at most two attempts eight seconds
apart within the 20-second authorization window and fresh TURN credentials when
needed. Prepared source does not establish media capacity or activate the relay.

Cada consulta informa o prazo restante das duas pontas. Cliente conta conservadoramente desde o início do pedido, incluindo tempo de assinatura/rede, e encerra no prazo mais curto; perda da autorização do parceiro não soma outro intervalo de consulta. Watchdog verifica a cada segundo, enquanto o navegador executa timers. Aba aberta pode tocar também em segundo plano enquanto continua conectada; suspensão interrompe o heartbeat e expira a autorização. Não anunciar suporte a áudio em segundo plano nos celulares antes dos testes físicos.

Authenticated call commands retain their 60-command/session/minute abuse budget;
synchronization and end remain exempt. HMAC bucket keys stay only in RAM, expire
after one minute and use memory-derived admission. The capacity follow-up removes
the transport-wide 900-request window, the shared handler operation ceiling and
fixed bucket-entry count. Normal chat/upload/read operations retain the owner's
previous removal of aggregate per-minute limits. Bandwidth, CPU, state scans and
lease recovery still require realistic measurements before final activation.

A leitura assinada `peer-directory`, necessária à autenticação das chamadas, mantém a mesma autorização de aparelho e contato, sem teto de consultas por minuto. A integração cobre leitura de identidade e encerramento após uma sequência de mais de 60 escritas normais, além de mais de 240 sincronizações assinadas; entradas inválidas continuam recusadas. Preparação ou falha da mídia não suspende o heartbeat. Encerramento sem resposta do servidor informa que o áudio local parou e que o prazo de autorização encerra o outro lado em até 20 s.

Coleta de ICE por até 10 s; se um candidato relay já existe após 2 s, envia a fotografia limitada dos candidatos em vez de esperar uma interface indisponível indefinidamente. Sinalização não usa trickle, somente relay. Fingerprint, contas, aparelhos, diretórios, ID da chamada e sequência são assinados dentro do envelope cifrado. Confere candidatos locais/remotos selecionados via `getStats()` antes de indicar conectado.

Templates de [TURN e firewall](../infra/turn/README.md) preparados para revisão separada. A revisão e ativação autorizadas em 05/10/2026 estão registradas abaixo.

## Verificação local em 05/10/2026

- Lint sem avisos, TypeScript strict, fronteiras e licenças npm passaram. Sem ciclos/importação de internals, supressões de lint ou dependências npm novas. Build entregou 38 assets, incluindo as fontes correspondentes dos módulos novos.
- Suíte unitária: 279 testes passaram; regressões finais de chamadas e autenticação foram repetidas após os ajustes correspondentes. Cobrem corrida de atendimento, replay, credenciais, SDP/fingerprint adulterados, ausência de candidatos diretos, timeouts, 1.024 canais/64 por conta, capacidade de chamadas, cancelamento durante permissão do microfone e callback tardio de autoplay.
- PostgreSQL/HTTP: 38 testes de chamadas, contatos e mensagens passaram. A versão final do teste de chamadas também passou após o ajuste do orçamento de identidade. Preferência global tem controle de revisão; CSRF/assinaturas e consentimento são exigidos. Duas abas disputam atendimento, apenas uma vence; silêncio anterior ao atendimento é revalidado imediatamente. Sem tabelas de histórico/sinalização ou pacotes de mensagens gerados pela chamada.
- Validação do deploy existente: 86 testes passaram. Isso verifica o mecanismo existente, sem autorizar ou executar ativação deste bloco.
- Coturn local 4.18.0: duas alocações comunicaram-se com 10 pacotes enviados/recebidos, sem perda. Compilação e execução exclusivamente locais, sem instalação global. Chrome usa áudio sintético e contas exclusivas de teste; não verifica qualidade acústica de microfones reais.
- Dois Chrome separados: áudio nas duas direções, candidatos locais/remotos `relay` e política obrigatória confirmados por `getStats()`, mais de 390 pacotes enviados/recebidos por extremo, mute/reativação e encerramento HTTP 200. Conexões fechadas e tracks do microfone em `ended` nas duas pontas. Chamadas consecutivas, recusa genérica e perda de autorização nas duas pontas passaram. TURN indisponível encerrou após o prazo, sem candidatos diretos ou microfone remanescente. Layout desktop/viewport móvel foi inspecionado; isso não substitui um teste em aparelho físico.
- Gravação em andamento no Chrome: clicar Atender informou que era necessário parar a gravação e manteve o convite. Após parar, a prévia de 11 s permaneceu disponível, sem envio automático, e foi possível atender. Tentar ligar durante chamada ativa preservou a conexão; mute e encerramento continuaram funcionando.

O ensaio de 05/10/2026 com duas contas iniciadas no mesmo transporte também atingiu o limite geral então existente de escrita do chat em `messages/acknowledge` e `messages/daily-heartbeat`. As chamadas e Encerrar continuaram funcionando com seu orçamento separado. Em 06/10/2026, o proprietário aprovou remover esse teto geral compartilhado, incluindo uploads, sem substituí-lo por outro valor por minuto. Capacidade e concorrência reais continuam sujeitas ao aceite operacional.

Logs, capturas e dados operacionais dos ensaios ficam exclusivamente em `.local/`, fora do Git. O CI inclui automaticamente os novos testes nos globs existentes; execução remota não realizada nesta implementação.

## Roteiro de aceite físico e ativação

1. Revisar Coturn, usuário dedicado, certificados próprios, DNS, ACL/firewall de destinos, limites de processo/banda e ausência de logs/core/swap identificáveis. Validar configurações Linux e rollback limitado às nossas adições antes de ativar serviço ou migração 026.
2. Com duas contas fictícias e contato aprovado, abrir o app nos dois aparelhos. Ligar, atender, ouvir nas duas direções, silenciar/reativar o microfone e encerrar de cada lado. Confirmar indicador de microfone liberado e candidatos relay locais/remotos selecionados.
3. Abrir dois aparelhos/abas da mesma conta; atender simultaneamente, confirmar apenas um vencedor e parada do toque nos demais. Recusar em um e confirmar encerramento nos outros. Repetir duas chamadas consecutivas e deixar tocar até 60 s. Com push ativo, abrir um aparelho antes desconectado durante o convite e disputar atendimento; cancelamento/expiração não podem reaparecer.
4. Desativar “Receber chamadas”, silenciar/arquivar e bloquear o contato; confirmar ausência de toque e resposta genérica ao chamador. Revogar aparelho, sair da conta ou interromper autorização; confirmar encerramento em até 20 s, sem reaparecer ao reconectar.
5. Interromper/reintroduzir a rede durante chamada; conferir retomada via relay dentro de 20 s ou encerramento explícito. Repetir em Android/iPhone, Wi-Fi/dados móveis, IPv4/IPv6, TURN UDP/TCP/TLS e rede restrita. TLS/443 e app suspenso/fechado continuam cenários sem suporte anunciado até validação específica.
6. Iniciar gravação de mensagem de voz e tentar ligar/atender: exigir parar/cancelar; conferir prévia em RAM preservada. Durante reprodução, confirmar pausa ao iniciar/atender. Negar microfone, cancelar a permissão, bloquear autoplay e navegar pela interface; verificar limpeza, botão de ouvir e continuidade da chamada durante navegação interna.
7. Medir banda/CPU/RAM e compatibilidade com o outro projeto antes do piloto. Reiniciar apenas nosso serviço em ensaio autorizado; nenhuma chamada deve sobreviver em banco/cofre/backup/logs. Reavaliar capacidade após a medição.

**Ponto importante:** a release `44af35f` foi ativada em 05/10/2026 após revisão operacional autorizada, backup/ensaio de restauração e migrações 026–027. TURN e emissor próprios estão ativos, com preservação do outro projeto. Chrome transmitiu áudio sintético por UDP/TCP/TLS, exclusivamente por relay, sem perda registrada; isolamento, certificado e socket foram conferidos. Isso não comprova qualidade acústica, suspensão, redes distintas/restritas ou entrega real de push em celulares. Ver [resultado do deploy](GIT_E_DEPLOY.md#ativação-de-chamadas-push-e-grupos--05102026) e [emissor](../infra/push/README.md).

## Early authenticated invitation — local follow-up, 18 October 2026

New clients opt in using `X-0xdmme-Call-Invite: 1`. Only opted-in endpoints receive
an `invitation` capability/view field. A new client uses the previous complete-
offer path when an old server omits that capability. An old client never receives
the new encrypted invitation type or extra strict-parser fields. Negotiation is
framing only; every operation still uses the existing signed proof and current
server authority. The separate empty SSE hint contains no invitation payload.

After signed start assigns the server UUID, the caller signs and encrypts an
empty-SDP sequence-zero invitation to the exact frozen target set. The recipient
checks sender/recipient accounts/devices, both directory hashes, pinned identity,
call UUID, type, sequence and signature before presenting it. Full signed relay-
only SDP is still mandatory before media. Accepting an invitation selects exactly
one endpoint and starts the existing twenty-second connecting deadline. The
first full offer can still contain the frozen initial device set; the server
validates that set but delivers only to the selected endpoint. Later negotiation
targets only that winner. Invitations/target sets are transient, fit the existing
one-MiB call admission reservation, and clear on full offer, end/expiry/shutdown.

`server/call-context` composes three existing bounded public reads: owner vault,
personal removals and private peer directory. It owns no SQL or shared transaction.
`client/call-identity` reuses hydrated identity pins only after fresh head/sequence
and personal-removal checks agree with the completely verified local state.
Unknown, conflicting, changed or paged state receives full verification or fails
closed. The peer-identity module can hydrate the verified vault state after its
own confirmed pin save; this does not bypass fresh reads on the next operation.

The transport retains only a session-bound signing callback and public proof
identity for at most twenty seconds counted before the online authority read.
It retains no content/wrapping key closure, refreshes at expiry and clears on
reset or failed requests. Initial peer/signing material may be reused only for
sequence-zero/one setup within the same window and unchanged local state. The
server revalidates exact current authority/directories for each command. A cancel
hint or elapsed authorization during slow verification prevents a stale ring.

**Ponto importante:** local ring/cancel probes and automated contracts do not
establish successful phone audio, restricted-network recovery or capacity.
Physical clean speakerphone/Bluetooth audio and actual changed-release TURN flow
remain required. Capture constraints and audio processing are unchanged.

Once the first negotiated foreground snapshot succeeds, the call client starts
one bounded session preparation of already stored identity pins, shared with an
overlapping call. It opens no microphone and requests no peer directory. This
moves existing-pin hydration out of the first click after a page reload; each
call still performs fresh vault/removal/peer checks. Failure is reported in the
call notice and the normal call path can retry verification. A never-seen peer
still requires verified pin persistence before the initial invitation is sent.
