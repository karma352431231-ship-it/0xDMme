# Bloco 01 — ensaios criptográficos e decisão técnica

Estado: **ensaios locais implementados; aceite final pendente**. Existem protótipos isolados de mensagens, revogação/rotação, cofre/recuperação e ZK. O proprietário informou que testará Android/iPhone mais tarde. Seleção definitiva depende dessa validação e das condições registradas aqui; não declarar o bloco 01 concluído nem liberar histórico real no [plano](../DECISOES_E_PLANO_DE_IMPLEMENTACAO.md).

## Modelo de ameaças inicial

| Ameaça                                      | Controle ou limite a demonstrar                                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Leitura do relay e de seus arquivos         | Apenas chaves públicas e pacotes cifrados; segredos e conteúdo legível nos clientes                                 |
| Diretório substitui chaves                  | Cliente compara a chave de assinatura por canal confiável antes de autorizar; mudanças exigem nova autorização      |
| Alteração de ciphertext ou autoria          | Motor criptográfico verifica a mensagem; aplicação confere as chaves de origem fixadas                              |
| Leitor não autorizado obtém os pacotes      | Sem as chaves privadas destinadas ao aparelho autorizado, não abre a mensagem nem o pacote de chave                 |
| Frontend, extensão ou aparelho comprometido | Fora da proteção demonstrada pela E2EE; distribuição/atualização e revisão de dependências continuam necessárias    |
| Relay omite, repete ou perde dados          | Criptografia não demonstra entrega ou durabilidade; requer protocolo de persistência/idempotência e testes próprios |
| Recuperação reativa permissão antiga        | Histórico e autorização devem ser separados; cofre, recuperação e revogação ainda não implementados                 |
| Correlação por identidade, rede e tamanho   | O ensaio não oferece anonimato nem oculta os metadados de transporte                                                |

Identidades Alice/Bob são fixtures, sem wallet ou autenticação de conta. O relay tem tokens de sessão locais distribuídos à própria tela de laboratório; não são credenciais de usuários reais. O ensaio não demonstra isolamento entre contas nem resistência de autenticação a terceiros. Backend hostil pode negar serviço; não pode ser tratado como fonte confiável para a comparação inicial das chaves.

## Escolha para este ensaio

Os [bindings oficiais OpenMLS](https://github.com/openmls/openmls/tree/main/openmls-wasm) se apresentam como experimento e incluem operações ainda não suportadas. Para obter a primeira evidência browser, usar o [motor Matrix WASM](https://github.com/matrix-org/matrix-sdk-crypto-wasm) isoladamente, sem SDK completo, homeserver, federação ou serviço externo. A comparação MLS continua aberta conforme a [triagem](CRIPTOGRAFIA_CANDIDATOS.md).

O pacote tem licença Apache-2.0, não declara dependências npm de runtime e inclui o WASM pré-compilado. Instalado como dependência de desenvolvimento exclusiva do laboratório, com versão e integridade fixadas no lockfile e scripts de instalação desabilitados. O registro informou aproximadamente 8,9 MB descompactados; isso não é tamanho de bundle nem medida de consumo. Conferir também as dependências Rust embutidas e o escopo das auditorias antes da seleção final.

O motor gera as chaves, estabelece sessões Olm, distribui chaves de sala cifradas e cifra o texto com Megolm. O código próprio adapta seu transporte e política de autorização; não implementa ratchet, primitiva ou handshake criptográfico. A confirmação manual fixa a chave Ed25519 apresentada na outra tela e a Curve25519 autenticada pelo diretório assinado. O ensaio usa `onlyTrustedDevices` para distribuir chaves e confere ambas as chaves de origem na mensagem decifrada antes de expor texto.

Não há identidade cross-signed neste ensaio: `TrustRequirement.Untrusted` desativa somente a exigência nativa de cross-signing, enquanto os pins obrigatórios aplicam a política manual deste teste. Não há fallback após erro nem aceitação automática de chave. Esse caminho precisa de revisão própria; não equivale à autorização vinculada à wallet ou à verificação entre pessoas. A comparação entre duas telas locais é o canal de confiança controlado do laboratório, não uma solução distribuída de primeiro contato. Encaminhamento e pedidos automáticos de chaves estão desabilitados.

## Executar

Usar o Node/npm da preparação. A instalação continua por `npm ci --ignore-scripts`.

```bash
npm run probe:zk:prepare
npm run probe:crypto
```

O primeiro comando baixa dois artefatos públicos fixados e confere tamanho/SHA-256. Arquivos ficam em `.local/zk/`, ignorados pelo Git; arquivos válidos são reutilizados. Ausência/corrupção falha explicitamente, sem fallback para CDN durante uso privado. O CI prepara esses artefatos antes dos testes.

Abrir `http://127.0.0.1:45101/`. A página mostra dois clientes em contextos separados; também permite abrir Alice e Bob em abas individuais. Escolher somente uma forma por sessão, para não criar instâncias concorrentes do mesmo cliente.

1. Copiar a chave pública de Bob para o campo correspondente de Alice, e vice-versa.
2. Clicar **Conferir e autorizar** nas duas telas.
3. Enviar texto fictício e clicar **Buscar mensagens** no destinatário.
4. Usar o link de pacotes do servidor para observar os envelopes cifrados.
5. Após ida/resposta, clicar **Revogar outro dispositivo e testar rotação** no remetente. O destinatário conserva o texto anterior; não abre o novo pacote.

Desconexão neste ensaio significa que o destinatário deixa de buscar, mantendo seu estado criptográfico no cliente. Recarregar/fechar a tela descarta chaves em memória. Para uma nova sessão, encerrar o comando com Ctrl+C, iniciar novamente e abrir/recarregar as telas. Não usar dados reais.

O servidor escuta somente loopback, rejeita origem/Host diferentes, serve apenas assets autorizados e não carrega `.env`. Usa CSP, WASM local com MIME `application/wasm`, limites de entrada/conexões e timeout de requests. O cliente limita texto a 1.000 caracteres; o relay limita a 32 mensagens e 32 pacotes de chave por destinatário, sem apagar os existentes ao atingir o teto. São limites do laboratório, sem substituir as cotas do produto. Não possui banco, armazenamento persistente, TTL de mensagens aceitas, telemetria ou logs de conteúdo. Encerrar o laboratório descarta seu estado sintético; nenhuma mensagem recebe promessa de aceitação durável.

## Revogação e replay

Revogação usa bloqueio de confiança do motor e `invalidateGroupSession`. O envio seguinte tem outra sessão e não compartilha chave com o removido. Operações são serializadas para que envio/revogação concorrentes não reutilizem a sessão antiga. É uma prova local de distribuição de segredos, sem lista de aparelhos autenticada por wallet ou consenso de grupo.

Cada conteúdo cifrado inclui UUID: reapresentação com outro identificador do relay e conflitos são rejeitados. Mapas são limitados a 32 mensagens/pacotes e voláteis; persistência atômica será necessária na integração. O motor sozinho não demonstrou deduplicação pelo identificador do relay; não atribuir a ele esse controle da aplicação.

## Cofre e recuperação

Abrir `/vault.html`, gerar segredo fictício, criar cofre e guardar o envelope. Abrir a página em contexto sem estado anterior, buscar o envelope e inserir o segredo separadamente. **Abrir histórico localmente** recupera texto; segredo errado falha. Não usar wallet, senha ou assinatura de login como segredo.

Usa [AES-GCM do Web Crypto](https://www.w3.org/TR/WebCryptoAPI/#aes-gcm): chave de dados nova de 256 bits por snapshot, IVs aleatórios de 96 bits, tags de 128 bits e segredo aleatório de recuperação de 256 bits para encapsular a chave. Domínio, versão, identidade e revisão são dados autenticados de conteúdo e encapsulamento. Não há derivação de senha ou handshake próprio. Máximo: 32 registros, 32.000 bytes de conteúdo e 32 gravações por sessão. API normal recusa revisão antiga substituindo o envelope atual.

Payload contém somente identidade sintética, revisão e histórico, sem permissões, dispositivos, bloqueios ou estado Olm. Backup antigo válido abre para consulta, sem reativar sessão de envio. Alterações de ciphertext, chave encapsulada, IVs, revisão, identidade, versão ou campos inesperados falham. Não existem chave mestra ou recuperação administrativa.

Uma página independente recuperou o envelope no navegador sem máquina ou chave de dados anterior. Isso prova recuperação criptográfica do histórico sintético; autenticação pela wallet original pertence aos blocos 03/04. Servidor hostil pode omitir ou reapresentar snapshot antigo válido: AEAD não garante atualidade. Checkpoints autenticados e conflitos precisam distinguir restauração histórica de estado atual. Buffers são limpos quando possível; strings/navegador não garantem apagamento físico.

## Prova ZK separada

Abrir `/zk.html` e clicar **Gerar e verificar prova ZK**, ou executar `npm run probe:zk`. CLI usa processo exclusivo com encerramento dos workers; browser encerra worker dedicado ao concluir, sair ou atingir 45 segundos. Sem transação, RPC, wallet real ou integração com chat/login.

Semaphore identity/group/proof **4.14.3**, artefatos **4.13.0**, profundidade **4**, oito identidades fictícias. Gera/verifica prova Groth16 real; alteração de mensagem/raiz falha. Verificador exige raiz confiável, escopo e operação previstos, recusando raiz do solicitante. Reutilização concorrente admite apenas uma operação por nullifier no processo; teto de 32 admissões e duas verificações simultâneas. Raiz atualizada sem o membro rejeita sua prova antiga. Publicação autenticada de raízes e persistência dos nullifiers não estão integradas.

Artefatos: WASM 1.804.630 bytes e zkey 1.852.550 bytes. Hashes em `src/shared/zk-probe/index.ts`, fixados após download HTTPS oficial e conferidos em geração/verificação com a chave do SDK. Isso permite reprodução, sem atestação independente dos binários. O [SDK](https://js.semaphore.pse.dev/functions/_semaphore_protocol_proof.generateProof.html) aceita artefatos explícitos; não usar download automático de `latest`.

A [documentação de auditorias](https://docs.semaphore.pse.dev/) lista circuitos/contratos/bibliotecas 4.0.0; não chamar 4.14.3 ou este adaptador de auditados por isso. Semaphore é MIT; `snarkjs`, `ffjavascript` e ferramentas transitivas incluem GPL-3.0. Resolver compatibilidade com a licença de distribuição antes de incorporar o gerador no produto. O ensaio não muda a licença do repositório.

Overrides restritos removem alertas transitivos: `ws` 8.21.0, `underscore` 1.13.8, `circom_tester` 0.0.24 sob `circomkit` (remove snarkjs antigo). Caminho exercitado usa snarkjs 0.7.5, sem compilação de circuitos próprios/CLIs transitivos. Lockfile e instalação sem scripts preservados. Consulta npm não cobre Rust embutido no WASM nem falhas desconhecidas. Esbuild 0.28.2/MIT empacota somente o worker ZK em memória, sem bundle versionado.

Grupo pequeno, prova e nullifier não ocultam IP, horário, sessão ou emissão de credenciais; não prometer anonimato neste ensaio.

## Evidência, medidas e aceite

Testes cobrem ida/resposta, offline sem polling, chave esperada, corrupção, autoria, campos privados, leitor com chaves novas, diretório adulterado, revogação/rotação, envio concorrente e replay. Cofre cobre recuperação, segredo errado, adulteração, formato e backup antigo sem autorização. ZK cobre prova real, alteração, remoção, contexto e replay concorrente. Transporte interrompe respostas acima de 1.200.000 bytes antes de JSON/WASM e recusa UTF-8/status inválidos. `npm run check` reúne esses testes e os controles da base.

Navegador integrado: ida/resposta, revogação impedindo leitura futura, cofre com leitor independente, segredo errado e prova ZK foram exercitados. `npm run probe:measure` mede inicialização, primeiro envio, mediana de dez envios/decifragens de 512 bytes, cofre, WASM e memória. Grava somente em `.local/BLOCO_01_MEDIDAS_NODE.json`. Tempos browser e dados de ambiente ficam em registros privados; não são medidas de celular, rede ou metas de produção. Não houve teste Android/iOS nem execução remota do CI.

TypeScript mantém `strict` e lint com tipos. Resolução `Bundler` aceita declarações publicadas do Semaphore com caminhos sem extensão incompatíveis com NodeNext. Imports relativos autorais continuam exigindo `.ts` por regra bloqueante e teste de falha. Fronteiras/ciclos e thresholds originais continuam bloqueantes, sem `skipLibCheck`, supressões ou exclusões autorais.

## Decisão e critérios restantes

| Parte     | Decisão do ensaio                                                       | Condição para adoção                                                       |
| --------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Mensagens | Matrix WASM como referência executável, sem homeserver/federação        | Celulares, revisão de autorização/persistência/atualização e árvore Rust   |
| MLS       | Comparação mantida; bindings web experimentais impedem escolha imediata | Integração verificável antes de propor troca, sem criptografia própria     |
| libsignal | Referência; pacote nativo/suporte externo não atende diretamente à PWA  | Resolver bindings e licença                                                |
| Cofre     | Web Crypto AES-GCM; formato descartável de snapshot histórico           | Revisar blocos/manifestos, checkpoints e vínculo com conta                 |
| ZK        | Semaphore demonstra viabilidade computacional local, fora do chat       | Celulares, licença, raízes/nullifiers persistentes no bloco correspondente |

A [release Matrix 18.9.0](https://github.com/matrix-org/matrix-sdk-crypto-wasm/releases/tag/v18.9.0) usa matrix-rust-sdk 0.19.1. Seu [Cargo.lock](https://github.com/matrix-org/matrix-sdk-crypto-wasm/blob/v18.9.0/Cargo.lock) inclui vodozemac 0.11.0; a [auditoria publicada de vodozemac](https://github.com/matrix-org/vodozemac#security-notes) não certifica automaticamente essa versão, o binário WASM ou este adaptador. Lockfile npm não inventaria licenças/advisories Rust por completo. Seleção para produto depende dessa revisão e dos aparelhos, não apenas de testes.

Roteiro Android/iPhone: registrar modelo/OS/build/navegador somente localmente; testar ida/resposta, suspensão do polling, chave errada, revogação, recuperação sem estado anterior e ZK; registrar sucesso/falha e tempos. Usar origem HTTPS de teste controlada e dados fictícios. O laboratório escuta loopback: `127.0.0.1` no celular aponta ao celular. Preparar a origem quando os aparelhos estiverem disponíveis; viewport/emulação não substituem teste físico.

Integração posterior ainda exige vínculo wallet/dispositivos, lista assinada, grupos reais, persistência atômica, exclusão entre abas, interrupção/reinício e checkpoints de atualidade. O ensaio não demonstra sucesso nesses cenários. Aceite final e seleção definitiva permanecem pendentes dos aparelhos e das condições de revisão/licença; não liberar histórico real.

**Ponto importante:** ensaios locais de mensagens, revogação, cofre e ZK implementados com evidência de falhas rejeitadas. O aceite final do bloco 01 continua pendente; isso não constitui auditoria, protocolo definitivo ou chat pronto para dados reais.
