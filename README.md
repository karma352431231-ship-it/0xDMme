# Hash-Talk

Repositório do projeto de mensageiro privado web/PWA descrito no plano. O nome de trabalho no documento continua sendo **Crypto WhatsApp**; o nome público e a identidade visual ainda dependem de decisão.

O objetivo é oferecer autenticação por wallet e criptografia ponta a ponta, preservando conteúdo e segredos de descriptografia nos dispositivos. Essas propriedades são requisitos a implementar e validar, não garantias de software já disponível.

## Estado atual

O bloco 00 está em andamento, limitado inicialmente à preparação do repositório. Ainda não há aplicação, dependências instaladas, comandos de execução ou testes automatizados. A stack e as bibliotecas serão selecionadas conforme o plano.

## Documentação

- [Decisões e plano de implementação](DECISOES_E_PLANO_DE_IMPLEMENTACAO.md): escopo aprovado, propostas, pendências, sequência e critérios de aceite.
- [Padrões de trabalho](AGENTS.md): regras de implementação, revisão e verificação.

## Fluxo de trabalho

- Usar `main` como base e branches `codex/<objetivo>` para as próximas mudanças.
- Configurar autoria e autenticação apenas neste repositório, usando a conta proprietária e seu email GitHub `noreply`. Manter credenciais separadas por repositório, sem reutilizar a identidade de outros projetos.
- Implementar uma pequena fatia por vez, começando pelo inventário do bloco 00 e pela validação criptográfica do bloco 01.
- Consultar o plano antes de implementar e registrar decisões e evidências no bloco correspondente.
- Configurar verificações de código junto ao primeiro esqueleto, conforme a seção 20 do plano.
- Revisar os arquivos preparados para cada commit e confirmar antes de enviar alterações ao remoto.

## Dados privados

O [.gitignore](.gitignore) exclui configurações privadas, chaves, diretórios de dados locais, dependências e saídas geradas. Arquivos de exemplo de configuração devem conter apenas valores fictícios e serão criados quando as variáveis necessárias forem definidas.

**Ponto importante:** não versionar chaves privadas, segredos de recuperação, credenciais, conteúdo de conversas ou backups, mesmo criptografados. O `.gitignore` não verifica o conteúdo dos arquivos e não protege arquivos já rastreados; revisar o diff antes de cada commit.
