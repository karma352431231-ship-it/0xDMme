# 0xDMme — ensaio de recuperação por assinatura da wallet

Autorizado pelo proprietário em 02/10/2026 como prova isolada, após explicar a diferença entre assinatura exclusiva de recuperação e criptografia nativa da wallet. Preservar a recuperação atual e o vínculo por QR do bloco 04. A autorização não aprova integração, migração, publicação ou proteção de conteúdo real.

Atualização em 02/10/2026: o proprietário confirmou o teste entre arquivos após a correção e autorizou uma integração separada no aplicativo, com retorno mobile cifrado e envio ao Git. Essa decisão substitui a pendência de autorização de integração, sem transformar este laboratório em código de produção ou certificar ambientes ainda não testados. Ver a revisão do [bloco 04](BLOCO_04_DISPOSITIVOS_E_RECUPERACAO.md).

## Objetivo e fronteiras

Verificar se uma assinatura específica, obtida novamente com a mesma conta, permite abrir conteúdo fictício sem guardar outro código. Não usar a assinatura pública de login, seed ou chave privada da wallet. A assinatura do ensaio deve permanecer somente no cliente e ser tratada como segredo.

Usar somente bibliotecas já adotadas para verificar assinaturas EVM/Solana e Web Crypto para HKDF-SHA-256 e AES-256-GCM. A mensagem exclusiva inclui versão, origem, ecossistema, endereço e identificador aleatório público. Esses dados, salt, nonce e ciphertext podem acompanhar o pacote cifrado; assinatura e chave derivada não podem. Isso é um experimento de composição, não um protocolo aprovado ou auditado para o produto.

Examinar restauração sem estado local, outra conta, adulteração e duas assinaturas válidas diferentes da mesma conta. Também demonstrar que obter a assinatura exclusiva permite abrir o pacote: o texto com a origem não obriga uma wallet genérica a recusá-lo em outro site. O ensaio não elimina phishing nem cria automaticamente uma autorização E2EE de aparelho.

## Execução local

Na raiz do repositório, executar `npm run probe:wallet-recovery` e abrir `http://127.0.0.1:45107` num navegador com uma wallet de teste, sem fundos. O listener atende somente loopback, encerra em trinta minutos e não oferece APIs de login/cofre. Não altera o build público ou a VPS. Para a fixture automática, usar `npm run probe:wallet-recovery -- --synthetic`; esse modo mostra nomes fictícios e nunca comprova uma wallet real.

1. Selecionar wallet/ecossistema e confirmar uso exclusivo de dados fictícios. Criar o ensaio e conferir as duas mensagens idênticas antes de assinar.
2. Recarregar a página e clicar em **Testar este pacote** para recuperar com uma terceira assinatura. Conferir a conta de origem e o identificador apresentados junto ao botão. Só o pacote cifrado fica no armazenamento local; nenhuma assinatura ou chave derivada é persistida pelo laboratório.
3. Trocar a conta na wallet e tentar recuperar: deve recusar antes de solicitar assinatura. Voltar à conta original e confirmar que o pacote permanece recuperável.
4. Baixar o pacote fictício cifrado e importar em outro perfil limpo, na mesma origem. Conferir o nome do arquivo, a conta e o identificador ativos; clicar em **Testar este pacote** com a conta original disponível na wallet desse perfil. Repetir também no mesmo perfil: importar o arquivo de uma segunda conta por cima do primeiro, sem apagar antes. A primeira conta deve ser recusada e a segunda deve recuperar o arquivo da segunda conta. Nenhuma seed ou chave privada deve ser informada ao laboratório.
5. Repetir a recuperação na outra implementação/aparelho com a mesma conta, mensagem e pacote. O sucesso das duas assinaturas iniciais não garante esse resultado. Mobile exige acesso a uma mesma origem HTTPS autorizada; este listener loopback não oferece publicação ou transporte mobile.

Exportar/importar exige guardar somente o pacote **cifrado de teste**, não uma assinatura, chave ou código de recuperação. Numa integração futura, os metadados/ciphertext precisariam ser fornecidos pelo cofre, mantendo os segredos exclusivamente no cliente. Essa integração não faz parte do ensaio.

## Correção do alvo da importação em 02/10/2026

O proprietário relatou que uma conta recuperava arquivos criados por duas contas com endereços diferentes. A inspeção confirmou um defeito na interface: importar com um pacote já carregado era recusado, mas o botão continuava recuperando o pacote anterior. O resultado positivo não demonstrava abertura do arquivo escolhido. O vínculo criptográfico entre pacote e conta continuava recusando outras contas nos testes dirigidos.

Agora escolher um arquivo invalida imediatamente o alvo anterior; uma importação válida substitui o pacote ativo e o ciphertext local. Arquivo inválido, excessivo, de outra origem, ilegível, falha de armazenamento ou operação interrompida não podem deixar o botão testando o alvo antigo. O ciphertext anteriormente guardado é preservado se a substituição falhar; somente uma recarga pode restaurá-lo, identificado explicitamente como pacote do armazenamento local. A interface mostra arquivo, conta e identificador; o sucesso identifica o pacote efetivamente aberto. Os novos downloads incluem conta e identificador no nome, sem alterar o formato dos arquivos anteriores.

Para carregar o código corrigido, reiniciar o servidor local com `Ctrl+C` e `npm run probe:wallet-recovery`, depois recarregar a página. O servidor monta os bundles uma vez ao iniciar. Os arquivos v1 já baixados continuam aceitos na mesma origem. O relato anterior de sucesso em ambos os arquivos precisa ser repetido com a seleção corrigida.

## Resultados e limites

Implementado como laboratório separado, sem dependências novas. Quinze testes dirigidos passaram: os dez casos iniciais cobrem restauração em nova instância EVM e Ed25519; outra conta, inclusive fingindo o endereço original; adulteração de ciphertext/nonce/salt; origem/ecossistema/identificador distintos; assinatura de login recusada; limites/formato; superfícies HTTP locais sem APIs e sem fixture no modo real. Cinco regressões adicionais cobrem substituição A/B/A por arquivos de contas diferentes; arquivos da mesma conta e com o mesmo nome; falhas de leitura/validação; falha ao guardar; invalidação imediata e recusa de leitura tardia após interrupção.

Verificação inicial: lint, tipos estritos, fronteiras/ciclos, licenças npm, formatação e dez testes dirigidos passaram. Após a correção de importação, lint, tipos estritos, fronteiras/ciclos, formatação e os quinze testes dirigidos passaram; não houve mudança de dependências ou lockfile. O servidor real e o sintético compilaram seus bundles locais durante a validação. Não foi executado o `check` completo, CI, integração PostgreSQL, build de produção ou deploy, pois o ensaio não modifica esses caminhos.

No navegador do Mac com providers fictícios, criação, recarga e recuperação funcionaram em EVM e Solana; outra conta foi recusada em ambos. A assinatura EVM variável foi rejeitada na configuração e na recuperação, preservando o pacote anterior. A descoberta Solana usa o handshake público do Wallet Standard entre os bundles, sem alterar o conector do produto. A exportação por Blob não produziu o evento de download na automação disponível; não houve erro no console. Isso não comprova a causa nem sucesso do download automatizado. O proprietário posteriormente relatou baixar arquivos com wallets reais. A restauração a partir de JSON sem estado anterior foi validada nos testes dirigidos.

Na regressão da importação, a automação do Mac escolheu arquivos JSON locais pelo seletor do navegador, em uma origem separada do ensaio real. Em EVM e Solana, A abriu o arquivo A; importar B sobre A fez A ser recusada e B recuperar o identificador correto. Um arquivo inválido desabilitou recuperação/download; a recarga identificou o ciphertext B preservado como local, e B voltou a recuperá-lo. Não houve erros de console. Evidências e arquivos cifrados com contas exclusivamente fictícias ficam em `.local/wallet-recovery-probe/`, fora do Git.

**Limitações demonstradas, não apenas hipóteses:**

- Uma segunda assinatura EVM válida da mesma conta, com outro nonce criptográfico, gerou outra chave e não abriu o pacote. O formato `personal_sign` não exige que todos os implementadores repitam os mesmos bytes. HKDF não corrige assinaturas diferentes.
- Uma cópia da assinatura exclusiva, junto do pacote, abriu o conteúdo fictício sem nova interação com a wallet. Escrever a origem na mensagem não impede que uma wallet genérica assine a mesma mensagem em outro site. HKDF não transforma uma assinatura vazada em segredo seguro.
- Strings e `CryptoKey` em JavaScript não oferecem apagamento físico garantido da memória. A página não mostra ou transmite segredos, recusa resultados atrasados e exige recarga após ocultação durante operação ou timeout; isso não atesta o comportamento interno da wallet.

Não há aceite completo de MetaMask, Phantom ou Backpack real. O proprietário relatou recuperação com Phantom e recusa ao selecionar outra wallet/conta; após a correção, confirmou o isolamento entre arquivos de endereços diferentes e aprovou a integração descrita no bloco 04. O navegador controlável disponível não expõe essas extensões. Ed25519 determinística funcionou com as bibliotecas e fixture selecionadas; isso não certifica portabilidade de todas as wallets. As limitações demonstradas foram mantidas na decisão de integração; compatibilidade física mobile continua pendente. Preservar os aceites de QR já existentes, sem repetir sua matriz porque seu código não mudou.

A disponibilidade atual das APIs nativas não foi comprovada: MetaMask desaconselha as APIs antigas; a criptografia de deeplinks de Phantom/Backpack usa chaves novas de sessão, sem demonstrar recuperação estável em outro aparelho.

Referências primárias: [EIP-191](https://eips.ethereum.org/EIPS/eip-191), [ECDSA determinística](https://www.rfc-editor.org/rfc/rfc6979), [Ed25519](https://www.rfc-editor.org/rfc/rfc8032), [MetaMask](https://metamask.io/news/metamask-api-method-deprecation), [Phantom](https://docs.phantom.com/phantom-deeplinks/encryption) e [Backpack](https://docs.backpack.app/deeplinks/encryption).

**Ponto importante:** este laboratório permanece separado da integração aprovada. O ensaio não dá ao servidor nenhuma chave e não recebe dados reais; QR e seleção de revogação foram preservados no aplicativo.
