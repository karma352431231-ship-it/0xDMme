# Hash-Talk

Repositório do projeto de mensageiro privado web/PWA descrito no plano. O nome de trabalho no documento continua sendo **Crypto WhatsApp**; o nome público e a identidade visual ainda dependem de decisão.

O objetivo é oferecer autenticação por wallet e criptografia ponta a ponta, preservando conteúdo e segredos de descriptografia nos dispositivos. Essas propriedades são requisitos a implementar e validar, não garantias de software já disponível.

## Estado atual

O bloco 00 concluiu a preparação inicial: base local reproduzida, verificações, matriz proposta, triagem de dependências e estimativas. O próximo passo é a prova criptográfica do bloco 01 com dados sintéticos. Os critérios operacionais e a compatibilidade nos dispositivos ainda precisam ser validados. Inventários de máquinas, serviços, recursos e recuperação ficam somente em arquivos locais ignorados pelo Git; não publicar esses dados nem reproduzi-los no histórico dos documentos.

A base local usa TypeScript, Node 24 e npm, com configuração de exemplo, verificações e testes. Ainda não há chat, servidor HTTP, interface PWA ou integração com banco/wallet; frameworks e bibliotecas criptográficas serão selecionados conforme o plano.

## Preparação local

Requisitos: Node 24 (ambiente verificado: 24.14.0, em `.nvmrc`) e npm 11. Não são necessários PostgreSQL ou Docker para executar esta etapa.

Se usa nvm, execute `nvm use` nesta pasta antes dos comandos. Confirme `node --version` e `npm --version`; instalações com versões fora das faixas declaradas são recusadas.

```bash
npm ci --ignore-scripts
npm run check
npm run dev
```

`npm run dev` valida a configuração e imprime uma mensagem de preparação, encerrando o processo sem abrir portas. A configuração padrão é development; opcionalmente, copie `.env.example` para `.env`. Outros perfis falham explicitamente. O teste inicial não precisa de credenciais.

`npm run check` reúne lint com tipos, TypeScript strict, validação de dependências, formatação e testes. As violações usadas nos testes são criadas em pastas temporárias e removidas ao concluir. `npm run format` aplica o único formatador adotado.

O CI em `.github/workflows/check.yml` repete as verificações em Ubuntu, sem implantação ou credenciais de aplicação. Está preparado localmente; a execução no GitHub ainda precisa ser verificada.

## Documentação

- [Decisões e plano de implementação](DECISOES_E_PLANO_DE_IMPLEMENTACAO.md): escopo aprovado, propostas, pendências, sequência e critérios de aceite.
- [Padrões de trabalho](AGENTS.md): regras de implementação, revisão e verificação.
- [Candidatos criptográficos](docs/CRIPTOGRAFIA_CANDIDATOS.md): triagem inicial e critérios da prova técnica, sem biblioteca escolhida para o produto.

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
