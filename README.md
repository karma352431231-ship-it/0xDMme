# Hash-Talk

Repositório do projeto de mensageiro privado web/PWA descrito no plano. O nome de trabalho no documento continua sendo **Crypto WhatsApp**; o nome público e a identidade visual ainda dependem de decisão.

O objetivo é oferecer autenticação por wallet e criptografia ponta a ponta, preservando conteúdo e segredos de descriptografia nos dispositivos. Essas propriedades são requisitos a implementar e validar, não garantias de software já disponível.

## Estado atual

O bloco 00 concluiu a preparação inicial. Os ensaios locais do bloco 01 estão implementados: mensagens cifradas, revogação/rotação, cofre/recuperação e prova ZK real com dados sintéticos. Aceite final e seleção para produto dependem dos aparelhos e das condições de revisão/licença registradas. Inventários de máquinas, serviços, recursos e recuperação ficam somente em arquivos locais ignorados pelo Git; não publicar esses dados nem reproduzi-los no histórico dos documentos.

A base local usa TypeScript, Node 24 e npm, com configuração de exemplo, verificações e testes. O laboratório usa servidor HTTP somente local e motor criptográfico candidato. Ainda não há chat de produto, interface PWA ou integração com banco/wallet; frameworks e protocolo definitivo serão selecionados conforme o plano.

## Preparação local

Requisitos: Node 24 (ambiente verificado: 24.14.0, em `.nvmrc`) e npm 11. Não são necessários PostgreSQL ou Docker para executar esta etapa.

Se usa nvm, execute `nvm use` nesta pasta antes dos comandos. Confirme `node --version` e `npm --version`; instalações com versões fora das faixas declaradas são recusadas.

```bash
npm ci --ignore-scripts
npm run probe:zk:prepare
npm run check
npm run dev
```

`npm run dev` valida a configuração e imprime uma mensagem de preparação, encerrando o processo sem abrir portas. A configuração padrão é development; opcionalmente, copie `.env.example` para `.env`. Outros perfis falham explicitamente. O teste inicial não precisa de credenciais.

`npm run check` reúne lint com tipos, TypeScript strict, validação de dependências, formatação e testes. As violações usadas nos testes são criadas em pastas temporárias e removidas ao concluir. `npm run format` aplica o único formatador adotado.

O CI em `.github/workflows/check.yml` repete as verificações em Ubuntu, sem implantação ou credenciais de aplicação. Está preparado localmente; a execução no GitHub ainda precisa ser verificada.

Para o laboratório, execute `npm run probe:crypto` e abra `http://127.0.0.1:45101/`. Há também ensaios de cofre e ZK. Siga a [prova do bloco 01](docs/BLOCO_01_PROVA_CRIPTOGRAFICA.md) para executar os cenários. O laboratório é temporário e usa somente dados fictícios. `probe:zk:prepare` baixa artefatos públicos fixados antes do uso privado, sem CDN durante a prova; `npm run probe:measure` mantém medidas em registros locais ignorados.

## Documentação

- [Decisões e plano de implementação](DECISOES_E_PLANO_DE_IMPLEMENTACAO.md): escopo aprovado, propostas, pendências, sequência e critérios de aceite.
- [Padrões de trabalho](AGENTS.md): regras de implementação, revisão e verificação.
- [Candidatos criptográficos](docs/CRIPTOGRAFIA_CANDIDATOS.md): triagem inicial e critérios da prova técnica, sem biblioteca escolhida para o produto.
- [Ensaios e decisão criptográfica](docs/BLOCO_01_PROVA_CRIPTOGRAFICA.md): modelo de ameaças, execução, evidências, limitações e roteiro dos aparelhos.

## Fluxo de trabalho

- Usar `main` como base e branches `codex/<objetivo>` para as próximas mudanças.
- Configurar autoria e autenticação apenas neste repositório, usando a conta proprietária e seu email GitHub `noreply`. Manter credenciais separadas por repositório, sem reutilizar a identidade de outros projetos.
- Implementar uma pequena fatia por vez, começando pelo inventário do bloco 00 e pela validação criptográfica do bloco 01.
- Consultar o plano antes de implementar e registrar decisões e evidências no bloco correspondente.
- Manter as verificações de código da base, conforme a seção 20 do plano; complexidade 10, profundidade 3 e quatro parâmetros são erros bloqueantes, sem limite de linhas.
- Revisar os arquivos preparados para cada commit e confirmar antes de enviar alterações ao remoto.

## Dados privados

O [.gitignore](.gitignore) exclui configurações privadas, chaves, diretórios de dados locais, dependências e saídas geradas. O exemplo [.env.example](.env.example) contém somente o perfil de preparação; futuros exemplos devem conter apenas valores fictícios.

**Ponto importante:** não versionar chaves privadas, segredos de recuperação, credenciais, conteúdo de conversas ou backups, mesmo criptografados. O `.gitignore` não verifica o conteúdo dos arquivos e não protege arquivos já rastreados; revisar o diff antes de cada commit.
