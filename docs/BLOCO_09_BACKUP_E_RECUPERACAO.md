# Bloco 09 — Backup exportável e recuperação completa

Implementado e publicado no ambiente de testes em 03/10/2026 por solicitação do proprietário, release `62781eb`. Exportação cifrada, consulta histórica e limpeza pessoal estão integradas ao cofre. Validação e ensaios usam somente dados sintéticos. Download/reabertura manual, aparelhos físicos mobile e aceite final de segurança continuam pendentes; a publicação de teste não estabelece prontidão para dados reais. O proprietário pediu enviar e ativar o commit na VPS, autorizando a transição específica 016 → 017, backup/ensaio de restauração, preservação e uso do executor existente.

## Decisão de limpeza pessoal

O bloco 07 conserva a pendência de cada aparelho até sua confirmação autenticada. A proposta de limpeza revelou uma questão aberta: o celular já recebeu e exportou, mas o computador da mesma conta está offline e ainda não recebeu. A exclusão bilateral existente também remove a cópia da outra pessoa e não atende esse caso.

**Escolha do proprietário em 03/10/2026: limpeza pessoal imediata.** Depois de esclarecer o cenário, o proprietário respondeu “pode apagar na hora”. Após salvar e validar um backup independente, uma confirmação separada pode remover os itens selecionados do próprio cofre e encerrar as referências da própria conta, inclusive de aparelhos offline. Esses aparelhos dependerão do arquivo independente para consultar os itens removidos. A ação não é ACK, leitura ou revogação e preserva a cópia e as pendências do outro participante. Essa exceção está registrada no [plano](../DECISOES_E_PLANO_DE_IMPLEMENTACAO.md) e no [bloco 07](BLOCO_07_MENSAGENS.md).

Exportar isoladamente não apaga nem libera cota. Perder o arquivo depois da limpeza pode tornar o conteúdo irrecuperável para a conta. Não prometer apagar capturas, arquivos exportados ou conteúdo já aberto em outro aparelho offline.

## Experiência implementada

1. Em **Cofre → Backup independente**, carregar versões aceitas e mensagens acessíveis. A seleção usa IDs/hashes estáveis, com páginas de 16 itens; novidades após a seleção ficam fora. Rascunhos e reservas incompletas não entram.
2. Escolher itens e inclusão de fotos, arquivos e miniaturas. A estimativa é conservadora; o relatório autenticado distingue inclusões e omissões. Mídia inacessível ou desmarcada é informada, sem apresentar uma exportação parcial como completa. Vídeos continuam adiados; áudio gravado pertence ao bloco 10A.
3. Gerar e salvar o arquivo `.0xdm`. Selecionar novamente a cópia salva e validar identidade, integridade e todos os registros antes de consultar ou oferecer limpeza. O clique em salvar, sozinho, não comprova conservação do backup.
4. Consultar o histórico localmente, com páginas de 16 registros, texto/agenda/configurações, cartões de perfil/foto e download das mídias preservadas. Arquivos originais podem conservar GPS/EXIF. Nenhum arquivo inteiro ou conteúdo aberto é enviado ao servidor.
5. Se desejado, confirmar a limpeza em duas etapas explícitas. Somente itens desta exportação com os mesmos IDs/hashes, efetivamente preservados no arquivo validado, ficam elegíveis. Mensagem com qualquer mídia omitida não pode ser limpa por esse fluxo.
6. Opcionalmente registrar o hash e solicitar lembrete após sete dias, ao abrir o cofre. O registro é cifrado no próprio cofre; não é condição de validade do arquivo nem prova de conservação futura.

A consulta histórica não repopula o chat/cofre atual, não restaura convites, consentimentos, bloqueios, aparelhos ou sessões de envio e não desfaz exclusões atuais. Reabrir o mesmo arquivo não insere mensagens duplicadas. Não há republicação automática nem uma nova senha de backup.

## Recuperação e formato

Em outro navegador, usar primeiro o [bloco 04](BLOCO_04_DISPOSITIVOS_E_RECUPERACAO.md): entrar com a wallet original e autorizar por QR ou recuperar as chaves sem aparelhos anteriores. Contas legadas continuam com o código até sua migração explícita. Somente possuir o arquivo não autoriza um aparelho. A interface explica essa etapa quando as chaves não estão disponíveis.

O leitor usa a época histórica do arquivo e as chaves verificadas da conta. Um arquivo antigo íntegro continua consultável; seu hash não exige a versão mais recente. Formatos desconhecidos, outra conta, chave incorreta, adulteração, truncamento, ordem inválida, duplicação e budgets excedidos são recusados. O formato inicial é versão 1; novas versões precisarão de compatibilidade e validação próprias.

A chave aleatória exclusiva do arquivo é encapsulada pelas chaves existentes do cofre. AES-GCM nativo autentica cabeçalho, índice, tipo e conteúdo de cada parte; relatório final autenticado vincula a sequência completa. Mensagens e mídias preservam o SDK Matrix selecionado. Nenhuma dependência, lockfile ou versão de Node mudou.

## Recursos e persistência

- Máximo de 64 MiB por arquivo, 4096 registros e 4096 partes incluindo o relatório; processamento serial em partes de 262144 bytes. Registro serializado limitado a 6.000.000 bytes. Usar vários arquivos quando necessário; não presumir que os 300 MB do cofre cabem em memória no celular.
- O Blob cifrado concluído permanece disponível para salvar; a leitura mantém o arquivo/índice e abre registros sob demanda. Strings, decodificação e o navegador acrescentam consumo aos buffers. Pico de RAM e ciclo de vida mobile ainda precisam de medição física.
- Uma operação por painel, prazo de cinco minutos, cancelamento e invalidação na troca de conta/aparelho/sessão. URLs Blob são revogadas ao fechar a visão. Cancelar depois de enviar uma limpeza não desfaz uma transação confirmada; conferir o estado remoto antes de repetir.
- `personal_removals`, na migração `017`, conserva comprovantes assinados com ID/hash e autoridade histórica. Lotes de até oito itens usam transações curtas, paginadas e idempotentes pelo contrato de autoridade do módulo de banco. A própria conta deixa de acessar objetos removidos; ACK e reenvio do mesmo ID não os restauram.
- Pacote compartilhado e anexos continuam disponíveis ao outro participante. O corpo pode ser coletado quando ambos removerem pessoalmente a mensagem, ou na exclusão bilateral já aprovada. Limpeza de versões do cofre remove seus blocos, conservando compromissos/manifests necessários à cadeia verificável. Remoções sincronizadas invalidam a exibição/cache; rascunhos apoiados em versões removidas não são republicados silenciosamente.
- Uso lógico e físico são distintos. Comprovantes/metadados continuam contabilizados. Bytes físicos permanecem cobrados até coleta durável ou enquanto necessários ao outro participante; uma limpeza pequena pode não liberar espaço líquido. Capacidade global continua protegida, inclusive antes da coleta: falta de espaço para metadados pode recusar a transação sem apagar dados aceitos. Não há novo TTL ou descarte por inatividade. A tabela adota autovacuum já usado para mensagens.

## Validação e aceites pendentes

- Lint com tipos/complexidade, TypeScript estrito, fronteiras, licenças, formatação e build passaram. Aplicação: 182 testes aprovados. Deploy: 49 testes aprovados, incluindo snapshot Git com novas fontes e arquivos removidos. A fixture de snapshot foi corrigida para respeitar remoções do checkout.
- Preparação de publicação: 57 testes de deploy aprovados após ampliar o executor existente. Cobertura inclui fontes/migrações exatas 016 → 017, digests e uso físico, retorno antes de reabrir, preservação de novas gravações depois de reabrir e conservação dos backups históricos ao liberar workspaces de código.
- Cinco testes de backup cobrem arquivo agregado acima de 3 MB, leitor limpo com chave histórica, ausência de rede, reimportação, outra conta/chave, adulteração/truncamento/bytes extras, duplicação, limites, cancelamento, caracteres de controle e mídia cifrada pelo SDK. Elegibilidade da limpeza exige todas as referências de mídia e hashes verificados.
- PostgreSQL/HTTP: 27 testes de mensagens/cofre aprovados. Contratos incluem computador offline, isolamento, assinatura, ID/hash divergentes, idempotência, acesso/ACK barrados após limpeza, preservação do anexo do outro participante, exclusão bilateral posterior e coleta sem quebrar a cadeia do cofre. A leitura de mídia normaliza o pacote recebido antes de conferir o hash; a ordem JSON do banco não pode tornar um anexo legítimo indisponível.
- Navegador no Mac: wallet sintética autorizada, item aceito selecionado, item criado depois fora da seleção e backup cifrado gerado. Corrigida a interferência dos botões do cofre sobre o painel de backup; limpeza permanece desabilitada sem validação. Layout conferido sem transbordamento horizontal em 320/390 px; essa verificação não representa teste de aparelho físico.
- **Pendente:** salvar/reabrir o arquivo pelo navegador, confirmar limpeza pela interface e recuperar o arquivo nesse fluxo em um navegador limpo. O navegador interno gerou o Blob, mas suas APIs não retornaram o download; o macOS recusou leitura de Downloads. Não se afirma conclusão desse ensaio. Abertura limpa e recuperação de chaves têm cobertura automatizada separada; isso não substitui o aceite integrado.
- **Publicação de teste:** CI do commit exato aprovada; build preparado no Mac, migração 017, backup/ensaio de restauração, dados preexistentes, contabilidade e preservação conferidos. A primeira conferência depois de reabrir falhou; o app foi parado conservando estado/backup/release anterior. Após revisar receipt/schema/fontes, reabriu-se a mesma versão e saúde/36 hashes públicos passaram, sem repetir migração ou restaurar o dump. Na reabertura houve respostas HTTP não bem-sucedidas antes da prontidão; a causa exata da falha original não foi isolada. Backups históricos foram conservados separadamente dos workspaces de código antigos.
- **Aceites físicos pendentes:** Android/iPhone, wallets reais, conservação do download, armazenamento sob pressão, memória e interrupções. Auditoria e aceite final de segurança continuam pendentes. Nenhuma conta/dado real foi usada.

Fontes correspondentes incluem os novos módulos do frontend. Evidências, configuração sintética e logs ficam exclusivamente em `.local/`, fora do Git. Revisão por responsabilidade mantém codecs, registros, seleção/interface, comprovantes e persistência separados, com fronteiras públicas, sem supressões ou limite de linhas.

**Ponto importante:** limpeza pessoal imediata afeta somente sua conta. A cópia independente precisa ser salva e validada antes da ação; sua perda posterior pode ser irreversível para você. Os aceites pendentes impedem tratar o bloco como validado para uso real.
