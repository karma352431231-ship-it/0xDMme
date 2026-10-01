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
globais. O fluxo de ativação automática ainda não foi implementado.

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

**Ponto importante:** o envio ao GitHub/VPS não libera a V1, não substitui aceite
mobile e não torna seguro usar conversas reais. O risco residual de hardware e
rede compartilhados continua conforme a [decisão de isolamento](DOMINIO_E_AMBIENTE_TESTE.md).
