# 0xDMme — Git e envio à VPS

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
