# 0xDMme — prova nativa de retorno Phantom/Solana

Estado: prova isolada em desenvolvimento local, autorizada em 01/10/2026. Não integra a sessão de conta do 0xDMme. A assinatura pelo provider dentro da Phantom continua disponível no fluxo existente; o retorno EVM permanece sem solução física comprovada.

## Protocolo e limites

`/phantom-probe.html` abre o método nativo `connect` e recebe callback HTTPS cifrado. Após verificar conexão e sessão assinada, oferece uma mensagem de teste pelo método `signMessage`. A assinatura é verificada contra o endereço e a mensagem exatos. Não envia transações, cria conta, libera histórico ou usa relay/SDK comercial. A [documentação da Phantom](https://docs.phantom.com/phantom-deeplinks/deeplinks-ios-and-android) limita esses métodos a Solana; não extrapolar para EVM.

O canal usa NaCl `crypto_box` da biblioteca `libsodium-wrappers@0.8.4`, com `libsodium@0.8.4` resolvido no lockfile. Primitivas criptográficas não são implementadas no projeto. O par temporário, a identidade pública e a sessão nativa ficam em um único registro local do cliente para permitir callback em outra aba da mesma origem. A validade lógica é de cinco minutos, sem renovação entre etapas. Conclusão, cancelamento, falha ou retomada após expiração removem o registro. Se o navegador estiver fechado/suspenso, a remoção física aguarda sua próxima execução; não prometer exclusão física exata em cinco minutos. Cópias de bytes privados/decriptados são zeradas quando possível; strings e cópias gerenciadas pelo navegador não oferecem garantia de apagamento de memória.

Antes de inicializar a biblioteca ou ler o armazenamento, a página limpa a query visível. Callbacks têm estado/etapa correspondentes, campos únicos, tamanho limitado e autenticação do ciphertext; pacotes adulterados, antigos ou de outra prova falham. Esses controles demonstram interoperabilidade do canal, não identidade certificada do aplicativo remetente nem autenticação de conta do 0xDMme. O callback passa pela infraestrutura HTTPS e pode permanecer no histórico da wallet; `no-store`, `no-referrer` e ausência de logs próprios não apagam históricos externos.

A página e seu script não entram no cache offline da PWA. O servidor admite somente navegação pública GET de documento, com query limitada. APIs e mutações não ganham permissões cross-site. Armazenamento indisponível impede iniciar a prova; falhas não geram sucesso aparente nem exibem ticket, endereço, assinatura, stack ou URL privada.

## Exceção CSP aprovada

O navegador local reproduziu bloqueio de `WebAssembly.instantiate` com a política `script-src 'self'`. Em 01/10/2026, o proprietário aprovou `'wasm-unsafe-eval'` somente na resposta admitida do documento `/phantom-probe.html`, com ou sem query válida para a rota. A exceção permite compilar WebAssembly, preservando o bloqueio de `eval` JavaScript, scripts inline e fontes externas. Interface normal, aprovação EVM, APIs e erros mantêm a política anterior. Nenhuma alteração de Nginx ou infraestrutura compartilhada é necessária para esse ajuste de código.

## Retorno EVM investigado

No aparelho, o clique real chegou aos links sem cancelamento pela página. A Phantom rejeitou `googlechrome://navigate` com “Not allowed to load local resource”; o intent alternativo não abriu Chrome, inclusive após teste em nova janela. O motivo interno da rejeição do intent não foi estabelecido. O método `browse` não documenta API para obrigar abertura de browser externo ou fechamento de sua aba. Não publicar outra tentativa especulativa como correção concluída nem substituir o fluxo EVM sem decisão do proprietário.

O callback nativo Solana pede retorno HTTPS ao navegador, mas não garante browser original, aba original, PWA ou fechamento de abas antigas da wallet. A prova evita abrir uma nova aba do site dentro da wallet; validar o comportamento real no Android antes de integrar ao login. A autorização dessa prova não inclui aplicativo nativo para lojas.

## Verificação local em 01/10/2026

Passaram lint, tipos, fronteiras, verificação de licenças npm, formatação e build. Os 17 testes dirigidos passaram: quatro do protocolo NaCl/assinatura, quatro de ciclo da página, cinco da base HTTP/fontes/cache e quatro do Worker. Cobrem expiração sem renovação, cancelamento e callback tardio, armazenamento bloqueado, adulteração do canal, origem/etapa, assinatura de outra chave, CSP restrita ao documento e exclusão da prova do cache. A revisão de responsabilidades separou entrega de assets da adaptação HTTP, sem ampliar limites ou suprimir lint.

O navegador do Codex, sob os headers reais do host local, aceitou callbacks cifrados de conexão e assinatura sintéticas, limpou a query e mostrou a conclusão sem criar conta. A captura fica somente em `.local/`. A fixture foi encerrada. Isso comprova inicialização e processamento da página; não demonstra abertura da Phantom real, retorno entre apps, aba original ou fechamento no Android/iPhone. A matriz manual criptográfica do bloco 01 não foi repetida. Nenhum deploy ou acesso à VPS ocorreu nesta validação.

## Dependências, distribuição e publicação

Complemento da revisão de fontes: passaram os checks após a mudança de empacotamento, o teste de recusa de fonte/hash/versão alterados e os nove casos HTTP/Worker afetados. A reconstrução a partir do arquivo principal, complemento preferencial e compilador esbuild declarado produziu JS principal e da prova idênticos byte a byte. Também foi incluído `src/shared/wallet-approval`, antes ausente do arquivo principal apesar de ser importado pelo frontend. Treze assets; arquivo principal de fontes com cerca de 650 KiB e complemento com cerca de 1,61 MiB, ambos no orçamento existente. Não houve recompilação C/WASM nem alteração do script da interface normal por essa mudança de entrega. A comparação do lockfile confirmou dependências de execução inalteradas; apenas os dois pacotes de desenvolvimento NaCl foram adicionados.

Os dois pacotes entregam licença ISC e seus avisos foram inspecionados. Não acrescentam tarifas, Project ID, relay ou serviço pago. O npm reportou zero vulnerabilidades na instalação; isso não constitui auditoria criptográfica. A biblioteca é incorporada somente no script da prova, sem aumentar o script da interface normal.

As fontes preferenciais C/geradores, scripts e avisos foram reunidos em `vendor/libsodium-0.8.4/preferred-source.tar.xz`, com [proveniência e instruções](../vendor/libsodium-0.8.4/README.md). Os dois arquivos ESM npm coincidem byte a byte com o commit oficial declarado no pacote. O build confere versões e SHA-256 e entrega o arquivo preferencial separadamente na mesma origem, sem autenticação e fora do cache da PWA. Cada asset continua abaixo de 2 MiB; não foi ampliado o orçamento. O arquivo principal inclui pacotes npm, código autoral, scripts e o README com caminho/URL do complemento. A recompilação C/WASM não foi executada; não prometer regeneração bit a bit sem conhecer as versões de toolchain usadas pelo fornecedor.

A alteração do lockfile também é recusada pelo contrato de dependências do comando reutilizável de deploy. Não alterar/burlar esse contrato nem publicar antes da revisão específica prevista em [Git e deploy](GIT_E_DEPLOY.md). A autorização da exceção CSP cobre implementação e validação local, não a ativação na VPS. Dados operacionais, capturas e fixtures ficam exclusivamente em `.local/`.
