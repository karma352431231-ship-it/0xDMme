# Triagem de candidatos criptográficos

Consulta inicial em 30/09/2026 para o item de dependências do bloco 00 e a comparação do bloco 01 do [plano](../DECISOES_E_PLANO_DE_IMPLEMENTACAO.md). Nenhuma biblioteca desta lista foi instalada ou selecionada para o produto. As versões dos protótipos serão fixadas após conferir artefatos publicados, licenças transitivas e compatibilidade; links para branches documentam a consulta, sem definir versões reproduzíveis.

## Mensageria

| Candidato                     | Evidência e licença                                                                                                                    | Compatibilidade a provar                                                                                                                                                                                       | Encaminhamento inicial                                                                                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenMLS                       | Implementação Rust do MLS, RFC 9420, mantida por Phoenix R&D e CE Labs; [MIT](https://github.com/openmls/openmls/blob/main/LICENSE)    | O [README](https://github.com/openmls/openmls) lista WASM e alvos Android/iOS como compilados, mas não testados nem suportados. A feature `js` permite compilar para WASM; isso não prova funcionamento em PWA | Candidato ao protótipo MLS. Exige avaliar bindings, armazenamento, persistência atômica de estado e verificação de credenciais                                          |
| mls-rs                        | Implementação Rust do MLS; [Apache-2.0 ou MIT](https://github.com/awslabs/mls-rs). Declara suporte a WASM e armazenamento configurável | O provedor Web Crypto é experimental. O projeto informa que ainda não recebeu auditoria completa por terceiro                                                                                                  | Alternativa para comparação de interoperabilidade e integração web; não considerar conformidade ao RFC como revisão completa de segurança                               |
| matrix-js-sdk com Rust Crypto | SDK web/Node mantido com patrocínio da Element; [Apache-2.0](https://github.com/matrix-org/matrix-js-sdk/blob/develop/LICENSE)         | O [SDK](https://github.com/matrix-org/matrix-js-sdk) usa bindings WASM de `matrix-sdk-crypto`, IndexedDB, cross-signing e recuperação de chaves                                                                | Referência de integração web. Avaliar dependência do protocolo/servidor Matrix e impacto sobre wallet, metadados, cotas e retenção antes de adotar o SDK ou componentes |
| libsignal                     | Implementação usada pelos clientes Signal; [AGPLv3](https://github.com/signalapp/libsignal#license)                                    | O [projeto](https://github.com/signalapp/libsignal) declara uso fora do Signal sem suporte; o pacote TypeScript inclui addons nativos Node para sistemas desktop                                               | Referência de protocolo e dispositivos. Não tratar o pacote Node como biblioteca pronta para navegador; avaliar licença e manutenção antes de qualquer adoção           |

MLS admite participação assíncrona por key packages e evolução de grupos. Essas propriedades do protocolo não resolvem sozinhas identidade da wallet, autorização de aparelhos, armazenamento offline ou recuperação histórica. Verificar as exigências do [RFC 9420](https://www.rfc-editor.org/rfc/rfc9420.html) na implementação escolhida. Não construir uma variante própria de ratchet, handshake ou formato MLS para contornar dificuldades de integração.

A integração Matrix exige uma comparação específica com as regras do produto. Reutilizar a pilha não aprova federação, serviços de terceiros ou políticas de retenção diferentes. Seu README também alerta que várias instâncias de cliente usando o mesmo armazenamento IndexedDB podem corromper estado criptográfico; o protótipo deve testar múltiplas abas e acesso exclusivo ao estado.

## Cofre e recuperação

O cofre é uma responsabilidade distinta das sessões de mensageria. A biblioteca de mensagens escolhida não será considerada, automaticamente, solução para blocos, manifestos e recuperação do histórico.

No bloco 01, avaliar primitivas de criptografia autenticada de implementações mantidas e APIs nativas compatíveis com os alvos. A prova precisa definir geração/encapsulamento de chaves, nonces, autenticação de formato/identidade/versão e limites de entrada. Web Crypto não é, por si só, protocolo de mensageria ou formato de backup. Não usar assinatura pública de login como segredo nem enviar segredo de recuperação ao servidor.

A recuperação pode reabrir histórico preservado, mas não deve clonar sessões antigas, reautorizar aparelhos revogados ou desfazer bloqueios atuais. Registrar o efeito de manter chaves históricas recuperáveis sobre as garantias de sigilo do protocolo; evitar prometer que forward secrecy de transporte protege um arquivo histórico cuja chave foi comprometida.

## Prova ZK separada

[Semaphore](https://github.com/semaphore-protocol/semaphore), com [licença MIT](https://github.com/semaphore-protocol/semaphore/blob/main/LICENSE), é candidato à prova pequena de pertencimento a grupo: oferece bibliotecas JavaScript para geração e verificação fora da blockchain. Não é uma biblioteca E2EE, nem prova automaticamente posse atual de token, resistência a múltiplas wallets ou anonimato de IP/horário.

Antes do protótipo, fixar versões de circuitos, gerador/verificador de provas e parâmetros; conferir licença da árvore, origem/integridade dos artefatos e auditorias correspondentes à versão efetiva. Os artefatos necessários devem ser servidos localmente, sem buscas em CDN durante uso privado. A prova de viabilidade não integra ZK ao login/chat nem torna anônimos os metadados do sistema.

## Critérios da prova do bloco 01

Usar identidades e mensagens sintéticas, sem wallets pessoais ou dados reais. Registrar a versão efetiva, hash dos artefatos, alvo do navegador e resultados; dados de máquinas/aparelhos continuam em registros privados locais.

| Caso                             | Resultado necessário                                                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Dois aparelhos e entrega offline | Cada aparelho autorizado recebe uma única mensagem após reconexão; reiniciar não reutiliza estado criptográfico incorretamente    |
| Identidade e diretório hostil    | Alterações não autorizadas de chaves/dispositivos falham; primeiro contato e comparação por QR têm limites explícitos             |
| Revogação e grupo                | Aparelho removido não recebe novos segredos; mudanças concorrentes e cliente offline não criam sucesso falso                      |
| Corrupção e replay               | Ciphertext/manifesto adulterado é rejeitado; repetição e rollback têm tratamento explícito                                        |
| Persistência e ciclo de vida     | Interrupção, múltiplas abas, limpeza local e suspensão não causam perda silenciosa de estado                                      |
| Recuperação limpa                | Wallet autorizada mais segredo correto recuperam histórico; segredo errado falha; backup antigo não reativa permissões            |
| Leitura do servidor              | Objetos persistidos não revelam conteúdo ou segredos; logs não contêm material privado                                            |
| Desempenho                       | Medir bundle/WASM, memória, inicialização, encrypt/decrypt, persistência e recuperação; medir prover/verificador ZK separadamente |

Para cada candidato, revisar manutenção da versão, advisories, cobertura e escopo das auditorias, dependências transitivas, processo de atualização e custo operacional. O tamanho de bundle e o consumo ainda não foram medidos. Não concluir que uma biblioteca é segura apenas por licença, popularidade ou nome do mantenedor.

Decisão desta triagem: comparar primeiro as opções MLS e a referência web Matrix; manter libsignal como referência enquanto a integração browser e o uso externo não estiverem resolvidos. É uma ordem de investigação, sem adoção final, instalação ou exclusão definitiva de alternativas.

**Ponto importante:** esta triagem conclui o levantamento inicial de candidatos, sem validar criptografia. A seleção exige os testes do bloco 01; histórico real e garantias públicas continuam bloqueados até essa validação.
