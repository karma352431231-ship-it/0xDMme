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

Antes do primeiro envio, `npm run check` passou com lint, tipos, fronteiras,
licenças, formatação, build e 70 testes automatizados. Sintaxe do helper Python,
links locais e ausência do acesso SSH/chaves privadas nos arquivos versionáveis
foram conferidos. O repositório bare próprio foi preparado; as comparações de
configuração, processos persistentes e respostas dos sites anteriores passaram,
sem reinícios. Evidências detalhadas permanecem exclusivamente em `.local/`.

## Ativação de uma versão

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

O build é feito numa exportação do Git com as dependências de desenvolvimento
já instaladas. Diretórios reais com hardlinks locais preservam a identificação
dos pacotes incorporados pelo esbuild; um link simbólico para `node_modules`
pode omitir esses pacotes do arquivo de fontes. O comando confere fontes dos
terceiros antes de permitir a publicação. O pacote transferido contém somente
`dist/`; as fontes de runtime são extraídas do commit no Git bare próprio da VPS,
com manifesto/hash que vincula fontes e build. Dependências de runtime existentes
são reutilizadas somente quando lockfile/contrato permanecem iguais.

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
16 MB; extração e dependências têm orçamento de 128 MB cada; exigir 256 MB
livres. Há lock contra ativação simultânea. Antes/depois, comparar configurações,
processos e respostas da baseline, além de configurações próprias e processo do
PostgreSQL próprio. Não atualizar Nginx, certificados, firewall ou outros serviços.

Mudanças no módulo de banco (incluindo migrações), lockfile, contrato de runtime
ou Node são recusadas: precisam de revisão específica antes de ampliar o fluxo.
O Node já instalado pode estar numa versão superior à `.nvmrc`, desde que atenda
ao intervalo aprovado em `engines.node` sem mudança desse contrato. Não atualizar
o Node do sistema para igualar a versão do ambiente de desenvolvimento.
Não há opção `force` ou migração automática autorizada. Uma falha de ativação
restaura os arquivos anteriores e reinicia somente `0xdmme-test.service`; a
saúde do retorno é conferida. Falha do próprio retorno é reportada como não
verificada, nunca como sucesso.

Uma release anterior é mantida para retorno. Só após uma publicação saudável
podem ser removidos workspaces concluídos criados pelo próprio comando, contendo
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
