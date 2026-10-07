# 0xDMme — Bloco 04 — dispositivos, chaves e recuperação

## Continuidade do login mobile — correção solicitada em 07/10/2026

O login mobile passa a recolher a prova pública de acesso e a prova privada de
abertura na mesma visita à wallet. Antes de navegar, o navegador original guarda
um receptor de transporte com chaves não exportáveis em IndexedDB. O ticket
inclui compromisso SHA-256 do receptor, nonce e wallet; a página da wallet confere
esse compromisso antes de cifrar a prova privada. As assinaturas de recuperação
continuam exclusivas e secretas: somente seu envelope RSA-OAEP/AES-GCM chega ao
servidor. A assinatura pública de login não deriva chaves de conteúdo.

Após verificar a assinatura pública, o backend consulta o identificador da conta
existente ou prepara um UUID ainda não persistido. Ele fornece a configuração de
recuperação vigente, ou os parâmetros públicos de uma configuração nova. Isso
não cria conta, sessão ou autorização na wallet. A confirmação explícita no
navegador original permanece obrigatória e só avança depois do retorno cifrado.
A criação da conta continua na transação original: um conflito de identificador
recusa a tentativa, sem criar uma identidade alternativa ou sobrescrever outra.

O navegador original abre a prova cifrada, confere conta/origem/destino e conclui
a autorização pelo contrato existente de aparelhos antes de liberar o cofre. Não
reabre a wallet nessa etapa. Inicialização conserva as duas assinaturas iguais;
recuperação conserva uma assinatura e preserva os aparelhos anteriores. QR,
revogação, épocas, cápsulas e formatos existentes continuam aplicáveis. Contas
com recuperação por código antigo exigem seu fluxo autorizado de recuperação.

O transporte novo mantém até 128 entradas de cinco minutos, com envelope de até
2 KiB. Ele guarda somente metadados públicos e ciphertext. O destinatário é
vinculado à sessão original após confirmação. A leitura pode ser retomada por
essa sessão até confirmar a conclusão; expiração ou reinício encerra o retorno.
No cliente há um único registro de receptor, com validade de cinco minutos para
reuso, e um único pedido público em IndexedDB pelo mesmo prazo; assinaturas privadas não são
persistidas. Foco, visibilidade e retorno de página revalidam as chaves e retomam
pedidos válidos sem nova navegação automática. Uma sessão antiga ainda incompleta
oferece **Concluir entrada na conta** junto ao aviso, usando o login combinado.

Reteste físico relatado em 07/10/2026 reabriu a pendência: perda do pedido no
Android, Backpack chegando sem contexto e links de instalação no iPhone.
A reprodução local confirmou que um ACK recusado com 409 de uma sessão anterior
apagava o pedido novo; também confirmou perda dos metadados ao recriar a aba.
O ACK agora conserva pedidos recusados e só limpa o ticket que confirmou,
sem remover um substituto recebido enquanto aguardava a resposta. Os metadados
públicos acompanham o receptor não exportável em IndexedDB: outra aba do mesmo
navegador só conclui com o cookie original, receptor exato, sessão e CSRF
vinculados pelo servidor. Não há recuperação em outro navegador nem assinatura
privada persistida. A leitura não renova o prazo; cancelamento e expiração limpam
o registro. Entradas já emitidas na aba conservam compatibilidade temporária.
Restaurar uma sessão existente também consulta o pedido público, e a tela não
oculta sua confirmação por já haver conta conectada. O endereço ainda precisa
ser confirmado explicitamente; enquanto houver sessão, exigir a mesma conta.

Backpack Android mantém seu link HTTPS v1 e destino query, mas passa a receber
o documento final `/wallet-approval`, como no iPhone, sem fragmento, RPC inicial
ou History API. Isso elimina etapas de entrega no cliente; o D1 informado ainda
não comprova a causa interna da perda. Cookies, validação e prazo permanecem.
MetaMask/Phantom no iPhone usam respectivamente `metamask://dapp/` e
`phantom://browse/`, handlers dos apps instalados, com o mesmo destino HTTPS
próprio e pedido preparado antes da tentativa. Android conserva seus links.
O botão explícito usa o mesmo destino se a tentativa automática for bloqueada.
Não detectar instalação nem simular sucesso a partir da navegação.
Os esquemas são previstos pela [Phantom](https://docs.phantom.com/phantom-deeplinks/deeplinks-ios-and-android)
e pelo [handler MetaMask](https://github.com/MetaMask/metamask-mobile/blob/main/app/core/DeeplinkManager/utils/parseDeeplink.ts).
A Phantom prefere universal links; o caminho nativo restringe a tentativa iOS
ao app instalado para evitar navegar para a página web de instalação. O relato
confirma a falha HTTPS, mas a associação publicada não revela o motivo interno
no aparelho. O handler e a configuração sintéticos não garantem abertura física.

Links novos da Phantom usam `phantom.com`, conforme sua
[documentação](https://docs.phantom.com/phantom-deeplinks/deeplinks-ios-and-android).
Pedidos privados válidos já preparados com o host anterior continuam reconhecidos.
A instrução antiga de tocar em “Concluir recuperação” foi ajustada à conclusão
automática. Nenhuma nova dependência, relay externo, migração SQL ou mudança de
infraestrutura faz parte desta correção local.

Validação local: assinaturas reais de contas sintéticas em EVM/Solana com os três
contratos de wallet, prova cifrada, autorização inicial, alteração da visibilidade
por wallet e retomada por foco/visibilidade/página. Recuperação de outro aparelho
conserva o anterior e usa uma assinatura. PostgreSQL/HTTP conferiu conta estável,
criação somente na confirmação original, envelope opaco, origem, sessão, CSRF,
consumo e replay. Build inclui as fontes correspondentes dos módulos novos.

O proprietário autorizou publicar e ativar esta correção na VPS, e continuar após
compactações até concluir essa ativação. Usar o executor existente, checkout
limpo/enviado, CI do commit exato, limites, preservação e retorno da release.

**Ponto importante:** a validação usa providers e contas sintéticas; não certifica
abertura e retorno das wallets físicas. O cofre permanece protegido até conferir
a prova privada e a autoridade do aparelho. Release `91a82e8` ativa na VPS de
testes, com CI integral, prontidão HTTPS, hashes públicos e preservação de banco,
objetos/configurações/processos conferidos. Ver o
[registro de deploy](GIT_E_DEPLOY.md#continuidade-do-login-mobile--ativação-autorizada-em-07102026).

## Experiência vigente em 04/10/2026

Em Configurações, o aparelho de origem gera QR e código equivalentes. O destino recebe sessão da mesma conta e cria sua identidade local sem wallet. O segredo do convite fixa a raiz e autentica as chaves do destino por HMAC-SHA-256; a origem confere e assina o vínculo automaticamente. Ela precisa permanecer aberta e visível até concluir. O backend guarda somente hash/capacidade temporária, jamais as chaves do conteúdo. Convite vale cinco minutos, é consumido uma única vez e o serviço mantém no máximo 128 convites temporários. Reiniciar o serviço encerra esses convites, sem revogar vínculos concluídos.

No destino vinculado, leitura com as chaves e uso comum são permitidos. Autorizar outro aparelho, revogar e resetar exigem a wallet da mesma conta. Uma confirmação vale durante a sessão atual; o banco confere a capacidade em cada operação. Revogação encerra sessões e direitos remotos, sem prometer apagar cópias externas. Login posterior pela wallet original reutiliza a conta e cria outra identidade caso a anterior esteja revogada. Login abre/recupera chaves automaticamente; não apresenta configuração técnica nem escolha de aparelhos a revogar. Aparelhos anteriores são preservados até revogação explícita em Configurações.

Migração local `019-linked-sessions.sql` distingue confirmação por wallet de sessão vinculada. Não foi autorizada nem ativada na VPS por esta implementação. Limites anteriores de identidade/eventos, criptografia, consentimento e distribuição de fontes permanecem aplicáveis.

Os fluxos de QR em duas direções, aprovação manual, comparação e seleção durante recuperação descritos abaixo são registros históricos substituídos. Validações criptográficas anteriores continuam relevantes.

Publicação autorizada separadamente em 02/10/2026: o proprietário aprovou ativar a entrega dos blocos 04–05, incluindo QR e migrações, após revisão de backup/retorno e manutenção limitada ao serviço próprio. Os vetos de publicação abaixo descrevem o escopo da implementação local anterior. A execução segue o [procedimento específico](GIT_E_DEPLOY.md); aprovação não equivale a ativação concluída ou aceite físico mobile.

Estado em 02/10/2026: bloco concluído localmente com implementação e revisão no Mac. O proprietário autorizou concluir o bloco sem novas pausas por compactação e considerar o trabalho concluído após implementação e revisão no Mac, deixando o aceite físico mobile para depois. Isso não autoriza publicar migrações na VPS ou usar conversas reais. [Plano aprovado](../DECISOES_E_PLANO_DE_IMPLEMENTACAO.md).

## Correção de retomada mobile em 05/10/2026

O proprietário relatou abertura repetida da MetaMask após login, carregamento demorado e atualização recusada sem operação visível. A inspeção confirmou que um pedido privado expirado permanecia em memória, era consultado novamente e conservava o bloqueio de atualização; a restauração também iniciava outra abertura de wallet quando ainda faltava autorização local. Essas falhas não demonstram a causa física exata da página indisponível observada na MetaMask.

Restaurar sessão passa a abrir somente chaves locais e retomar retorno válido, sem navegação automática para a wallet. Novo login mantém a abertura automática aprovada. Sem autorização local, Configurações → Aparelhos oferece **Abrir conta**, que retoma a mesma prova privada; sessão de login sozinha continua sem acesso E2EE. Voltar pelo cache de navegação revalida a autorização. Expiração remove somente metadados do pedido próprio, preservando identidades, checkpoints e conteúdo. Recusa 409 de um retorno encerrado pelo servidor interrompe as consultas, enquanto falha de rede preserva pedido ainda válido. Um resultado recebido depois do prazo ou da troca de pedido não conclui a recuperação.

A atualização informa quando há abertura ou vinculação pendente e onde concluir/cancelar. Entrada de recuperação encerrada entrega documento identificado como recusado, com assinatura desabilitada e aviso fixo, sem sessão nova, sem consulta/assinatura automática e sem valores externos no erro. APIs continuam recusando pedidos consumidos, expirados ou divergentes. Link, origem, prova privada e transporte cifrado permanecem os mesmos.

Validação: regressões de restauração/login, autorização existente, pedido expirado e guarda de atualização passaram; PostgreSQL/HTTP confirmou documento recusado após consumo, sem novo cookie e mantendo recusa na API. Login fictício no navegador integrado configurou chaves automaticamente e a recarga conservou autorização/perfil, sem erros de console. [Checks completos da correção](BLOCO_02_BASE_WEB.md#correção-de-carregamento-mobile-em-05102026). Limites de complexidade/dependências passaram sem novas exceções; a mudança não adiciona tabela, dependência, relay ou telemetria.

Publicação autorizada e verificada em 05/10/2026: release `793bf21` ativa na VPS de testes após CI integral aprovada e deploy de rotina. Manifesto, assets públicos, preservação, prontidão e retenção da release anterior conferidos; banco, dependências e serviços compartilhados preservados. [Registro do deploy](GIT_E_DEPLOY.md#ativação-da-correção-mobile--autorizada-em-05102026).

**Ponto importante:** esta correção não trata login público como chave de conteúdo e não apaga armazenamento do navegador. A reprodução física na MetaMask/Chrome ainda depende do reteste; publicação não substitui esse aceite.

## Entrega

Revisão autorizada em 02/10/2026: o proprietário confirmou o ensaio entre arquivos de contas distintas e aprovou integrar recuperação por assinatura exclusiva da wallet, substituindo a obrigação de guardar código nas novas configurações. Aprovou também retorno cifrado para o navegador original no mobile, preservando QR e seleção de revogação. A assinatura exclusiva é segredo do cliente; não usar o retorno público de assinaturas de login. Contas legadas conservam seu fluxo até uma migração explícita autorizada pelo código antigo; essa transição deve preservar épocas históricas e invalidar a autoridade antiga. Os resultados descritos abaixo são da implementação anterior; a validação da revisão será registrada separadamente. A aprovação não garante repetibilidade entre wallets nem elimina o risco demonstrado de vazamento da assinatura.

Complemento solicitado e implementado localmente em 02/10/2026: QR obrigatório com geração/leitura local nas duas direções; recuperação com escolha explícita dos aparelhos a revogar, incluindo nenhum, com todos mantidos por padrão. Esta decisão substitui a revogação automática de todos. A implementação anterior e suas verificações permanecem como evidência histórica; o resultado do complemento está registrado abaixo.

- Identidade própria por conta/aparelho: chave de assinatura ECDSA P-256 e chave de encapsulamento RSA-OAEP de 3072 bits/SHA-256, geradas pelo Web Crypto. Chaves privadas não exportáveis, persistidas em IndexedDB antes de publicar autorização. A identidade não vem de assinatura de login, seed ou chave da wallet.
- Lista de dispositivos assinada, com eventos versionados encadeados por SHA-256, raiz de recuperação fixada no cliente e verificação das transições em ambos os lados. Um login isolado continua sem fornecer as chaves. O servidor não tem uma chave capaz de criar autorização válida sob a raiz confiada pelo cliente.
- Vinculação por **QR Code e código**. O novo aparelho gera pedido com suas chaves, nonce aleatório de 256 bits, assinatura de posse e prazo fixo de até cinco minutos, calculado com o horário do servidor. O aparelho existente lê o QR, confere o aparelho e confirma explicitamente. O novo aparelho lê o QR de confirmação de 128 bits mostrado pelo aprovador antes de confiar na raiz e abrir as chaves. O código textual permanece disponível. Nenhum serviço externo recebe códigos ou imagens da câmera.
- Recuperação pela assinatura exclusiva da wallet original. HKDF-SHA-256 deriva AES-256-GCM no cliente com salt de 256 bits e separação de domínio. Configuração exige duas assinaturas iguais e teste de abertura da cápsula; recuperar repete a mesma mensagem. A pessoa não anota código. Assinatura e chave não vão em claro ao servidor, logs ou Service Worker. Código antigo permanece somente em contas ainda não migradas.
- Revogação de outro aparelho autorizado com confirmação explícita. A alteração encerra suas sessões, remove sua autorização, cria uma nova época AES-256-GCM e distribui as chaves apenas aos aparelhos restantes e à recuperação. O perfil existente é aberto e recifrado localmente; sua atualização é atômica com a alteração do diretório.
- Recuperação em um novo cadastro, com a **wallet original e a assinatura exclusiva** (código nas contas legadas), sem aparelho anterior. Ela preserva as chaves históricas, recifra o perfil na nova época, autoriza o novo aparelho e revoga somente os anteriores escolhidos pelo usuário. Nenhum é selecionado por padrão; os mantidos recebem as novas chaves e conservam sessões. A escolha fica vinculada à revisão conferida; concorrência exige nova conferência. Não restaura sessões Olm antigas nem troca a wallet.

## Fronteiras e confiança

Web Crypto fornece as primitivas, conforme a [especificação W3C](https://www.w3.org/TR/WebCryptoAPI/): AES-GCM com nonce aleatório de 96 bits e tag de 128 bits; ECDSA P-256/SHA-256; RSA-OAEP/SHA-256 encapsulando uma chave AES aleatória. AAD e label vinculam os envelopes à versão, conta, época e destinatário. Não há primitiva, ratchet ou protocolo de mensagens implementado à mão. Olm/Megolm da biblioteca Matrix permanece o caminho selecionado para **mensagens**, a integrar no bloco responsável; as chaves desta etapa autorizam e protegem o cofre/perfil, sem representar sessões Matrix prontas.

A autoridade de recuperação possui assinatura e encapsulamento próprios. Suas chaves privadas ficam em cápsula cifrada sob o segredo de recuperação. Aparelhos recebem as chaves AES do cofre e a raiz **pública**, permitindo encapsular novas épocas para a recuperação sem receber sua chave privada ou seu segredo. Só aparelhos ainda presentes no estado anterior assinam vinculações/revogações; a autoridade de recuperação assina a inicialização e a recuperação. Identificadores revogados não podem reaparecer na lista.

O vínculo com a conta usa o login da wallet original e a conta estável existentes. A confiança inicial nasce da configuração explícita feita no cliente. Aparelhos posteriores fixam essa mesma raiz pelo código de confirmação ou pela abertura autenticada da cápsula com a assinatura exclusiva, ou código ainda vigente em conta legada; não confiam automaticamente no diretório entregue pelo servidor. Não há registro de transparência público ou atestação on-chain da raiz. Um servidor que controla o JavaScript entregue ao navegador, extensão/aparelho comprometido ou usuário que autoriza o código de um atacante continua fora da proteção prometida.

Checkpoints locais detectam diretório antigo, alteração de raiz, eventos omitidos, sequência divergente e conflitos em relação ao estado já observado. Um cliente limpo não tem prova externa de qual é a última versão: o servidor ainda pode negar serviço ou ocultar um sufixo de eventos que ele nunca viu. Não anunciar transparência/frescura global. Antes de distribuir chaves de mensagens, o bloco de chat deverá fixar as identidades Matrix na autoridade aprovada, coordenar seus checkpoints e invalidar sessões de grupo antes do envio após revogação.

## Persistência, concorrência e recursos

As migrações novas `004-devices.sql` e `005-link-consumption.sql` preservam as migrações 001–003, contas, cookies e identificadores históricos. O complemento de QR/seleção não exige migração adicional. O módulo database continua dono de todas as tabelas; handlers HTTP só adaptam o transporte, autenticam sessão/origem/CSRF e chamam operações. A fonte do frontend inclui os módulos novos e a biblioteca de QR revisada. A câmera é permitida apenas à própria origem e iniciada explicitamente, sem microfone.

Cada mutação revalida sessão e cabeça do diretório sob lock da conta. Consumo do pedido, gravação do evento/cabeça, atualização cifrada do perfil e encerramento de sessões revogadas entram na mesma transação curta. Criptografia/verificação e leitura HTTP ocorrem fora dela. Atualizações concorrentes não fundem permissões silenciosamente: uma vence; a outra recebe conflito e precisa ser conferida novamente. O perfil configurado só aceita escrita com assinatura de aparelho atual vinculada à cabeça e à revisão; o endpoint legado não pode sobrescrevê-lo com mero login. No cliente, cada chave de edição conserva sua época: observar uma revogação em outra aba não permite assinar dados ainda cifrados com a chave anterior. Essa gravação falha explicitamente e exige recarregar o perfil.

A escrita do perfil legado também usa esse lock e uma leitura SQL posterior à espera. Uma regressão concorrente reproduziu e corrigiu o caso de uma gravação iniciada antes da primeira configuração atravessar a autorização recém-criada quando a verificação ocorria apenas no snapshot de um `UPDATE` bloqueado.

Um código assinado não pode prorrogar seu próprio prazo. Pedidos cancelados ou consumidos ficam marcados até o prazo original; reapresentar o mesmo pedido falha. Depois da limpeza, seu prazo assinado já expirou. Limpeza de pedidos usa lotes de 64, com autovacuum precoce; não elimina eventos aceitos ou chaves históricas.

Orçamentos explícitos da base: até 32 cadastros/identificadores por conta, incluindo revogados, conforme a admissão já existente; até 128 eventos de autoridade de no máximo 64 KiB; leitura paginada de oito eventos; material cifrado de chaves de até 8 KiB; 256 pedidos temporários globais; quatro operações HTTP simultâneas, corpo com teto e deadline de 5 s; pool existente de quatro conexões. O perfil mantém os **3 MB** aprovados: o evento assina seu hash e a API recebe seu envelope separado, sem embutir a foto no log de autoridade. O diretório tem orçamento máximo aproximado de 16 MiB lógicos entre log e estado/índices; medir a alocação física com PostgreSQL antes da V1 e integrar a contabilização ao cofre. A base recusa explicitamente novas alterações quando seu orçamento de metadados termina, preservando as aceitas; não apresenta esse limite como armazenamento ilimitado. A evolução/compactação autenticada desse log precisa preservar checkpoints antes de ampliar o orçamento.

Esses limites contam **metadados de autorização**, não mensagens nem o teto do cofre. Os 32 incluem todos os identificadores cadastrados ao longo do tempo, mesmo revogados: dois ativos e trinta antigos já ocupam as 32 vagas. Navegador novo, perfil novo ou novo cadastro após perder armazenamento pode ocupar outra vaga; reconhecer o mesmo identificador não gasta outra. Hoje não existe reciclagem autenticada dessas vagas, portanto o teto pode impedir vinculação/recuperação em novo cadastro mesmo com a wallet e o segredo corretos. Os 128 eventos contam configuração, vínculos, revogações e recuperações, sem contar edição do perfil/conversas; são um teto defensivo separado. Com as regras atuais de 32 identificadores cumulativos, a admissão tende a bloquear antes de 128 eventos. Os 64 KiB limitam cada alteração assinada, sem embutir fotos ou conversas. Atingir um orçamento recusa a alteração nova, sem apagar dados aceitos. Esses orçamentos precisam de uma evolução autenticada antes de serem apresentados como política final da V1; não foram alterados no complemento solicitado.

O QR usa `qr@0.7.2`, pacote ESM sem dependências de runtime, sob a opção MIT de sua licença dupla. A versão, fontes TypeScript entregues, avisos e manutenção recente foram revisados ([pacote e manutenção oficiais](https://github.com/paulmillr/qr)). O leitor independe de `BarcodeDetector` nativo. Tipos e prefixos de pedido/confirmação são distintos; um QR estranho não navega nem concede autorização. A câmera só abre por clique, sem áudio, processa até 960 × 960 pixels a cada 250 ms e limita os retries opcionais do decoder a 16 ms. Permissão pendente tem prazo de dez segundos, leitura aberta de um minuto. Conclusão, cancelamento, erro, ocultação, saída da seção ou sessão encerram tracks e descartam o canvas; uma permissão que chega tarde também é encerrada. Quadros nunca são enviados à rede, armazenados ou registrados. HTTPS/permissão e foco da câmera física permanecem parte do aceite posterior.

O [Web Locks](https://www.w3.org/TR/web-locks/) serializa operações locais entre abas. IndexedDB registra identidades e checkpoints de forma transacional com prazo de 5 s. Na configuração e recuperação, a raiz confirmada é gravada **antes** da publicação, para reconciliar resposta perdida ou reinício. Na migração, conservar a raiz antiga até observar a transição assinada por ela: só então avançar o pin, verificando continuação integral do histórico e comparação atômica do checkpoint. Receber sucesso HTTP sem checkpoint local durável não é anunciado como autorização concluída. Um novo aparelho pode conferir o código do aprovador após recarregar, desde que sua identidade persistida esteja intacta.

Dados cifrados e APIs continuam fora do cache público da PWA. Ativação de atualização fica bloqueada durante operação, recuperação privada ou vinculação pendente. Alterações entre abas sinalizam somente que houve mudança, sem segredos; foco/atualização explícita revalidam o diretório. Logout e mudança de conta descartam os segredos em memória, preservando as chaves privadas locais para o próximo login. Fechar/suspender a página limpa os rascunhos e invalida resultados atrasados. Strings/objetos JavaScript não oferecem garantia de apagamento físico da memória.

## Perda e recuperação incompleta

O [ensaio isolado](ENSAIO_RECUPERACAO_WALLET.md) foi confirmado pelo proprietário com arquivos de contas diferentes, seguido de aprovação para integração. A prova demonstrou que assinaturas EVM válidas podem variar e que uma assinatura exclusiva vazada abre a cápsula pública; isso continua aplicável. Duas assinaturas iguais na configuração não certificam todas as wallets/aparelhos ou atualizações futuras.

- Aparelho perdido: revogar a partir de outro autorizado; ou entrar num cadastro novo com a wallet original e recuperar assinando a mesma mensagem, escolhendo os aparelhos a revogar. Nenhum é selecionado por padrão.
- Cadastro revogado ou armazenamento local perdido com identificador antigo: usar **Encerrar sessão e usar novo cadastro de aparelho**, entrar novamente e vincular/recuperar. Não regenerar uma chave sob autorização antiga.
- Wallet perdida: esta fase não a troca ou recupera. Não existe chave administrativa.
- Assinatura diferente da configuração: recuperação falha, preservando dados. Usar outro aparelho autorizado por QR. Se não houver um e não for possível reproduzir a assinatura, não há como abrir o cofre.
- Assinatura privada vazada: quem também obtiver sessão da conta pode recuperar novamente. Revogar um aparelho não remove cópias desse segredo nem apaga dados antigos.
- Conta legada: continua recuperável pelo código antigo. A migração explícita exige aparelho autorizado e esse código uma última vez; cria nova autoridade de recuperação e nova época, preserva todas as épocas antigas e aparelhos, e invalida o código para eventos futuros. Sem o código, ainda é possível vincular por QR, mas a migração não é simulada.
- Perfil legado do bloco 03: a primeira configuração precisa ocorrer no navegador que possui sua chave local não exportável. O app abre e recifra o perfil com a nova chave recuperável. Se a chave local antiga se perdeu antes dessa conversão, o app informa recuperação incompleta e não substitui a foto/preferências por um perfil vazio.
- A revogação não apaga chaves/textos/cópias antigas de um aparelho que já os recebeu. Preservar chaves históricas para recuperação não equivale a reenviar novas épocas ao revogado. O histórico remoto completo, backup de mensagens/mídias e política de arquivos pertencem aos blocos 05 e 09.

## Verificação histórica do fluxo com código

Resultado final local em 02/10/2026: `npm run check` passou — lint sem avisos, tipos estritos, fronteiras/ciclos, licenças, formatação, build, **123/123 testes Node e 20/20 testes de implantação**. A integração completa passou com **24/24 testes**, incluindo dez do conjunto de aparelhos. Após o último ajuste exclusivamente de CSS, build e inspeção de layout passaram; lint, tipos e formatação foram conferidos novamente após a última alteração da regressão. A primeira rodada completa da integração encontrou falta de uma vaga de admissão porque a fixture do navegador reservava capacidade: encerrada e removida somente essa conta sintética, a rodada final passou com o orçamento original, sem alterar a cota. Não houve execução de CI remoto, commit, push ou implantação desta entrega.

Os testes cobrem dois aparelhos, segredo errado, substituição de chave/raiz, omissão de evento, assinatura de aparelho revogado, não exportabilidade, recuperação sem estado anterior e preservação de chaves históricas. A integração usa PostgreSQL real exclusivo: uso único/expiração/cancelamento do código, concorrência, atomicidade de perfil/diretório, sessões encerradas, persistência em nova instância, CSRF e login EVM/Solana. A regressão do perfil em edição verifica que a chave de uma época anterior não é publicada após uma revogação observada e que a época atual permite uma escrita assinada.

No navegador do Mac, com wallets fictícias e origens locais separadas, foram exercitados: configuração e confirmação da chave guardada; segundo aparelho pendente; aprovação explícita; confirmação errada rejeitada antes da correta; leitura e edição do perfil nos dois aparelhos; recarga com identidade persistida; revogação e encerramento da sessão do segundo aparelho; recuperação em terceiro navegador sem estado anterior, com segredo errado rejeitado antes do correto e preferências preservadas. O layout de largura de celular também foi inspecionado no Mac, sem equivaler a teste físico mobile. Não foram usados blockchain, fundos ou dados reais. Evidências e dados de ambiente ficam exclusivamente em `.local/`.

Também foram confirmados no build final a persistência após recarga, a edição assinada do perfil recuperado, a atualização explícita da PWA e o layout sem rolagem horizontal nas larguras inspecionadas. Os servidores e abas criados para essa execução foram encerrados; a fixture e os dados preexistentes foram preservados.

Revisão de responsabilidades: formatos e validação compartilhados em `src/shared/devices`; primitivas nativas em `src/client/device-keys`; persistência/exclusão entre abas em `src/client/device-storage`; montagem das alterações assinadas em `src/client/device-operations`; coordenação e interface em `src/client/devices`; autorização no servidor em `src/server/devices`; SQL nas responsabilidades do módulo database. Os limites existentes de complexidade 10, profundidade 3 e parâmetros 4 passaram sem exceções novas, supressões, exclusões ou aumentos. Tamanho dos arquivos foi avaliado por coesão; não há limite artificial de linhas. As migrações anteriores e alterações preexistentes fora do objetivo foram preservadas. O complemento acrescenta somente a dependência de QR revisada ao manifesto/lockfile.

Roteiro original do fluxo com código, substituído pelo fluxo atual abaixo: entrar com a mesma wallet em dois navegadores/aparelhos; configurar e guardar recuperação no primeiro; ler o QR do segundo no primeiro; conferir a impressão e autorizar; ler o QR de confirmação no segundo; confirmar perfil privado; revogar o segundo; verificar que novo login não reativa suas chaves; recuperar num terceiro cadastro limpo com wallet e segredo, primeiro conferindo a seleção vazia e depois escolhendo quais aparelhos revogar. Verificar que os mantidos continuam acessando novas chaves e os escolhidos não. Conferir segredo errado antes do correto. Não repetir a matriz criptográfica ou o login do bloco 03 já aceitos sem falha nova. Emulação/layout não constituem aceite físico.

Complemento de QR/seleção: geração e leitura nas duas direções passaram no navegador do Mac com quadros sintéticos enviados ao leitor real, sem câmera física. Ler o pedido exigiu confirmação posterior; ler a confirmação exigiu concluir explicitamente. As tracks foram encerradas após leitura. Na recuperação, a lista começou vazia; selecionar todos, manter todos e escolher somente o segundo aparelho funcionaram. A recuperação preservou o primeiro, excluiu o escolhido e abriu a preferência privada guardada anteriormente. A biblioteca funciona sem o detector de QR nativo. No build final, o layout de QR e escolha foi inspecionado nas larguras de 320 e 390 pixels, sem rolagem horizontal; isso não verifica foco/permissões da câmera física. As abas/fixtures desta rodada foram encerradas e somente a conta sintética criada foi removida.

`npm run check` final passou, incluindo lint, tipos estritos, fronteiras, licenças, formatação e build. Verificação do complemento: **127 testes Node**, **26 de integração PostgreSQL** e **21 de implantação**. A primeira execução completa encontrou duas suposições antigas nos testes de deploy: reconstrução dos hashes da autorização histórica da Phantom a partir do lock corrente e build do HEAD com dependências da árvore em edição. Os testes agora reconstroem o lock histórico removendo somente QR e verificam os mesmos hashes aprovados; o build usa um repositório sintético temporário com as fontes candidatas, sem commit na árvore do usuário. Um teste adicional comprova que o lock com QR continua fora da exceção de implantação. As proteções/autorizações de produção não foram alteradas. O build permanece em 13 assets, com JavaScript principal aproximadamente 296 kB e fontes aproximadamente 850 kB, abaixo dos tetos existentes. A distribuição preferencial/avisos de QR está no arquivo de fontes; não houve ativação, migração ou publicação na VPS.

**Ponto importante:** a recuperação e a lista verificável de aparelhos são funções reais desta entrega local. A revisão do Mac não equivale a auditoria externa, aceite físico mobile, publicação das migrações ou conclusão dos blocos de chat/cofre.

## Fluxo atual pela wallet e aceite posterior

No primeiro aparelho, escolher a wallet e tocar em **Configurar recuperação pela wallet**; assinar a mensagem exclusiva duas vezes. Nenhum código é exibido para guardar. Em conta antiga autorizada, tocar em **Migrar recuperação para wallet**, informando o código antigo uma última vez; a interface informa quando a migração termina. QR e confirmação dos aparelhos continuam disponíveis.

No novo cadastro sem chaves locais, entrar com a wallet original, abrir **Recuperar sem aparelho anterior**, conferir a seleção vazia ou marcar os aparelhos a revogar e tocar em **Recuperar com esta escolha**. A recuperação pede uma assinatura da mensagem configurada. Conta ou assinatura errada não concede autorização.

Quando a wallet está em outro contexto no mobile, o navegador original prepara o pedido antes de abrir a wallet. A página privada confere compromisso SHA-256 na URL, conta/origem e chave pública de destino antes de assinar. RSA-OAEP/SHA-256 e AES-256-GCM vinculam envelope e pedido. Depois de assinar, voltar ao navegador original e tocar em **Concluir recuperação**; não copiar ou guardar assinatura. A página da wallet não cria sessão nem autoriza aparelho. Pedido expira em cinco minutos, aceita um retorno e exige sessão/CSRF do destino para retirar. Após recarga, só metadados públicos permanecem em sessionStorage; chave privada de destino fica não exportável no IndexedDB. Na migração após navegação, pode ser necessário reinserir o código antigo, que nunca é persistido.

O servidor limita esse transporte a 128 pedidos em memória, envelope de até 2048 bytes, corpo HTTP de até 4096 bytes, quatro operações simultâneas e o rate limit de conta existente. Cancelamento, substituição, uso e expiração impedem replay; limpeza ocorre a cada 30 segundos. Reiniciar o serviço cancela apenas pedidos temporários. Conteúdo já aceito no cofre e códigos legados não são apagados. APIs, documento privado e URLs de recuperação ficam fora do cache da PWA.

Teste físico posterior: repetir configuração e recuperação EVM/Solana nos navegadores/wallets escolhidos, conferir duas assinaturas na configuração, uma na recuperação, conta errada, retorno mobile ao navegador original, retomada após recarga, expiração e escolha de revogação. Compatibilidade entre implementações/aparelhos precisa desse aceite; testes sintéticos no Mac não o substituem.

**Ponto importante:** login e assinatura privada de recuperação são mensagens separadas. Não há código novo para anotar; a assinatura exclusiva é segredo do cliente e a capacidade de reproduzi-la continua necessária. A integração não ativa uma release na VPS automaticamente.

## Validação local da integração pela wallet

Em 02/10/2026, passaram **27 testes dirigidos** de recuperação, autoridade, perfil e conectores, **39 testes de integração PostgreSQL** e **30 testes de implantação**. Lint, tipos, fronteiras, licenças, formatação dos arquivos alterados e build passaram. A resolução dos subpaths públicos de ethers foi conferida em **14 testes de qualidade/fontes**, incluindo recusa do caminho interno não exportado; o arquivo público contém as fontes preferenciais e licenças de cada versão incorporada. Sem dependência, lockfile ou migração nova; limites de complexidade e recursos preservados.

No navegador do Mac, com contas e providers exclusivamente fictícios: configuração com duas assinaturas sem exibir código; novo cadastro recuperado com uma assinatura e seleção de revogação vazia; aparelho anterior preservado; item privado do cofre aberto antes/depois de recarregar. Na página privada de retorno, duas assinaturas produziram somente um envelope cifrado, aberto pelo destinatário com derivação de chave não exportável. Sem erros de console. Capturas e detalhes operacionais ficam em `.local/`, fora do Git. Esse exercício valida a página e a criptografia do retorno, sem certificar a abertura/volta entre apps nas wallets físicas mobile.

Conferência final numa cópia limpa dos commits: lint, tipos, fronteiras, licenças, formatação, build de 15 assets e **159/159 testes Node** passaram. O ambiente externo selecionou Node 25 e Python 3.9 do sistema: corrigido o PATH para o Node 24 instalado, a suíte Node passou; o único teste de empacotamento bloqueado pelo Python antigo passou ao reexecutá-lo com Python 3.14 instalado, completando os **30/30 testes de implantação**. Os **39/39 testes PostgreSQL** anteriores continuam válidos, pois os ajustes posteriores atingiram somente cliente, resolução/fontes do build e documentação. Nenhum runtime/dependência foi instalado ou alterado por essa conferência.
