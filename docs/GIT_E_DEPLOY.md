# 0xDMme — Git e envio à VPS

## Conversa visível e exclusão prioritária — 08/10/2026

Continuação do fix de chat que o proprietário pediu corrigir, enviar e ativar.
Fontes `2607192`, com predecessor ativo `0c5b629`: conservar a visão verificada
durante atualizações normais, fechar ao receber exclusão/autorização e impedir
que o controle entre abas cancele a própria exclusão por aviso duplicado.
O [contrato atual](BLOCO_10A_AUDIO_E_TEMPO_REAL.md#conversa-visível-e-aviso-prioritário-de-exclusão--08102026)
preserva confirmação de snapshot e falha fechada.

O executor existente fixa a árvore inteira de banco desses dois commits;
somente `backups.ts`, `changes.ts`, `contacts.ts` e `messages.ts` diferem, com
marcador transitório publicado após COMMIT. SQL, migrações, executor de migrações,
dependências, Node e infraestrutura permanecem idênticos. Essa revisão permite
a troca de código, sem caminho de migração. Exigir checkout limpo/enviado,
CI integral do commit final, preservação, limites e rollback; reiniciar somente
`0xdmme-test.service` por `npm run deploy:staging`. Evidências em `.local/`.

## Continuidade do login mobile — ativação autorizada em 07/10/2026

O reteste físico posterior à release `91a82e8` mostrou perda do pedido e falhas
de abertura no iPhone. A correção de continuidade conserva o pedido público no
IndexedDB, preserva pedidos novos diante de ACK recusado/tardio, usa doc-3 também
para Backpack Android e handlers nativos MetaMask/Phantom no iPhone. Mantém
autenticação, criptografia, banco, dependências e infraestrutura. A autorização
de concluir o fix e ativar na VPS continua aplicável; reutilizar o mesmo comando,
CI exata, preservação e rollback. Publicação e teste físico permanecem distintos.

A validação da continuidade passou nas regressões de retorno com metadados de
aba ausentes, ACK 409 de sessão antiga, substituição concorrente de pedido,
cancelamento com falha de armazenamento e confirmação visível com sessão já
existente. Os contratos sintéticos EVM/Solana das três wallets passaram, assim
como a integração de conta, os 105 testes do executor e as verificações locais.
Na CI de `df905fb`, o check e duas integrações passaram; a terceira excedeu o
prazo instalando FFmpeg no runner, antes dos testes. A API recusou repetir esse
job com o acesso existente. Registrar esta entrega dispara nova CI integral;
a ativação continua exigindo sucesso do commit exato, sem exceção ao gate.

A CI de entrega `8ce8c8f` passou no check e nas integrações 1/3, mas a instalação
da integração 2 voltou a exceder o prazo. O log confirmou downloads de pacotes
presos no mirror Azure, depois de atualizar o índice. Somente o runner passa a
preferir os dois fallbacks oficiais Ubuntu já presentes na
[configuração da imagem](https://github.com/actions/runner-images/blob/main/images/ubuntu/scripts/build/configure-apt-sources.sh),
com uma repetição, timeout de conexão/dados de 15 segundos e limite de três
minutos para instalar o mesmo FFmpeg. A validação APT e a suíte integral
permanecem; não há instalação nem troca de runtime na VPS.

**Resultado da continuidade:** release `543a34e` ativa pelo executor oficial,
após [CI integral do commit exato aprovada](https://github.com/karma352431231-ship-it/0xDMme/actions/runs/37695596097).
O pacote de 8.443.831 bytes foi preparado no Mac. O executor confirmou build
público, preservação e rollback retido, sem reiniciar serviços compartilhados.
A conferência HTTPS independente confirmou prontidão e hashes do HTML normal,
HTML de atualização, JavaScript e Worker. A comparação antes/depois confirmou
43 migrações, 77 tabelas e cinco objetos preservados, com snapshots de banco,
configurações, PostgreSQL e processos/invocações da galeria idênticos. Não houve
migração, instalação ou mudança de infraestrutura. O aceite físico mobile
permanece pendente; evidências operacionais ficam exclusivamente em `.local/`.

O proprietário autorizou aplicar a correção, enviar e ativar na VPS, incluindo
continuidade após compactações até concluir. Login público e prova privada de
abertura são recolhidos na mesma visita à wallet; o navegador original confirma
o endereço e autoriza suas chaves sem segunda navegação automática. O contrato
criptográfico e seus limites estão no [bloco 04](BLOCO_04_DISPOSITIVOS_E_RECUPERACAO.md#continuidade-do-login-mobile--correção-solicitada-em-07102026).

Reutilizar `npm run deploy:staging`, build no Mac, checkout limpo/enviado e CI
integral do commit exato. A única alteração em `src/server/database` é código
de `authentication.ts`: preparar UUID sem gravar conta, reutilizar a identidade
existente e exigir o mesmo identificador na transação original de confirmação.
O lock por wallet e a recusa de concorrência conflitante permanecem. SQL,
executor de migrações, dependências, Node e infraestrutura permanecem iguais.
Fixar ambos os lados dessa revisão no executor existente; a revisão não permite
outra mudança de banco nem executa a transição histórica 027→043.

A revisão fixa a árvore inteira de banco de `f8ac068` para `6f8f2ab`,
aceitando somente a alteração exata em `authentication.ts`. Todos os demais
arquivos precisam coincidir com esses commits, incluindo SQL e executor.

Conferir preservação e saúde antes/depois, manter recursos e retorno limitado à
release própria, reiniciar somente `0xdmme-test.service`. Preservar a galeria e
seu timer sem reinício. As alterações anteriores do proprietário em AGENTS.md
e no roteiro manual ficam fora do commit; acesso e provas ficam em `.local/`.

**Resultado da primeira publicação:** release `91a82e8` ativa pelo executor oficial, com
[CI integral aprovada](https://github.com/karma352431231-ship-it/0xDMme/actions/runs/37611372387).
Fontes da correção em `6f8f2ab`; revisão restrita da publicação em `91a82e8`.
Build de 8.442.439 bytes preparado no Mac. O executor confirmou build público,
preservação, release anterior retida e nenhum serviço compartilhado reiniciado.
A auditoria independente confirmou 43 migrações, 77 tabelas e snapshots de
banco/objetos idênticos, configurações e processo do PostgreSQL preservados.
Galeria e timer conservaram seus processos e invocações. HTTPS confirmou
prontidão e hashes exatos do HTML normal/atualização, JavaScript e Worker.

Lint, tipos, limites de dependências, licenças, formato e builds passaram;
regressões de assinatura/retomada e integração PostgreSQL/HTTP passaram.
Os 105 testes do executor passaram; a CI executou a suíte completa e as três
partes da integração. A primeira preparação parou antes de ativar porque o
checkout isolado selecionava Python 3.9 do macOS; repetir com Python 3.14 já
instalado e Node 24.14 aprovado resolveu, sem instalar runtime ou mudar a VPS.
Acesso, baselines, artefatos, recibos e comparação ficam em `.local/`.

**Ponto importante:** a correção está publicada. Os testes com contas/providers
sintéticos não certificam o retorno entre apps físicos. Sessões antigas ainda
sem chaves oferecem **Concluir entrada na conta** no fluxo combinado. A entrada
`/?atualizar=1` entrega o código atual sem apagar o armazenamento local.

## Revisão visual de comunidades — solicitada em 07/10/2026

A atualização da UI reutiliza `npm run deploy:staging`, com build no Mac,
checkout limpo/enviado, CI integral do commit exato, preservação e retorno
da release própria. Dependências, Node, SQL, executor de migrações e serviços
compartilhados permanecem iguais. A galeria de calibração é independente;
conferir os processos e IDs/hashes dos casos antes/depois sem reiniciá-la.

O executor anterior tratava toda alteração em `src/server/database` como
transição de schema. A revisão estreita de código permite somente a árvore
exata de banco de `194bbd2` para `18523ca`: apenas `communities.ts` e
`community-discovery.ts` mudam, para projetar fotos públicas aprovadas em lote.
Os hashes de todos os demais arquivos, incluindo SQL e executor, precisam
coincidir com ambos os commits fixados. Qualquer outro conjunto ou fonte
continua sujeito à revisão de migração existente; esta exceção não autoriza
novos schemas nem dependências. A ativação usa a troca comum de código com
retorno, sem executar a transição histórica 027→043.

**Ponto importante:** fotos e mídia ainda pendentes não são liberadas pela UI.
O detector aceito e a calibração mantêm o estado já documentado.

**Resultado:** release `f8ac068` ativa pelo executor oficial, com
[CI integral aprovada](https://github.com/karma352431231-ship-it/0xDMme/actions/runs/37596095715).
A UI está em `18523ca`; o segundo commit fixa a revisão restrita da publicação.
Os 102 testes locais do executor passaram. O recibo confirmou build público,
preservação, release anterior retida e nenhum serviço compartilhado reiniciado.
A conferência HTTPS em navegador isolado confirmou os hashes do CSS/JavaScript
do manifesto e a UI em 1280/390 px, sem erros de página ou rolagem horizontal.
Galeria e timer conservaram processos e invocações; os 17 casos conservaram
IDs, hashes de imagem e referências. Acesso, screenshots e recibos ficam
exclusivamente em `.local/`.

## Ativação dos fluxos de comunidades — solicitada em 07/10/2026

Depois de informado de que os novos commits ainda não estavam ativos e de que
a atualização exigia revisão/aprovação das migrações, o proprietário pediu
explicitamente ativar os demais fluxos enquanto a calibração continua.
Reutilizar `npm run deploy:staging`, com revisão exata do predecessor `44af35f`
e das fontes de aplicação de `04b1bbf`. Dependências npm, Node, Nginx e
serviços compartilhados permanecem iguais; o runtime e o socket públicos
tiveram autorização adicional específica descrita ao final deste documento.

A conferência somente leitura confirmou schema 001–027, 50 tabelas de dados
preexistentes, mais o registro de migrações, preservação e saúde. Nenhuma tabela
de identidade/comunidades/DMs públicas existe no predecessor. A transição
027→043 acrescenta 26 tabelas inicialmente vazias; as migrações posteriores
alteram essas tabelas novas e ampliam somente a constraint de tipos de remoção
pessoal. Não há uploads públicos legados para coletar. Conservar checksums
001–027, comparar integralmente as 50 tabelas anteriores e os objetos, exigir
001–043, conjunto exato de tabelas, novas tabelas vazias e contabilidade integral
antes de reabrir o escritor. A leitura limitada do registro passa a 64 versões
para conferir todas as 43, sem aceitar uma comparação truncada.

Usar backup privado de banco/objetos, até 64 MiB cada, ensaio de restauração
transacional revertido e release anterior retida. Antes da abertura, falha
admite retorno verificado; depois da abertura, preservar novas gravações e
parar somente o app em caso de falha, sem restaurar banco antigo sobre elas.
Manter recursos e prazo de 240 segundos do executor, build no Mac, checkout
limpo/enviado e CI integral do commit exato. A galeria de calibração tem processo
independente: conferir seu estado antes/depois sem reiniciá-la ou apagar casos.
Acesso, fingerprints, inventário e evidências ficam exclusivamente em `.local/`.

A conferência real após preparar o artefato revelou `Query read timeout` com o
prazo de cinco segundos do cliente; a leitura isolada passava. O snapshot passa
a usar cancelamento de consulta no banco em 12 segundos e prazo do cliente em
15 segundos, com margem para receber o cancelamento. A execução completa dessa
leitura permanece limitada a 30 segundos e o executor a 240; CPU, memória,
limites de linhas/bytes, schema, hashes, contabilidade e requisitos de backup e
retorno permanecem os mesmos. A reprodução usa preparação real e transação
somente leitura, sem ativação ou migração.

**Ponto importante:** esta ativação permite testar identidade pública,
comunidades, posts/replies em texto, votos, feeds, gestão e DMs E2EE pelo `@`.
Não aceita o detector experimental: inventário aceito vazio e `runner: null`
permanecem. O processador isolado foi autorizado para habilitar envio/preparação;
avatares/fotos e mídia pública continuam aguardando análise aceita. Sua instalação
é uma etapa operacional própria, sem relaxar a política de conteúdo.

**Resultado:** release `194bbd2` publicada pelo mesmo comando, com
[CI integral do commit exato aprovada](https://github.com/karma352431231-ship-it/0xDMme/actions/runs/37584837010).
Build preparado no Mac; somente o web próprio foi parado/reaberto na transição.
O recibo confirmou publicação, migrações, build público, preservação e backup
privado retido. A auditoria independente confirmou 43 migrações e 77 tabelas,
checksums 001–027 e as 50 tabelas anteriores idênticos, objeto existente e
processo do banco preservados. Serviços/configurações compartilhados não
mudaram. Galeria e timer mantêm seus processos; os 17 casos conservaram IDs e
hashes de imagem. O detector aceito continua ausente.

O worker próprio passou no handshake, execução dos binários e conferência do
namespace/limites efetivos; a proteção de execução do volume permanece. O
ensaio real aprovou uma foto, quatro vídeos de 60 s/1080p/60 FPS e três GIFs de
20 s/20 FPS, com hashes, miniaturas e contrato do resultado conferidos. Todos
os arquivos sintéticos desse ensaio foram removidos, incluindo dois arquivos
identificados da tentativa anterior. O executor passou em 73 testes locais;
a reprodução pós-preparação validou a correção dos prazos. Recibos, backups,
fontes das tentativas interrompidas e provas operacionais ficam em `.local/`
ou na área privada própria, sem apagar dados de usuários.

## Preparação do corte 10 — solicitada em 06/10/2026

O proprietário solicitou consolidar os commits, enviar ao Git e ativar o site
para testar artes permitidas/proibidas pelo navegador. A base local do corte 10
tem fila, retenção, contestação, ferramenta restrita, executor de todos os frames
e leitura pública implementados. A verificação consolidada passou com 334 testes
da aplicação e 91 do executor; integração de mídia passou com 11 testes. Fontes
podem ser consolidadas e enviadas conservando a identidade Karma e as alterações
anteriores do proprietário fora do commit.

A análise automática real permanece desativada: `runner: null` e inventário de
modelos aceitos vazio. As decisões usadas nos testes são sintéticas. Publicar
essa base permite testar envio/fila/avisos, mas não comparar classificação de
artes com a política. O [estado e aceite do detector](MODERACAO_AUTOMATICA_COMUNIDADES.md)
continuam pendentes; envio de fontes não os resolve.

Na preparação inicial, o executor recusava a transição para as 43 migrações
locais sem revisão fixada própria. A revisão solicitada posteriormente está na
seção de ativação acima; não liberar sua verificação nem contornar `npm run deploy:staging`.
Migrações de moderação também agendam coleta de uploads legados ainda não
aprovados, sem data/hashes verificáveis. A ativação exige conferir predecessor,
efeitos sobre dados, backup/retorno, runtime e preservação antes de obter aprovação
da transição concreta. Nenhuma migração, instalação ou reinício está implícito
na sincronização das fontes; acesso e provas operacionais ficam em `.local/`.

**Ponto importante:** o corte 10 permanece em andamento. Código enviado ao Git
não significa detector ativo nem nova release ativada na VPS.

## Ativação da correção mobile — autorizada em 05/10/2026

Após a entrega local, o proprietário pediu explicitamente ativar `793bf21` na
VPS. Executado `npm run deploy:staging` na cópia limpa e enviada, com
[CI integral do commit exato aprovada](https://github.com/karma352431231-ship-it/0xDMme/actions/runs/37287239483).
Build preparado no Mac; somente `0xdmme-test.service` reiniciado. Banco,
migrações, dependências, Node, Nginx e infraestrutura permanecem iguais.
As alterações anteriores do proprietário foram preservadas fora do commit.

**Resultado:** release `793bf21` publicada sobre `e0cb062`. Manifesto ativo,
38 assets públicos, preservação e retenção da release anterior verificados.
A conferência independente confirmou 25 migrações, 48 tabelas, checksums,
contabilidade e saúde consistentes; configurações próprias, processo do banco
e backups históricos preservados. Nenhum serviço compartilhado foi reiniciado.
HTTPS confirmou prontidão e hashes exatos do HTML normal, entrada de atualização,
JavaScript e Worker. Pacote de 8.293.054 bytes, dentro de 16 MiB. Acesso,
baselines e evidências operacionais permanecem exclusivamente em `.local/`.

**Ponto importante:** a correção está publicada no ambiente de testes; o
reteste físico MetaMask/Chrome continua pendente. Preserva as chaves locais e
protege operações válidas. Navegadores precisam receber o novo código e ativar
explicitamente o Worker; um Worker antigo pode exigir a entrada fixa
`/?atualizar=1`, sem apagar o armazenamento.

## Ativação de filtros e menus por contato — autorizada em 05/10/2026

Após a entrega local, o proprietário pediu explicitamente ativar `e0cb062` na
VPS. Reutilizar `npm run deploy:staging` na cópia limpa e enviada, com
[CI integral do commit exato aprovada](https://github.com/karma352431231-ship-it/0xDMme/actions/runs/37279726940).
Preparar o build no Mac, conferir preservação e assets públicos, reiniciar
somente `0xdmme-test.service` e reter a release anterior para retorno.
Banco, migrações, dependências, Node, Nginx e infraestrutura não mudam.
As alterações anteriores do proprietário permanecem fora dos commits.
Acesso, baselines e evidências operacionais ficam exclusivamente em `.local/`.

**Ponto importante:** esta autorização publica os filtros, menus e agenda
simplificada no ambiente de testes. Remover contato preserva mensagens e
consentimento; o aceite do toque prolongado em aparelhos físicos permanece
pendente.

**Resultado:** release `e0cb062` publicada pelo executor existente, com CI
exata aprovada. Manifesto ativo, 38 assets públicos e HTML público dos filtros
conferidos; HTTPS confirmou prontidão. A verificação independente confirmou
25 migrações, 48 tabelas, checksums e contabilidade consistentes, configurações
e serviço de banco preservados, backups e release anterior retidos.
Nenhum serviço compartilhado foi reiniciado. Pacote de 8.344.195 bytes,
dentro de 16 MiB. Acesso e evidências permanecem exclusivamente em `.local/`.

## Ativação da interface de chat responsiva — autorizada em 05/10/2026

Após a entrega local, o proprietário pediu ativar a interface de `685b9d1`.
Usar `npm run deploy:staging` numa cópia limpa e enviada, com
[CI integral do commit exato aprovada](https://github.com/karma352431231-ship-it/0xDMme/actions/runs/37269326144).
Build no Mac; banco, dependências, Node, Nginx e infraestrutura permanecem
inalterados. Conferir manifesto, assets públicos e preservação antes/depois,
reiniciando somente o serviço web próprio e retendo a release anterior.
As alterações anteriores do proprietário permanecem fora do commit; acesso e
evidências operacionais ficam exclusivamente em `.local/`.

**Ponto importante:** esta autorização cobre a publicação do novo visual no
ambiente de testes. Não substitui o aceite da interface em aparelhos físicos.

**Resultado:** release `685b9d1` publicada pelo executor existente. Manifesto
ativo e 38 assets públicos verificados; HTTPS público confirmou prontidão e
HTML do commit exato. Banco permaneceu com 25 migrações e 48 tabelas, checksums
e contabilidade consistentes. Configurações, processos e respostas passaram
nas comparações de preservação; nenhum serviço compartilhado foi reiniciado.
Release anterior e backups históricos ficaram retidos e conferidos. Pacote de
8.333.792 bytes, dentro de 16 MiB. Acesso e evidências permanecem em `.local/`.
O resultado detalhado consta em [interface de chat responsiva](INTERFACE_CHAT_RESPONSIVA.md).

## Preparação do bloco 12A — 05/10/2026

O proprietário pediu enviar o corte local de organizações/representantes à VPS.
As fontes de aplicação revisadas estão em `c70eeed`; a auditoria somente leitura
confirmou o predecessor ativo `2772aba`, 24 migrações e 45 tabelas existentes,
saúde própria e preservação. Acesso, digests e recibos permanecem em `.local/`.
As alterações anteriores do proprietário em AGENTS.md e no roteiro de
simplificação ficam fora dos commits e são preservadas no checkout original.

Proposta pronta no executor existente `npm run deploy:staging`: transição exata
024→025, fontes de aplicação idênticas às revisadas, lockfile/Node/runtime
inalterados e somente três tabelas novas (`organizations`,
`representative_credentials`, `organization_domains`), índices/constraints e
contabilidade. Não alterar 001–024 nem projetar/excluir campos dos digests das
45 tabelas anteriores. Conferir 001–025, tabelas novas vazias e soma integral de
bytes antes de abrir. O fluxo continua sujeito à CI integral do commit exato,
árvore limpa, limites e comparações de preservação.

Reutilizar backup privado de banco/objetos de até 64 MiB cada e ensaio de
restauração em transação revertida, parando somente o escritor próprio. Antes
da abertura, falha permite retorno verificado; após abrir, preservar novas
gravações e parar somente o app, sem restaurar automaticamente dados antigos.
Não alterar dependências, runtime, Nginx, rede ou serviços compartilhados.
Conservar teto de 240 segundos, recursos, backup e release anterior.

Os 86 testes locais do executor passaram, incluindo recusa de fontes,
predecessor ou migrações divergentes, preservação/contabilidade, retenção de
backup e falhas antes/depois da abertura. Nenhuma ativação real foi executada
por esses testes.

Após o envio das fontes `0891b4b`, sua CI integral e o pré-flight aprovados, o
proprietário autorizou explicitamente aplicar a migração 025 e ativar o corte
em 05/10/2026. Registrar a aprovação antes de executar `npm run deploy:staging`
em checkout limpo, com CI do commit exato e a revisão restrita acima. Essa
aprovação não amplia a transição para outras migrações ou infraestrutura.

**Ponto importante:** envio de fontes não ativa a release. A transição 024→025
está autorizada somente no ambiente de testes, com backup, preservação e retorno
verificados. Retorno móvel das novas assinaturas e aceitação física/DNS real
continuam pendentes.

**Resultado:** release `ed82a54` publicada em 05/10/2026 pelo executor existente,
com [CI integral do commit exato aprovada](https://github.com/karma352431231-ship-it/0xDMme/actions/runs/37262394128).
Migração 025 aplicada com checksums 001–025, preservação das 45 tabelas anteriores,
três tabelas novas inicialmente vazias e contabilidade verificados antes da
abertura. Backup privado, ensaio de restauração e release anterior ficaram
retidos. A conferência posterior confirmou manifesto ativo, 25 migrações,
48 tabelas, contabilidade consistente, 38 assets públicos e saúde HTTPS pronta.
Pacote de 8.323.314 bytes, dentro de 16 MiB. Configurações, processos e respostas
passaram nas comparações de preservação; nenhum serviço compartilhado foi
reiniciado. Elegibilidade sintética de grupos permanece desligada. Acesso,
backups e evidências operacionais ficam exclusivamente em `.local/` e na área
privada própria da VPS. A publicação não substitui os testes físicos pendentes.

## Transição do bloco 11 — autorizada em 04/10/2026

Após a entrega local e a CI de `aab78ef`, o proprietário pediu enviar e ativar
as mudanças na VPS. Reutilizar `npm run deploy:staging`, com revisão restrita ao
predecessor ativo `f7b48bb`, às fontes de aplicação de `aab78ef`, às migrações
001–019 intactas e às novas 020–024. Não alterar runtime, dependências, Node,
Nginx, rede ou serviços compartilhados. A consulta inicial confirmou o
predecessor, as 19 migrações e a preservação; evidências permanecem em `.local/`.

As novas migrações acrescentam 16 tabelas de grupos/status, índices, constraints
e contabilidade. Alterações de colunas alcançam somente as tabelas novas. Não
alteram mensagens, contas, sessões, confirmações de wallet ou chaves existentes.
Conferir checksums 001–024, digests integrais das 29 tabelas preexistentes,
tabelas novas vazias e contabilidade de bytes efetivos antes de reabrir.

Com somente o writer próprio parado, reutilizar backup privado de banco e
objetos, cada um limitado a 64 MiB, parsing integral e ensaio de restauração em
transação revertida. Preservar o contrato de retorno: antes de abrir, verificar
restauração do schema/release próprios; após abrir, conservar novas gravações e
parar somente o app em caso de falha, sem restaurar automaticamente dados antigos.
Conservar recursos, orçamento de disco/transferência, backups e release anterior.
O executor continua limitado a 240 segundos e reinicia somente o serviço próprio.

As alterações locais de AGENTS.md e do roteiro de simplificação são anteriores
a esta publicação e ficam preservadas fora do commit. Executar o comando numa
cópia limpa do commit enviado e aprovado pela CI, com acesso/baseline/artifacts
privados em `.local/`; não liberar a verificação de árvore limpa no executor.

A primeira CI de publicação passou em `npm run check`, mas excedeu os dez minutos
durante a integração completa. A CI executa os checks primeiro e distribui o
mesmo glob de testes de integração em três shards nativos do Node, cada um com
PostgreSQL próprio, execução serial interna e dez minutos de limite. Todos os
shards precisam passar; a ativação continua exigindo sucesso integral do
workflow do commit exato. Cada job gera seu próprio build para o teste que inicia
o servidor completo, pois os arquivos do job de checks não são compartilhados.
Não excluir testes nem elevar limites do executor.
O repositório é público e conserva runners Ubuntu padrão, cujo uso é gratuito
conforme a [documentação do GitHub](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

**Ponto importante:** a autorização permite a transição de banco do Bloco 11
no ambiente de testes. O token ainda não existe; criação e aceite de propriedade
públicos continuam indisponíveis, sem ativar elegibilidade sintética na VPS.
Ensaios físicos e aceite para conversas reais continuam pendentes.

**Resultado:** release `2772aba` enviada e ativada em 04/10/2026 pelo comando
existente, após [CI integral do commit exato aprovada](https://github.com/karma352431231-ship-it/0xDMme/actions/runs/37248117062).
Migrações 020–024 aplicadas com checksums 001–024, preservação integral das
29 tabelas anteriores, estado inicial das 16 novas tabelas e contabilidade
verificados. Backup privado e ensaio de restauração passaram antes da abertura;
backup e release anterior ficaram retidos. A conferência posterior confirmou
manifesto ativo, 45 tabelas, 38 assets públicos e saúde HTTPS pronta. Pacote de
8.304.411 bytes, dentro de 16 MiB. Os 81 testes do executor passaram.

A primeira tentativa parou na preparação local porque a cópia limpa selecionou
Python 3.9; a execução com Node 24 e Python 3.14 já instalados no Mac concluiu.
Nenhuma instalação ou alteração de runtime foi feita na VPS. Somente o serviço
próprio foi parado/iniciado; configurações, PostgreSQL e serviços compartilhados
permaneceram iguais nas conferências. Acesso, baselines, backups e provas ficam
privados em `.local/` e no armazenamento próprio da VPS. Elegibilidade sintética
permanece desligada; criação e aceite de propriedade públicos aguardam o token.

## Transição da experiência simplificada — autorizada em 04/10/2026

Após informar a migração 019 pendente, o proprietário autorizou concluir a
validação, commitar e atualizar o site. Usar `npm run deploy:staging`, com
exceção no executor existente restrita ao predecessor ativo `9ed5988`, às
fontes revisadas em `3520812`, às migrações 001–018 intactas e à nova
`019-linked-sessions.sql`. Runtime, dependências, Node, Nginx e serviços
compartilhados não mudam. A correção publicada da URL padrão está integrada.

A migração acrescenta a confirmação de wallet por sessão. Sessões anteriores
foram emitidas somente depois de assinatura verificada e permanecem confirmadas;
sessões novas de QR/código começam sem essa capacidade. Com o writer próprio
parado, reutilizar backup privado de banco/objetos de até 64 MiB cada, parsing e
ensaio de restauração em transação revertida. Conferir checksums 001–019 e
digests das 29 tabelas existentes, omitindo somente a coluna nova da comparação
e verificando separadamente que as sessões anteriores ficaram confirmadas.
Conta, perfil, histórico, permissões e contabilidade permanecem preservados.

Antes da reabertura, uma falha admite retorno verificado do schema/release
próprios. Após reabrir, preservar novas gravações e parar somente o app se
falhar, sem restaurar automaticamente dados antigos. Publicar apenas o commit
exato com CI aprovada e verificar saúde, os assets/fontes públicos e as
impressões de configuração, processos e respostas antes/depois. A leitura
autenticada passa a ter orçamento separado de 240 pedidos/minuto, com os
limites existentes de quatro pedidos simultâneos; mutações e desafios mantêm
seus limites. Recursos do serviço/executor, tamanho de release/transferência,
isolamento e ausência de push externo permanecem.

**Ponto importante:** o deploy não executa reset de Cofre nem exclusão de dados.
Backup e release anterior ficam privados para retorno. Testes físicos do novo
fluxo continuam no [roteiro de simplificação](TESTES_MANUAIS_SIMPLIFICACAO.md).

**Resultado:** release `f7b48bb` publicada em 04/10/2026 pelo comando existente,
com [CI do commit exato aprovada](https://github.com/karma352431231-ship-it/0xDMme/actions/runs/37191016205),
migração 019, backup/ensaio de restauração e preservação verificados. Os 38
arquivos públicos passaram na conferência; pacote de 8.325.168 bytes, dentro
de 16 MiB. Nenhum serviço compartilhado foi reiniciado. Backup, release
anterior e evidências operacionais permanecem privados em `.local/` e no
armazenamento próprio da VPS. A rodada duplicada da branch de publicação
encerrou sem aprovação; a ativação exigiu e confirmou a CI integral bem-sucedida
da mesma release na branch de implementação, sem dispensar nenhuma verificação.
Testes físicos de câmera, wallet, salvamento/reabertura e suspensão continuam
pendentes; a interface mobile foi conferida no navegador com dados sintéticos.

Em 01/10/2026, o proprietário autorizou separar os arquivos por escopo em commits,
enviar a branch ao GitHub e usar Git para transferir código à VPS. O remoto
permanece no repositório existente da conta Karma; isso não autoriza trocar a
identidade/autenticação global nem vinculá-la à conta ohsael.

O GitHub confirmou a renomeação do mesmo repositório para **0xDMme**, preservando
seu identificador e proprietário. URL canônica do `origin`:
`https://github.com/karma352431231-ship-it/0xDMme.git`.

## Fluxo aprovado

1. Revisar arquivos, excluir dados privados e executar os checks necessários no
   ambiente de desenvolvimento. Manter `.local/`, segredos, inventários, builds e
   `node_modules` fora do Git.
2. Criar commits por responsabilidade e enviar a branch `codex/` ao `origin`.
   A branch principal não é atualizada automaticamente.
3. Executar `python3 infra/staging/sync-git.py`. O script exige árvore limpa e o
   mesmo commit já enviado ao GitHub. O acesso SSH é lido exclusivamente de
   `.local/VPS_SSH_TARGET`.
4. O Git envia os objetos diretamente por SSH ao repositório bare exclusivo
   `/var/lib/0xdmme/data/git/0xdmme.git`, dentro do armazenamento limitado do
   ambiente. O recebimento usa a slice própria com limites de recursos e hooks
   desativados. Nenhuma credencial do GitHub é copiada para a VPS; não há clone,
   pull, escrita ou instalação nos diretórios do outro projeto.

O repositório remoto precisa ser preparado e revisado separadamente; o comando
de sincronização não cria diretórios ou infraestrutura. Não usar `--force`,
reconfigurar remotos globais ou instalar hooks de deploy automaticamente. A
sincronização confere o hash recebido; falha é reportada, sem ativar código.

### Exceção temporária de fontes do bloco 07 — aprovada em 03/10/2026

O proprietário autorizou ampliar de 16 para 64 MiB o pacote recebido somente
para sincronizar as fontes do bloco 07, mantendo os demais limites. Aplicar
`-c receive.maxInputSize=64m` apenas ao processo Git desse recebimento. A
configuração persistente do repositório continua em `16m`; término ou falha
do processo encerra automaticamente a exceção, sem deixar um teto ampliado.

Preservar CPU de 10% de um núcleo, memória de 128 MiB, 24 tarefas, timeout de
120 segundos, verificação dos objetos e hooks desativados. Conferir espaço,
configurações, serviços, respostas atuais e hash recebido antes/depois. A
diferença HTTP preexistente em relação ao registro histórico fica registrada
privadamente, sem substituir a baseline do deploy. A autorização não amplia
o limite de build/deploy, não ativa uma release nem aplica migrações, e não
autoriza novos envios grandes automaticamente. Evidências e acesso ficam
exclusivamente em `.local/`.

Antes do primeiro envio, `npm run check` passou com lint, tipos, fronteiras,
licenças, formatação, build e 70 testes automatizados. Sintaxe do helper Python,
links locais e ausência do acesso SSH/chaves privadas nos arquivos versionáveis
foram conferidos. O repositório bare próprio foi preparado; as comparações de
configuração, processos persistentes e respostas dos sites anteriores passaram,
sem reinícios. Evidências detalhadas permanecem exclusivamente em `.local/`.

## Ativação de uma versão

### Transição específica dos blocos 04–05, aprovada em 02/10/2026

Após a revisão de `203274b`, o proprietário autorizou a ativação com QR 0.7.2,
migrações 004–009, backup do banco/objetos próprios e pausa temporária somente do
serviço web próprio. Publicar com `npm run deploy:blocks45`; pré-flight com
`python3 infra/staging/deploy_blocks45.py --check`. O deploy comum conserva todos
os bloqueios anteriores. A transição específica exige o predecessor `d64711c`,
fontes de aplicação idênticas às revisadas em `203274b`, lockfile/Node revisados e
o pacote QR exato preparado no Mac. Somente o novo comando é acrescentado ao
contrato de scripts. Não há npm, build ou atualização de Node na VPS.

O commit do executor deve passar em CI e estar nos dois remotos. A release é
montada pelo Git e vinculada ao manifesto do build; configurações, processos e
respostas da baseline são comparados antes/depois. Os limites já aprovados do
executor permanecem. Banco e objetos admitem, cada um, backup de até 64 MiB,
com espaço adicional conferido, parsing integral do dump e hashes dos objetos.
Uma restauração de ensaio executa DDL/dados/constraints em transação e termina em
`ROLLBACK`; os digests originais precisam permanecer iguais antes de migrar.
Acima desses limites, recusar e revisar, sem pular backup ou apagar dados.

Com o escritor próprio parado, guardar backup privado, aplicar as migrações na
transação versionada e conferir checksums, digests de contas/perfis/sessões e a
contagem inicial de bytes usados. A nova release só abre após essas verificações.
Falha anterior à reabertura permite restaurar exclusivamente o schema próprio,
em uma transação, conferir o retorno e iniciar a versão antiga. Depois de iniciar
a versão nova, **não restaurar automaticamente o dump antigo**: podem existir
gravações novas. Nesse caso parar somente o serviço próprio e conservar banco,
objetos, backup e releases para correção/revisão. Timeout/interrupção exige ler o
receipt privado antes de repetir. Backups de dados não entram na limpeza de
workspaces do deploy comum; sua exclusão exige revisão específica.

**Ponto importante:** esta aprovação permite a publicação dos blocos 04–05 para
testes; não autoriza futuras migrações/dependências, mudanças compartilhadas,
retorno com perda de novas gravações ou uso de conversas reais. Teste físico
mobile permanece com o proprietário após a publicação verificada.

**Enviar commits e publicar uma versão são operações distintas.** O comando
acima guarda fontes e histórico na VPS; ele não modifica a release em execução,
não aplica migrações e não reinicia serviços. A versão HTTPS já testada permanece
ativa até um deploy deliberado.

Para o próximo deploy, escolher um commit enviado aos dois remotos, preparar o
build e as dependências de runtime desse commit no ambiente de desenvolvimento e
verificar o pacote antes da transferência. Assets gerados continuam fora do Git,
com fontes/licenças correspondentes incluídas no build público. Exportar as
fontes desse commit com Git; não copiar arquivos soltos da árvore de trabalho.

A ativação deve escrever somente no armazenamento/release próprios, conferir
compatibilidade das migrações, preservar dados e preparar retorno à versão
anterior quando seguro. Reiniciar somente o serviço web próprio se necessário;
configurações compartilhadas não fazem parte do deploy de código. Não executar
build, npm, testes ou bootstrap no outro projeto nem atualizar dependências
globais. Push sozinho não ativa uma release.

Em 01/10/2026, o proprietário autorizou separadamente a ativação da correção
mobile `17d04b6`. O pacote foi exportado desse commit, conferido com o Git
exclusivo da VPS e ativado após verificar backend, migrações e dependências
idênticos à versão anterior. Somente o serviço web próprio foi reiniciado;
saúde HTTPS, JavaScript público e fontes correspondentes foram conferidos.
As comparações de configuração, processos compartilhados, banco próprio e
respostas anteriores passaram. A release anterior ficou guardada para retorno,
dentro do armazenamento limitado próprio. Evidências e operações de acesso
ficam em `.local/`; o aceite físico Android continua pendente. Esse deploy
autorizado não habilita ativação automática para os próximos envios de Git.

## Comando reutilizável aprovado

### Transição específica do bloco 08, aprovada em 03/10/2026

Após revisar a implementação, o proprietário pediu enviar e ativar o bloco 08.
Usar o mesmo `npm run deploy:staging`, com exceção restrita no executor existente:
predecessor ativo `931b09b`, fontes/runtime revisados em `121a4eb`, sequência
001–015 intacta e somente a nova migração 016. O commit que incorpora o executor
precisa passar em CI e ser enviado aos dois repositórios. Não há mudança de
dependências, Node, Nginx ou serviços compartilhados.

Antes de reabrir o escritor, o fluxo reutiliza as ferramentas de backup já
validadas: dump privado de até 64 MiB, cópia/hash de objetos até 64 MiB, espaço
adicional, parsing integral e restauração em transação encerrada por `ROLLBACK`.
Conferir checksums 001–016, digests das 22 tabelas preexistentes, tabela de anexos
inicialmente vazia e contabilidade de uso real. Parar/iniciar somente
`0xdmme-test.service`, conservando as impressões de configuração, processos e
saúde dos demais serviços. A política de retorno dos blocos 04–05 também vale:
antes de reabrir é possível restaurar o schema próprio; depois de reabrir,
preservar novas gravações e parar somente o app para correção, sem restaurar
automaticamente o dump antigo. Backups e release anterior ficam privados.

O bloqueio de outras alterações de banco continua ativo. Atualizações posteriores
sem mudança do banco seguem o caminho comum, com build preparado no Mac e
reutilização por commit. Um artefato incompleto antigo sem receipt/ativação deve
ser investigado antes de liberar uma vaga; conservar sua evidência dentro do
armazenamento próprio e não apagar backups de transições para abrir espaço.

**Ponto importante:** a aprovação destina o bloco 08 ao ambiente de testes na VPS.
Ela não conclui testes físicos mobile nem o aceite final para conversas reais.

**Resultado:** release `8acc99d` publicada com CI aprovada, migração 016,
backup/ensaio de restauração e preservação verificados. Houve falha na primeira
checagem após abrir: o app foi parado e o estado novo conservado. Após revisão,
a mesma release foi reaberta e todos os 36 hashes públicos e saúde passaram;
a falha não se reproduziu e sua causa exata não foi isolada. O receipt só foi
concluído após nova conferência, sem repetir migração ou restaurar o dump.
Backups e release anterior permaneceram privados. Um build gerado antigo,
incompleto e nunca ativado foi conferido por hash e movido para evidência privada
no armazenamento próprio, sem apagar conteúdo ou backups.

Depois desse primeiro deploy, o proprietário aprovou um comando explícito
reutilizável, mantendo o build no Mac/ambiente de desenvolvimento. Publicar:

```sh
npm run deploy:staging
```

Antes de chamar: revisar, commitar e dar push da branch `codex/`; aguardar sucesso
do workflow `check.yml` para esse commit. O comando recusa árvore suja, remoto
diferente, commit não enviado, CI pendente/falha ou executor alterado. Consulta
a CI pública sem copiar credenciais para a VPS. Não instala ferramentas de build,
executa npm ou compila na VPS.

O build é feito uma vez por commit numa exportação do Git com as dependências de desenvolvimento
já instaladas. Repetir `prepare`, `check` ou `staging` para o mesmo commit reutiliza
o pacote depois de validar manifesto, arquivos do Git, hashes dos assets, fontes
Matrix e integridade do arquivo; cache incompleto/corrompido é recusado. Diretórios reais com hardlinks locais preservam a identificação
dos pacotes incorporados pelo esbuild; um link simbólico para `node_modules`
pode omitir esses pacotes do arquivo de fontes. O comando confere fontes dos
terceiros antes de permitir a publicação. O pacote transferido contém somente
`dist/`, exceto as partes das fontes Matrix já versionadas: essas partes são
reconstruídas do blob Git dedicado com hashes individuais e integral. Todas as
fontes ficam na release pública. As fontes de runtime são extraídas do commit no Git bare próprio da VPS,
com manifesto/hash que vincula fontes e build. Dependências de runtime existentes
são reutilizadas somente quando lockfile/contrato permanecem iguais.

Exceção específica aprovada em 01/10/2026 para publicar a prova isolada
Phantom/Solana: permitir a transição entre os lockfiles SHA-256
`4db68588987a5b5a1a3afedd09a6096a2c5ab51c37ac9f334af2cc06b8125092` e
`fac024d2596d80a4450f9ad46cc212e6b51e536f02062f630fd8c8c1adcc0be5`,
inclusive no sentido inverso, desde que suas entradas de execução sejam iguais.
A revisão encontrou somente `libsodium-wrappers` e `libsodium` 0.8.4 novos,
marcados para desenvolvimento; a biblioteca é incorporada no script público da
prova, com licença ISC e fontes correspondentes. Não executar npm na VPS.
Qualquer outro hash diferente continua recusado; Node, módulo de banco,
contrato de runtime, preservação e limites mantêm as verificações anteriores.
A autorização cobre publicar a prova e seu teste físico, sem substituir login
ou considerar o retorno EVM resolvido.

Outros modos:

```sh
npm run deploy:prepare
npm run deploy:check
```

`prepare` gera o pacote local e confere Git/CI, sem acessar a VPS. `check` também
sincroniza as fontes no Git da VPS e executa o pré-flight, sem enviar o build,
trocar release ou reiniciar serviços. A sincronização de fontes continua usando
`sync-git.py`. Repetir `staging` para uma versão que já está ativa e confere com
os hashes não reinicia o serviço.

O acesso vem de `.local/VPS_SSH_TARGET`; a baseline privada revisada vem de
`.local/VPS_DEPLOY_BASELINE.json` (`files`: hashes de configurações existentes;
`services`: propriedades PID/início/estado; `sites`: host/status anterior).
Ambos devem ser arquivos regulares, ignorados pelo Git e com modo `0600`.
Não capturar uma baseline nova para esconder uma diferença encontrada. Builds,
manifestos e logs ficam em `.local/deployment/`, sem inventário no Git.
O cache local admite até 16 commits de build, com arquivo de até 16 MB por commit
e logs de até 64 KB por etapa; exceder esse limite exige revisar os artefatos locais.

Na VPS, o executor usa a slice própria: CPU 10%, memória 192 MB, swap zero,
32 tarefas, I/O idle, sistema de arquivos protegido e escrita somente no
armazenamento próprio já limitado a 2 GB. O arquivo de build tem limite de
16 MB; código, assets e dependências juntos têm orçamento de 128 MB; exigir 256 MB
livres. Há lock contra ativação simultânea. Antes/depois, comparar configurações,
processos e respostas da baseline, além de configurações próprias e processo do
PostgreSQL próprio. Não atualizar Nginx, certificados, firewall ou outros serviços.

Mudanças no módulo de banco (incluindo migrações), contrato de runtime ou Node
são recusadas. Mudanças de lockfile são recusadas, exceto pelo par de hashes
revisados acima; precisam de revisão específica antes de ampliar o fluxo.
O Node já instalado pode estar numa versão superior à `.nvmrc`, desde que atenda
ao intervalo aprovado em `engines.node` sem mudança desse contrato. Não atualizar
o Node do sistema para igualar a versão do ambiente de desenvolvimento.
Não há opção `force` ou migração automática autorizada. Uma falha de ativação
restaura os arquivos anteriores e reinicia somente `0xdmme-test.service`; a
saúde do retorno é conferida. Falha do próprio retorno é reportada como não
verificada, nunca como sucesso.

Uma release anterior é mantida para retorno. Workspaces de código de publicações anteriores saudáveis
podem ser removidos para abrir espaço à próxima tentativa, contendo
apenas código/build/backup de código; banco e objetos ficam fora dessas árvores.
Até três tentativas pendentes/concluídas cabem no orçamento de workspaces;
tentativas interrompidas ou com conteúdo inesperado exigem revisão. Backups
históricos anteriores ao comando não são apagados por ele. Timeout, queda de SSH
ou término abrupto podem deixar resultado indeterminado: consultar receipt/log
privado antes de retomar, sem repetir uma ativação cegamente.

A autorização desse comando cobre deploys explícitos de código revisado dentro
desses limites. Custos, dependências, migrações e infraestrutura continuam sujeitos
às regras do projeto; não há publicação automática a cada push.

Validação local da implementação: lint, tipos, fronteiras, licenças, formatação
e build passaram; os 72 testes JavaScript passaram, com dois casos de listener
reexecutados fora do sandbox após bloqueio `EPERM` de porta local. Passaram
também os 17 testes de deploy em diretórios temporários, sem SSH/reinício real:
CI exata, arquivos maliciosos, limites, migrações/dependências, retorno após falha,
recusa de retorno não verificado, retenção, versão já ativa e fontes de terceiros
no build real exportado do Git. O workflow repete esses controles em CI.

O fluxo foi executado com sucesso em 01/10/2026 para o commit `9f15d57`, com
CI aprovada. Fontes de runtime foram extraídas do Git próprio da VPS; o build
local e todas as fontes/licenças públicas conferiram pelo manifesto. Somente
o serviço web próprio foi reiniciado, a versão anterior foi mantida e as
verificações de preservação passaram. O Node instalado permaneceu dentro do
intervalo já aprovado, sem atualização de sistema. Isso valida a publicação
pelo comando; o aceite físico mobile da autenticação continua pendente.

**Ponto importante:** o envio ao GitHub/VPS não libera a V1, não substitui aceite
mobile e não torna seguro usar conversas reais. O risco residual de hardware e
rede compartilhados continua conforme a [decisão de isolamento](DOMINIO_E_AMBIENTE_TESTE.md).

## Transição autorizada dos blocos 06–07 em 03/10/2026

O proprietário pediu explicitamente publicação/ativação e aprovou aumentar somente `client_max_body_size` do site próprio de 5 MiB para 8 MiB. O limite de foto no app permanece 3.000.000 bytes; a cifra e seu transporte são maiores. Não há alteração de Node, dependências, serviços/bancos do outro projeto ou limites persistentes de Git. O reload do Nginx é gracioso, precedido por validação e seguido por comparação dos fingerprints/processos e respostas existentes.

Comando específico: `python3 infra/staging/deploy_blocks67.py --activate`, executado no Mac em checkout limpo do commit exato com CI aprovada. `--check` prepara/sincroniza/verifica sem ativação. O executor aceita somente a aplicação revisada em `8e74bb1` sobre o predecessor `32663bb`, com migrações 010–015; o comando comum continua recusando mudanças de banco e artefatos maiores que 16 MiB.

O Mac prepara o build completo e seu manifesto. O pacote transferido omite somente as 18 partes da fonte preferencial Matrix, já presente no Git dedicado da VPS. O executor copia esses bytes do blob versionado em blocos, sem compilar ou instalar, verificando tamanho, SHA-256 integral e hash de cada parte contra o build do Mac. Todas as fontes permanecem disponíveis na publicação. O pacote mantém teto de 16 MiB e a soma de código/assets/dependências permanece limitada a 128 MiB. Só a verificação HTTP do WASM conhecido admite 8 MiB; as demais respostas conservam 2 MiB.

Antes de migrar, parar somente o writer `0xdmme-test.service`, conferir schema 1–9 e preservar hashes das 12 tabelas existentes. Fazer backup privado de até 64 MiB, verificar sua integridade e ensaiar restauração do schema próprio dentro de transação revertida. Após migrar, conferir checksums 1–15, dados anteriores, tabelas novas vazias e contabilidade de bytes. Falha antes de reabrir admite retorno verificado; após reabrir, nunca restaurar automaticamente o banco antigo, pois novos dados podem existir. Guardar backup/versão anterior em workspace próprio para revisão posterior.

A evidência histórica de preservação permanece intacta. Uma diferença de HTTP já existente antes da operação foi investigada e registrada privadamente; esta transição exige os fingerprints/processos históricos e compara a resposta atual antes/depois, sem reescrever o baseline para ocultá-la. A entrada privada `.local/VPS_BLOCK67_REVIEW.json` contém a proposta exata do site próprio e a evidência de respostas, com permissões 0600. Acesso, inventário, recibos e backups ficam exclusivamente em `.local/` ou na área privada dedicada da VPS.

O executor mantém CPU 10% de um núcleo, RAM 192 MiB, sem swap, 32 tarefas e duração de até 240 segundos por operação. O web mantém os limites próprios já configurados. Não reiniciar serviços compartilhados; somente o reload aprovado do Nginx. DNS/HTTPS e publicação de teste não constituem aceite de segurança nem substituem testes físicos mobile.

Na operação de proxy, a validação enxerga logs temporários e `/dev/null` no lugar do arquivo PID, somente dentro de seu namespace. Isso permite `nginx -t` com filesystem protegido sem abrir os logs/PID reais para escrita; o reload é solicitado ao master existente pelo systemd.

## Transição específica do bloco 09, aprovada em 03/10/2026

O proprietário pediu enviar e ativar o bloco 09 e autorizou a retomada após a pausa de contexto. Usar o mesmo `npm run deploy:staging`, com exceção restrita no executor existente: predecessor ativo `8acc99d`, fontes/runtime revisados em `343d334`, sequência 001–016 intacta e somente a nova migração 017. O commit final, que inclui o executor, precisa estar publicado e passar em CI. Não há alteração de dependências, Node, Nginx ou serviços compartilhados.

Antes de reabrir o escritor, reutilizar dump privado e cópia de objetos, cada um limitado a 64 MiB, parsing integral e restauração em transação encerrada por `ROLLBACK`. Conferir checksums 001–017 e contagens/digests das 23 tabelas preexistentes. Somente a coluna nova `message_packets.personal_collected` fica fora da comparação de linhas; uma verificação separada exige que seja falsa em todas as mensagens existentes. A tabela nova `personal_removals` precisa estar vazia e o livro de uso físico continuar consistente, incluindo suas futuras cobranças. Objetos, configurações e processos são comparados antes/depois. Parar/iniciar somente `0xdmme-test.service`. Depois de reabrir, uma falha conserva novas gravações e para o app para revisão, sem restaurar automaticamente o dump antigo.

Os três workspaces anteriores estavam ocupados por transições concluídas com backups. O executor separa bundles históricos em `migration-backups/<commit>` na área privada própria: conserva dump, objetos, receipt e eventual artefato QR; remove somente código/build de publicações concluídas conforme a autorização existente. A transição mais recente mantém sua release de retorno completa até uma nova publicação ter sucesso. Ownership, tipos, links, conteúdo e colisões são conferidos antes de mover; tentativas interrompidas permanecem para revisão. O teto de três workspaces de código e o filesystem próprio de 2 GB não aumentam; backups históricos não são apagados para abrir espaço.

**Ponto importante:** publicação destinada ao ambiente de testes. Download/reabertura e limpeza pela interface, aparelhos físicos mobile e aceite final de segurança continuam pendentes. Esta transição não autoriza outras migrações nem estabelece prontidão para conversas reais.

**Resultado:** release `62781eb` publicada em 03/10/2026 com CI aprovada, migração 017, backup/ensaio de restauração, preservação e 36 hashes públicos verificados. A primeira tentativa de preparar parou localmente porque o ambiente do npm encontrou um Python sem suporte a `tarfile.extractall(filter='data')`; selecionar o interpretador compatível já instalado no Mac resolveu, sem instalar dependências ou mudar a VPS. Uma consulta de CI também sofreu timeout antes de atingir a ativação e foi reconferida por leitura.

A primeira conferência após reabrir a release falhou e o executor parou somente o app, conservando novas gravações e todos os backups. Depois de revisar receipt, schema e manifesto exato, a mesma versão foi reaberta e todos os hashes e saúde passaram; a publicação foi concluída somente depois dessa conferência. A reabertura mostrou respostas HTTP não bem-sucedidas antes da prontidão, mas a causa exata da falha original não foi isolada. Não se repetiu migração nem se restaurou o dump. Configurações/processos de preservação permaneceram idênticos. Os três backups históricos e o novo backup foram conservados; só os bundles de código concluídos mais antigos liberaram workspaces.

## Atualizações rotineiras após o bloco 07

O proprietário pediu reaproveitar o script existente e reduzir a demora nas atualizações. Os comandos continuam sendo `npm run deploy:prepare`, `npm run deploy:check` e `npm run deploy:staging`; não há outro comando por bloco para mudanças comuns de código. Antes de ativar, commitar/push da branch `codex/`, conferir checkout limpo e CI do commit exato. O último comando prepara ou reutiliza o build, sincroniza os fontes, envia o pacote, troca a release e reinicia somente o app. Não é necessário rodar os três comandos em sequência.

É possível manter vários commits coesos e enviá-los num único push: a CI exigida para a publicação é a do commit final, que inclui os anteriores, e somente essa versão precisa de build/transferência/ativação. No bloco 09, os commits de funcionalidade e executor foram enviados juntos para uma única publicação. Migrações, dependências e infraestrutura continuam sujeitas às revisões específicas; agrupar commits não dispensa esses contratos.

A preparação comum incorpora a distribuição Matrix já aprovada: pacote abaixo de 16 MiB, reconstrução das fontes do Git e manifesto completo. As restrições de banco, dependências, Node e infraestrutura permanecem; novos contratos desses tipos exigem revisão específica. Atualização comum não reaplica a transição 010–015, não faz backup/restauração de banco e não recarrega Nginx. As migrações já aplicadas continuam verificadas pelo app na inicialização.

Cada asset público tem ETag calculada por SHA-256 dos bytes carregados pelo app. A conferência HTTPS usa o hash esperado com `If-None-Match`; uma resposta 304 confirma conteúdo correspondente sem retransmitir os arquivos grandes. Respostas 200 continuam verificadas pelo hash integral, permitindo conferir versões anteriores sem esse header. As chamadas respeitam o orçamento de requisições existente. APIs/dados privados não recebem essa ETag; a política `no-store` é preservada e o PWA continua com seu fluxo explícito de atualização.

A limpeza automática remove somente workspaces de código concluídos e reconhecidos; backups privados de transições de banco são preservados e tentativas interrompidas continuam exigindo leitura do recibo. O orçamento de três workspaces não foi aumentado.

**Ponto importante:** o comando é executado no Mac, publica código/build na release própria e verifica saúde/retorno. `git pull` ou envio dos fontes sozinho continua sem ativar o app. CI ainda precisa passar, mas preparar/verificar/ativar o mesmo commit não refaz o build nem precisa retransmitir os 50 MB de assets na conferência pública.

## Publicação revisada do bloco 10 em 03/10/2026

O proprietário pediu enviar o bloco 10 à VPS. Reutilizar `npm run deploy:staging`: predecessor ativo `62781eb`, fontes de aplicação revisadas em `1f4d33c`, sequência 001–017 intacta e somente a nova migração 018. O commit final inclui a revisão do executor e exige CI exata aprovada.

A revisão de runtime autoriza somente `web-push@3.6.7` e `@types/web-push@3.6.4`, com os locks SHA-256 `e569391aa19daf28a27c30a8567ce4d55324119d7d1bb2d6c3f36609640152d4` → `a94082f173b3d553c15ea1c8b0db29452b7b79c41615c30478f0a924a12937db`. São 17 pacotes adicionais de runtime, incluindo cinco antes exclusivos do desenvolvimento, sem mudança de versões das dependências existentes. Pacotes originais do cache npm do Mac: 148.973 bytes comprimidos, 509.772 bytes extraídos. Integridade SHA-512 npm e versões são conferidas nas duas pontas. O helper `deploy_runtime.py` apenas prepara/verifica/extrai esses pacotes no candidato do executor existente; não é outro comando de deploy. Não executar npm, scripts de instalação ou compilação na VPS. Arquivos nativos, links, traversal, pacotes alheios e restrições de plataforma são recusados. Dois arquivos originais com alias `./` idênticos são deduplicados somente após comparação dos bytes. Pacotes/licenças originais permanecem no artefato privado da release, sem incorporação ao frontend.

A transição 017→018 reaproveita backup e ensaio transacional de restauração. Com somente o escritor próprio parado, compara hashes das 24 tabelas anteriores, omitindo apenas `relation` e `deletion_account`, ambas inicialmente nulas. Exige as cinco tabelas novas vazias, checksums 001–018 e cobrança global correta. Antes da abertura pode devolver esquema antigo verificado; depois da abertura conserva escritas novas e para somente o app em caso de falha, sem restauração automática. Backup e release anterior ficam preservados.

Limites de 16 MiB de transferência, 128 MiB de release, recursos dos serviços, Node, Nginx e isolamento de rede permanecem. Nenhum VAPID é instalado. Push externo continua pendente devido ao isolamento aprovado; publicação do código não libera saída de rede. Conferir saúde, os 37 assets/fontes públicos e fingerprints/processos/respostas do outro projeto antes/depois. Evidências, acesso e inventários exclusivamente em `.local/`.

**Resultado:** release `8f22884` publicada em 03/10/2026 com [CI aprovada](https://github.com/karma352431231-ship-it/0xDMme/actions/runs/37167971351), migração 018, backup/ensaio de restauração, runtime original conferido, preservação e 37 hashes públicos verificados. Pacote de 8.300.758 bytes, dentro de 16 MiB. A primeira conferência de prontidão encerrou a tentativa depois da abertura; fontes, esquema e backups foram inspecionados, e somente a mesma release foi retomada sem nova migração, instalação ou restauração. Na retomada, oito consultas com intervalo de dois segundos ainda encontraram o serviço iniciando antes da resposta saudável. Evidências operacionais ficam privadas.

A espera inicial de dez tentativas era insuficiente para a carga das fontes sob os limites de I/O existentes. Correção no executor: janela de prontidão de 60 segundos, intervalo de até dois segundos, seguida de uma única conferência dos assets. Mismatch de asset continua falhando, sem repetir o manifesto inteiro. O teto total de 240 segundos, recursos e regra de preservar escritas após abertura permanecem. Dois testes de regressão cobrem partida em 16 segundos, limite da espera e erro de asset; conjunto de 71 testes do executor passou. Publicação da correção pelo mesmo comando é uma atualização de código, com banco/runtime idênticos e sem nova transição de esquema.

**Atualização final:** a correção de prontidão foi publicada como release `7adefc0` pelo mesmo `npm run deploy:staging`, após [CI exata aprovada](https://github.com/karma352431231-ship-it/0xDMme/actions/runs/37168927177). O fluxo normal concluiu sem interrupção, com 37 hashes públicos e preservação verificados; pacote de 8.300.631 bytes. Banco permanece na versão 018, sem nova migração, restauração ou alteração de configuração/serviço compartilhado. A release anterior foi retida para rollback; backups da transição continuam privados e preservados.

## Preparação de chamadas, push e grupos — 05/10/2026

O proprietário pediu publicação e ativação das novas funcionalidades e, após o inventário, aprovou explicitamente infraestrutura própria de TURN/push, filtros restritos aos usuários exclusivos e migrações 026–027, com backup e ensaio de restauração. Fontes `537240c` sincronizadas no GitHub e no Git dedicado da VPS, com [CI integral aprovada](https://github.com/karma352431231-ship-it/0xDMme/actions/runs/37377206631). Os arquivos pessoais de instruções e testes manuais foram preservados fora do commit; o deploy usa checkout limpo local.

O executor existente aceita somente a transição de aplicação `793bf21` → fontes de `537240c`, 025 → 027. Preserva as 48 tabelas anteriores, objetos, checksums 001–025, runtime/lockfile/Node e contabilidade de uso. As duas tabelas novas contêm apenas preferências e entram no ledger. Novas chamadas não criam histórico nem fila durável. Testes do executor cobrem fontes/predecessor inexatos, alterações em SQL antigo, ledger, retorno antes da abertura e preservação de escritas após abertura. Foram aprovados 91 testes locais.

Coturn 4.18.0 é preparado em Linux temporário no computador de desenvolvimento, separado dos pacotes da VPS. Não trocar pela versão 4.6.1 disponível no host nem atualizar pacotes compartilhados. A preparação constatou `noexec` no volume de dados e parou sem iniciar serviços, trocar release ou aplicar migrações. O proprietário então escolheu `/opt/0xdmme-turn`: diretório exclusivo, até 8 MB, controlado pelo root e somente leitura para o serviço. Preservar `noexec` no volume atual. TURN e emissor ficam em usuários, namespaces e unidades próprios na slice existente; filtros por UID precedem a saída externa. Web conserva `PrivateNetwork=yes` e `IPAddressDeny=any`, comunica por socket Unix e nunca recebe VAPID privada. Evidências, acesso, IPs, chaves, certificados e configuração concreta ficam exclusivamente em `.local/` e arquivos privados do host.

**Ponto importante:** aprovação operacional não comprova ativação. Exigir filtros/permissões efetivos, relay UDP/TCP/TLS, bloqueio de destinos proibidos, hashes públicos, saúde e fingerprints antes/depois. A publicação de código usa exclusivamente `npm run deploy:staging`; a preparação de infraestrutura não pode aplicar migrações nem trocar a release. Aceite físico e entrega real de push em aparelhos permanecem necessários.

## Ativação de chamadas, push e grupos — 05/10/2026

**Resultado:** release `44af35f` ativa após [CI integral do commit exato](https://github.com/karma352431231-ship-it/0xDMme/actions/runs/37381079067), pelo `npm run deploy:staging` existente. Build de 8.313.691 bytes preparado no Mac, dentro do teto de 16 MiB. Migrações 026–027 aplicadas com backup privado e ensaio transacional de restauração; 48 tabelas anteriores e objetos preservados, schema 001–027, 50 tabelas e ledger conferidos. Os 38 arquivos públicos servidos, incluindo fontes/licenças, passaram nos hashes do manifesto. Release anterior e backup ficam retidos; depois da reabertura, não restaurar banco antigo sobre novas gravações.

TURN, emissor e filtros próprios estão ativos. Coturn 4.18.0 em `/opt/0xdmme-turn`, root, até 8 MB, somente leitura para o serviço; `noexec` do volume de dados preservado. Chrome com áudio sintético confirmou conexão e tráfego nas duas direções por UDP, TCP e TLS, com candidatos locais/remotos somente `relay` e sem perda registrada. Cadeia e hostname TLS passaram. O utilitário nativo passou UDP/TCP, mas apresentou perda no teste TLS; essa prova isolada não foi registrada como aprovada. A validação WebRTC exercitou o fluxo do navegador e o snapshot de candidatos com o prazo usado pelo app.

Namespaces reais/sintéticos com as propriedades das unidades confirmaram banco, objetos, ambiente privado do web e sockets alheios inacessíveis aos auxiliares. Filtros bloquearam localhost, porta alheia no endereço próprio e destino externo fora dos conjuntos; o push alcançou TLS do provedor permitido. Web mantém rede privada, chave VAPID privada somente no emissor e socket 0660 acessível pelo grupo próprio. Credencial errada, chave pública incompatível e payload com identificadores foram recusados, sem envio externo. Saúde, configurações/processos e sites do outro projeto foram preservados. As quatro exceções de entrada e duas tabelas por UID são próprias; nenhuma regra antiga foi removida ou substituída.

TURN e push estão habilitados no boot, com filtros como dependência. A rotina já existente de renovação do certificado próprio agora atualiza a cópia TLS do TURN; certificado/chave, linhagem própria, permissões e tamanho são validados antes da troca. Só reinicia TURN se a cópia mudar, podendo interromper chamadas ativas nesse momento. Sete provas sintéticas cobriram idempotência, par correspondente, linhagem/permissões/symlink inválidos e retorno do par anterior após falha parcial. Nenhuma renovação ou recarga compartilhada foi executada nesta ativação. Conjuntos de IPs dos provedores de push continuam exigindo revisão conforme DNS; mudança de CDN não amplia destinos automaticamente e pode impedir avisos até atualização revisada.

**Ponto importante:** esta ativação inclui chamadas individuais, push dedicado, grupos gratuitos sem teto de quantidade por conta e cotas de 1 GB pessoal/2 GB por grupo. A capacidade global não foi ampliada. Os testes não comprovam entrega de notificação em provedores reais, áudio em aparelhos físicos, suspensão ou redes restritas; esses itens continuam no aceite. Dados de acesso, rede, certificados, chaves, logs e evidências ficam exclusivamente na área privada.

### Processador de mídia pública — autorizado em 07/10/2026

O proprietário pediu habilitar também envio e preparação da mídia durante a calibração. A autorização cobre FFmpeg/ffprobe externos com hashes do benchmark, runtime próprio imutável, worker compilado localmente, serviço/socket/slice separados (quatro CPUs/8 GiB) e drop-in limitado ao socket do web. Não instalar dependências globais, alterar o outro projeto, ampliar permissões de objetos privados ou aceitar o candidato de moderação. Revisão e requisitos em [processador](PROCESSADOR_MIDIA_COMUNIDADES.md#worker-isolado-autorizado).

Preparar runtime e unidades próprios com orçamento de disco e rollback das adições, verificar isolamento/handshake/arquivos sintéticos e preservação antes/depois. Esta preparação operacional não executa migrações nem troca a aplicação. A ativação da aplicação e a transição 027→043 continuam no executor existente, a partir de fonte revisada e CI exata aprovada. A galeria e seus casos permanecem no processo independente. Registrar resultado e limitações depois da execução; ativar preparação não estabelece aceite do scanner ou liberação pública.

## Ajuste restrito do limite HTTP — 08/10/2026

O proprietário pediu aumentar o limite de pedidos e distinguir as falhas mascaradas como JSON. O parâmetro escolhido é 30 r/s por IP com `burst=120 nodelay`; preserva as demais diretivas, recursos e concorrência. A proposta concreta, configuração anterior e hashes ficam em `.local/VPS_REQUEST_LIMIT_REVIEW.json`, ignorada pelo Git, arquivo regular 0600. O limite do proxy é defesa de infraestrutura, não cota de mensagens por usuário.

Usar **`npm run deploy:staging -- --request-limit`**, no checkout limpo e publicado com CI aprovada. O executor normal primeiro publica o código com seus controles existentes e, só com a opção explícita, aplica as duas substituições aprovadas. `python3 infra/staging/deploy.py --check --request-limit` prepara e valida a proposta sem alterar o proxy. O módulo `deploy_request_limit.py` integra esse executor; não é outro comando de deploy. Uma publicação comum nunca altera o Nginx.

A ação requer a release exata já publicada, manifesto correspondente e configuração atual igual ao predecessor revisado. Somente o arquivo do site próprio ganha permissão de escrita; o teste de sintaxe usa logs/PID temporários no namespace do validador. Conferir fingerprints, processos e saúde existentes antes/depois. Fazer `nginx -t` e reload gracioso, sem restart do Nginx ou dos outros serviços. A proposta recusa qualquer mudança além de 5→30 r/s e burst 20→120. Guardar configuração anterior e receipt na área privada própria desta transição, separada dos workspaces de código para preservar sua política de retenção, junto à evidência local. Falha devolve somente o arquivo próprio, valida/recarrega e confere retorno; tentativa incompleta ou configuração inesperada exige revisão antes de repetir. CPU 10%, RAM 192 MiB, 32 tarefas e duração 240 s do executor permanecem.

**Ponto importante:** 429 ainda não foi confirmado como a causa da captura. O novo diagnóstico identifica a operação e o status das próximas falhas sem conteúdo privado. O teto de concorrência do site permanece; não há benchmark de capacidade ou garantia de eliminar toda indisponibilidade.

A release anterior já ocupava as 512 entradas do manifesto. A exceção técnica admite somente as duas entradas `src/client/api-response/index.ts` e `infra/staging/deploy_request_limit.py` além das 512 existentes, total máximo 514 quando ambas estiverem presentes. Qualquer crescimento adicional continua recusado. Os limites de bytes do manifesto, pacote de 16 MiB, extração de 128 MiB, fontes públicas e recursos não aumentam; a regressão cobre a recusa de um terceiro arquivo adicional e de um manifesto excedido sem esses módulos.

## Preparação local do ranking — 08/10/2026

A implementação local dos cortes 1–8 acrescentou dez arquivos de execução ao
manifesto. Sob a autorização de decisões técnicas autônomas, o executor
existente admite somente os dez caminhos enumerados em `RANKING_SOURCE_FILES`,
além das duas exceções anteriores de diagnóstico HTTP. Arquivos adicionais não
revisados continuam sujeitos ao teto base de 512 entradas. Limites de arquivo,
extração, runtime, hashes, fontes correspondentes e compatibilidade permanecem
ativos. A preparação foi verificada em snapshot Git sintético temporário, sem
commit no checkout do proprietário, SSH ou ativação.

**Ponto importante:** essa exceção permite preparar as fontes; não autoriza a
transição de banco 043→047, não cria uma autorização de release e não muda
serviços da VPS. Migrações 044–047 foram aplicadas somente no banco exclusivo de
testes. Ativação futura exige revisão operacional e autorização próprias,
checkout limpo/enviado, CI do commit exato, preservação e rollback pelo comando
já existente. Parâmetros e verificação no [plano do ranking](RANKING_COMUNIDADES_TRENDING.md).

### Ranking, visualizações e workers — autorização de 08/10/2026

O proprietário autorizou concluir os cortes 1–10, visualizações públicas,
commits separados, push ao GitHub e Git dedicado da VPS e ativação. Reusar
`npm run deploy:staging`, com checkout limpo, fontes exatas e CI aprovada.
`deploy_background.py` é um módulo interno do mesmo executor, sem novo comando
alternativo. A revisão é restrita ao predecessor registrado e fontes de aplicação
fixadas no módulo, schema 043→049, sem dependências/Node novos. As exceções do
manifesto enumeram exatamente os caminhos adicionais; limites de arquivo,
extração, bytes e runtime continuam os mesmos.

O executor instala somente três unidades próprias, bytes duráveis no volume do
0xDMme e links administrados pelo systemd, mais `40-background.conf` no drop-in
existente do nosso web. O deploy pode escrever nesse diretório próprio; nenhuma
permissão adicional para configuração de outros projetos. Recarrega o inventário
do systemd e habilita somente esses serviços, preservando configurações e PIDs
registrados dos serviços existentes. Nenhum reload do Nginx é necessário.

O web para antes do backup/migração; workers novos ainda não estão ativos. A
abertura exige schema/dados/objetos preservados, web saudável e três travas
exclusivas PostgreSQL. Rollback antes de abrir restaura backup validado, release
e nossas adições. Depois de abrir, preservar novas escritas e parar somente
nossos escritores para revisão. Releases seguintes de código também reiniciam
os três workers próprios para evitar processos executando arquivos da release
anterior. CPU/RAM/tarefas do slice compartilhado do 0xDMme permanecem limitados.
Acesso, hashes privados, backups e evidências operacionais ficam em `.local/`.

Fontes de aplicação fixadas em `a2ed2c32cb63abd85311fc381b691fe1c6d6ce37`; predecessor exclusivo
`2921232287a929477e6d7cf18e7f82ff9d0fcddd`. Commits posteriores desta
entrega acrescentam documentação e executor, sem alterar as fontes aprovadas.

Na primeira tentativa desta transição, o validador systemd tentou criar seu
diretório temporário no filesystem somente leitura do executor. O rollback
restaurou o schema 43, mas o limite de 240 segundos interrompeu seu retorno de
arquivos. A revisão confirmou escritores fechados, backup válido, fontes exatas
e preservação; o retorno da release anterior foi concluído e sua saúde validada.
A tentativa e o backup permanecem privados para revisão, sem retry automático.

O executor de ativação agora oferece `/tmp` privado de 16 MiB, sem execução,
e define `TMPDIR`. Validação das unidades ocorre antes de parar o web ou migrar.
**Ponto importante:** CPU, RAM, processos, timeout, banco e infraestrutura
compartilhada conservam seus limites; esta correção não altera fontes da aplicação.

Falhas de transição também registram fase, tipo e mensagens controladas dos
guards no recibo/stderr privado antes do rollback. Não incluir SQL, argumentos,
credenciais ou conteúdo. Assim o rollback conserva a causa diagnosticável,
inclusive quando o limite do executor interrompe sua conclusão.
