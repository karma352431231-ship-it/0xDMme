# 0xDMme

Repositório do **0xDMme**, mensageiro privado web/PWA descrito no plano. Nome público aprovado em 01/10/2026; domínio **0xdmme.app**, comprado pelo proprietário via Namecheap. O [ambiente de testes](https://0xdmme.app/#configuracoes) está disponível com HTTPS público válido; [isolamento e verificações](docs/DOMINIO_E_AMBIENTE_TESTE.md) documentados. Ainda não é publicação da V1 nem chat para dados reais.

O objetivo é oferecer autenticação por wallet e criptografia ponta a ponta, preservando conteúdo e segredos de descriptografia nos dispositivos. Essas propriedades são requisitos a implementar e validar, não garantias de software já disponível.

## Estado atual

O [bloco 06](docs/BLOCO_06_CONTATOS.md) está concluído localmente: agenda por wallet com apelidos cifrados, convite revogável por link/QR, descoberta escolhida pelo dono do perfil, solicitações paginadas sem tetos de quantidade/frequência, consentimento bilateral e bloqueio no servidor. A referência de identidade fica no cofre. Testes físicos mobile permanecem posteriores; migrações 010/011 não ativadas na VPS. Próximo bloco: mensagens individuais e fila sem expiração (07).

O [bloco 05](docs/BLOCO_05_COFRE.md) está concluído localmente: agenda/configurações privadas e dados fictícios cifrados, versões preservadas, conflitos explícitos, cópia local offline e recuperação em outro aparelho. A cota pessoal permanece 300 MB, contada conforme o conteúdo e os uploads concretos; cadastrar uma conta não reserva 300 MB. O teto de 1 GB por grupo também permanece, sem alocação antecipada, para o bloco de grupos. Testes físicos mobile dos blocos 04–05 ficam para depois. Migrações 006–009 ainda não foram ativadas na VPS.

O [bloco 04](docs/BLOCO_04_DISPOSITIVOS_E_RECUPERACAO.md) implementa localmente autorização verificável dos aparelhos, vinculação por QR Code/código, recuperação com wallet original e segredo e revogação com troca de chaves. Sua validação física mobile fica para o proprietário após a revisão no Mac, conforme autorização de 02/10/2026. Há migrações novas; esta entrega não foi publicada na VPS e não representa chat para dados reais.

O bloco 00 e a seleção técnica do bloco 01 estão concluídos: mensagens Matrix WASM, cofre Web Crypto e ZK Semaphore, com prova funcional aprovada em Mac/Android/iPhone. A [revisão de dependências/licenças](docs/DEPENDENCIAS_E_SELECAO_BLOCO_01.md) registra a GPL do frontend autorizada e a exceção de manutenção Rust. Não repetir roteiros manuais aprovados sem mudança relevante ou falha. Inventários, medidas e identificação de aparelhos ficam exclusivamente em `.local/`, ignorado pelo Git.

A [base do bloco 02](docs/BLOCO_02_BASE_WEB.md) oferece interface responsiva/navegação, manifesto PWA, cache exclusivo da interface pública, atualização explícita, servidor local, PostgreSQL isolado e módulo de objetos opacos. Usa TypeScript, Node 24, módulos nativos do navegador e esbuild. O [bloco 03](docs/BLOCO_03_CONTA_E_PERFIL.md) acrescenta login EVM/Solana por assinatura, descoberta EIP-6963/Wallet Standard, sessão, cadastro inicial e perfil cifrado. O retorno ao Safari/PWA usa pedido temporário no servidor próprio, assinatura no navegador da wallet e confirmação do endereço no navegador original, sem SDK/relay pago ou código copiado. O bloco 03 foi aceito pelo proprietário em 02/10/2026 nos fluxos registrados no documento; o aceite não anuncia suporte a combinações não testadas. Ainda não há chat ou cofre de produto para dados reais; os laboratórios continuam separados de `dev`.

## Preparação local

Requisitos: Node 24 (24.14.0 em `.nvmrc`), npm 11 e PostgreSQL 16 para executar o backend persistente. Docker não é obrigatório. As verificações unitárias e o build não precisam de banco; testes de integração exigem banco exclusivo. Consulte a [preparação do bloco 02](docs/BLOCO_02_BASE_WEB.md#executar-localmente), sem usar bancos de outro projeto.

Se usa nvm, execute `nvm use` nesta pasta antes dos comandos. Confirme `node --version` e `npm --version`; instalações com versões fora das faixas declaradas são recusadas.

```bash
npm ci --ignore-scripts
npm run probe:zk:prepare
npm run check
npm run build
```

Após preparar o banco exclusivo e configurar `.env` conforme `.env.example`, `npm run dev` gera o build e inicia a base somente em `http://127.0.0.1:45100`. Hosts de banco externos e perfis desconhecidos falham explicitamente. Ctrl+C encerra HTTP e pool. O perfil `staging` é exclusivo do [ambiente isolado](docs/DOMINIO_E_AMBIENTE_TESTE.md), com origem canônica, banco/role próprios, socket Unix e diretórios fixos; `.env.staging.example` é apenas modelo sem credenciais. O perfil de produção ainda não existe; não publicar o perfil de desenvolvimento.

`npm run check` reúne lint com tipos, TypeScript strict, fronteiras, licenças npm, formatação, build e testes. `npm run test:integration` verifica banco real e ciclo de vida do serviço, com URL de teste em `.local/web-test.env` ou no ambiente. As violações usadas nos testes são temporárias. `npm run format` aplica o único formatador adotado.

O CI em `.github/workflows/check.yml` repete as verificações e a integração com PostgreSQL 16 temporário no Ubuntu, sem implantação ou credenciais reais. A execução remota ainda precisa ser verificada.

Para o laboratório, execute `npm run probe:crypto` e abra `http://127.0.0.1:45101/`. Há também ensaios de cofre e ZK. Siga a [prova do bloco 01](docs/BLOCO_01_PROVA_CRIPTOGRAFICA.md) para executar os cenários. O laboratório é temporário e usa somente dados fictícios. `probe:zk:prepare` baixa artefatos públicos fixados antes do uso privado, sem CDN durante a prova; `npm run probe:measure` mantém medidas em registros locais ignorados.

Para iPhone na mesma rede privada do Mac, o perfil opcional `npm run probe:mobile` usa HTTPS e acesso temporário. Exige configuração/certificados em `.local/` e confiança explícita no certificado de teste no aparelho; consulte o [roteiro HTTPS](docs/BLOCO_01_PROVA_CRIPTOGRAFICA.md#acesso-iphone-por-https-local). O perfil padrão continua em loopback.

## Documentação

- [Decisões e plano de implementação](DECISOES_E_PLANO_DE_IMPLEMENTACAO.md): escopo aprovado, propostas, pendências, sequência e critérios de aceite.
- [Padrões de trabalho](AGENTS.md): regras de implementação, revisão e verificação.
- [Candidatos criptográficos](docs/CRIPTOGRAFIA_CANDIDATOS.md): triagem inicial e critérios da prova técnica.
- [Ensaios e decisão criptográfica](docs/BLOCO_01_PROVA_CRIPTOGRAFICA.md): modelo de ameaças, execução, evidências, limitações e roteiro dos aparelhos.
- [Seleção e dependências do bloco 01](docs/DEPENDENCIAS_E_SELECAO_BLOCO_01.md): versões, licenças, advisories e condições da integração.
- [Base web do bloco 02](docs/BLOCO_02_BASE_WEB.md): execução, políticas PWA/backend, verificação e pendências.
- [Conta e perfil do bloco 03](docs/BLOCO_03_CONTA_E_PERFIL.md): autenticação EVM, limites, perfil cifrado e impedimento mobile.
- [Dispositivos e recuperação do bloco 04](docs/BLOCO_04_DISPOSITIVOS_E_RECUPERACAO.md): autoridade das chaves, vinculação, revogação, recuperação, perda e validação.
- [Contatos do bloco 06](docs/BLOCO_06_CONTATOS.md): agenda particular, descoberta, consentimento, bloqueio, budgets e roteiro de teste.
- [Cofre do bloco 05](docs/BLOCO_05_COFRE.md): versões cifradas, uso efetivo, cópia local, conflitos e roteiro de teste.
- [Domínio e ambiente de testes](docs/DOMINIO_E_AMBIENTE_TESTE.md): DNS Namecheap, HTTPS, isolamento da VPS e pendências de ativação.
- [Git e envio à VPS](docs/GIT_E_DEPLOY.md): commits por escopo, sincronização do código por Git e limites da ativação de versões.
- [Licenças](LICENSES.md): distribuição do frontend e fontes correspondentes.

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

Métricas do PostgreSQL local: `npm run observe:database`, com a mesma `.env` privada da aplicação. Um snapshot agregado substitui o anterior exclusivamente em `.local/metrics/database.json`. Configuração do cluster isolado e limites: [bloco 02](docs/BLOCO_02_BASE_WEB.md).
