# 0xDMme — Bloco 02 — base web e persistência local

Estado: base local implementada. A aplicação navega entre conversas, contatos, cofre e configurações. Ainda não há conta, mensagem ou cofre real; os controles dependentes desses recursos estão desabilitados e identificados como em preparação. [Escopo/ordem da V1](../DECISOES_E_PLANO_DE_IMPLEMENTACAO.md) preservados integralmente. HTTPS de produção, calibração da infraestrutura e aceite físico de instalação/atualização PWA continuam pendentes de integração; não declarar o bloco totalmente aprovado para produção.

Evolução em 01/10/2026: conta/perfil no [bloco 03](BLOCO_03_CONTA_E_PERFIL.md) e [staging HTTPS isolado](DOMINIO_E_AMBIENTE_TESTE.md), com fontes/licenças do build público. As descrições de loopback abaixo registram a entrega local do bloco 02; não representam o listener do staging nem publicação da V1.

## Decisões

- Frontend com HTML/CSS e módulos TypeScript nativos; esbuild já disponível gera assets locais. Nenhum CDN, fonte remota, analytics ou framework adicional. [Seleção de dependências](DEPENDENCIAS_E_SELECAO_BLOCO_01.md) registra necessidade/licenças do driver `pg`.
- Backend Node HTTP somente em loopback, sem autenticação/chat/upload ainda. Host/origem explícitos, recusa cross-site, métodos GET/HEAD, allowlist do build, limite de headers/conexões e timeouts. CSP sem inline/eval, `nosniff`, `no-referrer`, COOP/CORP e permissões de câmera/microfone bloqueadas nesta base. Ajustar somente no bloco de mídia/chamada correspondente; não antecipar permissões.
- Health `/health/live` para processo e `/health/ready` para banco/objetos; respostas somente `ok`/`unavailable`, sem versão, identificador, credenciais ou caminho de armazenamento. Leituras simultâneas de readiness compartilham operação em curso. Sem request logs/telemetria.
- Configuração development requer PostgreSQL em `127.0.0.1`, banco com prefixo `hash_talk_` e objetos sob `.local/`. Esse prefixo é proteção contra erro de configuração; não substitui uma role/cluster exclusivo. Nenhum acesso à VPS, credencial de outros projetos ou alteração da identidade Git foi realizado.
- PostgreSQL 16, pool máximo de quatro conexões, conexão 3 s, consulta 5 s, statement 4 s, lock 1 s, transação ociosa 2 s. Migração versionada com checksum, lock advisory transacional e rollback; reaplicar não regrava estado estável. O esquema inicial contém apenas uma identidade de instalação, sem contas ou conteúdo. Durabilidade, autovacuum e estatísticas não são desabilitados. [Configuração versionada](../infra/postgres/development.conf) adotada somente no cluster local exclusivo; limites de produção dependem do inventário privado da VPS.
- Objetos separados do SQL, bytes opacos de até 3 MiB + 64 KiB de margem técnica para envelope. Essa margem não aumenta o anexo de produto de 3 MB; quotas/validação de envelopes entram nos blocos 05/08. Escrita por temporário, fsync, link sem sobrescrever e fsync do diretório; hash confere integridade física, sem equivaler a autenticação E2EE. Nomes são SHA-256, symlinks recusados, leituras limitadas antes da alocação, oito writers por instância. Temporários não aceitos de mais de uma hora são limpos na inicialização, com varredura restrita a staging e 32 entradas; irregularidade/excesso falha explicitamente. Objetos finais não expiram. Sem endpoint público antes de autorização/cota/referências duráveis.
- Encerramento SIGINT/SIGTERM para admissão, fecha HTTP com deadline de 5 s e pool; deadline global de 8 s. Falhas geram mensagem fixa, sem conteúdo privado ou simulação de sucesso.

## PWA e atualização

Correção da navegação normal em 04/10/2026: o proprietário confirmou que `/?atualizar=1` abre a interface atual no celular, mas rejeitou depender de uma URL especial. A inspeção confirmou que o Worker atendia `/` pelo cache antes de consultar a rede. A abertura ou recarga do endereço padrão passa a buscar o HTML publicado com `no-store`; somente uma falha de rede usa o documento da release offline completa. Erros HTTP continuam visíveis. Não gravar o HTML online sobre o cache antigo, pois seus assets podem pertencer a outra release. Os assets versionados continuam no cache, queries/APIs permanecem excluídas e a ativação do Worker continua explícita, protegida contra operações pendentes. **Ponto importante:** este comportamento depende de o navegador receber e ativar o Worker corrigido; um Worker antigo já ativo não pode ser alterado remotamente por uma mudança no servidor. A preparação pendente observada no celular continua sem causa específica comprovada. A entrada especial é mantida somente para compatibilidade de recuperação; não é o endereço normal do produto.

Validação local da navegação normal: o teste de regressão recebeu o documento antigo antes da mudança e passou após a correção. Quinze testes de Worker/controlador PWA passaram, cobrindo acesso online, alternativa offline, cache ausente, erro HTTP visível e preservação das restrições existentes. Lint, tipos, fronteiras, formatação e build passaram. O reteste físico continua pendente; a simulação não comprova a instalação no celular.

Publicação da correção em 04/10/2026: release `dacd6a5` ativada pelo deploy de rotina com CI exata aprovada, 37 assets públicos verificados, comparações de preservação aprovadas e release anterior conservada. Nenhum serviço compartilhado foi reiniciado. O acesso `/?atualizar=1` retornou HTTP 200 com o HTML atual; o Worker público contém o prazo de 60 segundos. Dezoito testes dirigidos passaram, incluindo rede lenta, prazo excedido, feedback da atualização e retorno ao endereço offline depois da ativação explícita. Lint, tipos, fronteiras, licenças, formatação/build e teste real do pacote foram verificados; a CI repetiu os checks e as integrações. A captura comprova shell antigo; o reteste no celular ainda precisa confirmar o resultado físico. Evidências e acesso permanecem somente em `.local/`.

Correção do shell antigo no mobile em 04/10/2026: o proprietário observou a tela do bloco 03 apesar de a origem publicar o bloco 10, e a verificação não ofereceu atualização. O prazo total de instalação passa de 8 para 60 segundos, com transferências sequenciais e limpeza somente do candidato incompleto. A interface informa que o preparo continua e dá feedback ao verificar enquanto há uma operação pendente. A entrada pública fixa `/?atualizar=1` entrega o HTML atual sem passar pelo cache antigo, com a mesma origem, CSP, câmera e `no-store`; parâmetros adicionais continuam recusados. Após ativação explícita, retorna ao endereço sem query preservando a tela escolhida, para manter acesso offline. Não apaga IndexedDB, chaves ou sessões e não ativa o Worker automaticamente. **Ponto importante:** a versão antiga na captura e a versão atual servida foram confirmadas; o timeout é reproduzível em teste de rede lenta, mas o motivo exato no aparelho ainda depende do reteste físico. Publicação desta correção permanece distinta da implementação local.

Exceção aprovada em 01/10/2026 para a [prova isolada Phantom/Solana](BLOCO_03_CONTA_E_PERFIL.md): somente o documento `/phantom-probe.html` permite compilação WebAssembly via `'wasm-unsafe-eval'`, necessária à biblioteca NaCl. Não permite `eval` de JavaScript, scripts inline ou fontes externas. O host aplica a exceção somente à resposta de documento encontrado e admitido, nunca às APIs, erros ou à interface normal. A regra anterior de CSP da base permanece nos demais documentos; essa exceção não habilita câmera/microfone nem representa suporte físico comprovado.

Manifesto com identificador/origem local estável, ícones PNG 192/512 e display standalone. Build produz JS/CSS com hash e Worker com cache versionado. Apenas assets públicos exatos, mesma origem, GET sem query string/Authorization são elegíveis. APIs, envelopes, objetos, credenciais e conteúdo privado não entram nesse cache; respostas HTTP usam `no-store`. Instalação incompleta rejeita o Worker e remove seu cache candidato, sem publicar sucesso offline. As buscas de instalação compartilham um prazo de 60 s; cada resposta é consumida por `cache.put` antes de buscar o próximo asset. Isso limita a uma resposta em trânsito e evita reter corpos não consumidos enquanto se espera por todas as buscas. Falha de escrita também remove o candidato. Mudanças no próprio Worker entram no hash da release.

Não usar `skipWaiting` automático nem `clients.claim`. A tela avisa quando há versão waiting e a pessoa escolhe **Atualizar agora**. Mensagem de ativação exige contexto da mesma origem. O Worker limpa somente caches com prefixo próprio e conserva uma versão pública anterior para abas existentes. A aplicação limita o registro inicial a duas tentativas e mantém uma só operação register/update pendente, inclusive após o deadline visual de 10 s; essas APIs do navegador não podem ser canceladas. Ativação explícita tem deadline, não acumula listeners e não anuncia recarga concluída sem controllerchange. Fechar a página remove listeners/timers; restauração pelo cache de navegação preserva o ciclo da página. A política é suficiente para a interface pública desta etapa; antes de integrar estado criptográfico/operações pendentes, coordenar atualização entre abas e aguardar checkpoints duráveis. Não recarregar um cliente com envio/vinculação/cofre em progresso.

O modo offline desta base significa navegação na interface pública já instalada. Não promete envio offline, preservação de histórico, push ou segundo plano. HTTPS/loopback são necessários. A instalação no navegador integrado apresentou timeout e foi corrigida. O diagnóstico em origem nova confirmou respostas HTTP 200 completas no servidor; o Worker recebia headers de parte delas e expirava nas demais enquanto aguardava todas antes de consumir seus corpos. Substituir essa retenção concorrente por busca/gravação sequencial permitiu concluir a instalação. Teste de regressão exercita orçamento de três respostas não consumidas e confirma pico de uma. A instrumentação ficou somente em `.local/`, foi encerrada e não entra no app/build normal.

No build normal, instalação, recarregamento e navegação pelo cache passaram com o backend desligado, cuja indisponibilidade foi confirmada por conexão recusada. Consultar atualização sem servidor preservou a interface instalada e informou falha de atualização. Isso resolve o aceite offline no navegador integrado. Não comprova instalação/atualização física em Android/iPhone nem estado criptográfico offline; o controle do Safari não respondeu na tentativa anterior e não foi repetido. Teste automatizado do Worker não equivale a instalação física Android/iPhone. Agrupar a validação física da PWA com o próximo marco que introduzir conexão wallet/armazenamento, conforme a estratégia por risco; não repetir os ensaios criptográficos antigos.

## Executar localmente

Node/npm conforme README. PostgreSQL 16 deve estar disponível; não presumir instalação em outra máquina. Criar cluster separado, nunca usar o banco/cluster do outro projeto. Comandos para novo diretório local vazio (não reaplicar `initdb` em cluster existente):

```bash
initdb -D .local/postgres -U hash_talk_dev -A trust --encoding=UTF8 --no-locale --data-checksums
HASH_TALK_PG_CONFIG="$PWD/infra/postgres/development.conf"
pg_ctl -D .local/postgres -l .local/postgres.log -o "-c config_file=\"$HASH_TALK_PG_CONFIG\"" start
createdb -h 127.0.0.1 -p 45432 -U hash_talk_dev hash_talk_dev
createdb -h 127.0.0.1 -p 45432 -U hash_talk_dev hash_talk_test
```

Esses budgets são exclusivos do cluster local de desenvolvimento, não medidas ou configuração final da VPS. `trust` é somente para dados fictícios, cluster isolado em loopback e máquina controlada. Produção exigirá roles mínimas, autenticação apropriada e revisão de isolamento. Nenhum parâmetro global de outro cluster foi alterado. Logs do cluster ficam privados, sem statement/connection logs. Manutenção acima de 1 s usa sete nomes diários reutilizados; isso limita quantidade de arquivos, sem prometer teto rígido em bytes. O bootstrap em `.local/postgres.log` também exige acompanhamento local. Não há conteúdo real neste cluster; antes de produção, revisar mensagens de erro, retenção e disco com as roles definitivas. Não executar continuamente checks/testes na VPS.

## Métricas locais

`npm run observe:database` usa `.env` como a aplicação. Para o ambiente privado já isolado:

```bash
node --env-file=.local/web-dev.env src/tools/observe-database.ts
```

A operação consulta apenas agregados: tuplas estimadas, bytes de tabelas/índices, contagens e progresso de vacuum/analyze, transação mais antiga, idade de XID, blocos lidos/cacheados, WAL acumulado desde reset, commits/rollbacks e ocupação do pool. WAL é do cluster, permitido aqui somente porque é exclusivo. Nenhuma consulta textual, linha de conta, identificador, IP ou caminho do banco sai da operação. Resultados e identificação do ambiente ficam exclusivamente em `.local/metrics/database.json`, com escrita atômica e um único snapshot de até 16 KiB, diretório 0700/arquivo 0600. Não há endpoint público nem coleta contínua.

Contadores são cumulativos/estimativas e não medem diretamente bloat, IOPS ou latência do chat. Duração de manutenção usa o log privado. Latência de operações reais, memória/I/O do processo PostgreSQL, backups/slots e limiares exigem os módulos de produto e calibração no hardware; não simular aceite da seção 19 com esta base vazia.

Configurar `.env` conforme `.env.example`, preservando arquivo privado existente. `npm run dev` cria o build e abre a base local; Ctrl+C encerra o backend. As migrações são aplicadas ao iniciar, antes de escutar HTTP. Encerrar o banco isolado quando não necessário:

```bash
pg_ctl -D .local/postgres -m fast stop
```

Testes de integração exigem `HASH_TALK_DATABASE_URL` apontando para banco com prefixo `hash_talk_test`, via ambiente ou `.local/web-test.env`:

```bash
npm run check
npm run test:integration
```

Não há fallback para SQLite/memória quando banco falha. O serviço não inicia e não aceita dados se build, configuração, migração ou armazenamento não estiver disponível. Os laboratórios continuam separados em `probe:*`; não são iniciados por `dev`.

## Evidência e limites

Testes da base verificam restrições de configuração, origem/Host/métodos/traversal, saúde indisponível, manifest/assets, armazenamento concorrente/idempotente, nova instância, corrupção, symlink, política de cache e execução do Worker gerado (offline, instalação incompleta, ativação explícita). Integração PostgreSQL verifica migrações concorrentes, checksum alterado, identidade persistente e durabilidade/autovacuum; teste de processo verifica readiness e SIGTERM. Arquivos de integração executam serialmente no mesmo banco para isolar a alteração intencional de checksum do teste de startup; a concorrência real de migrações continua exercitada por duas conexões no teste correspondente.

Verificação anterior preservada: `npm run check` passou (lint, tipos, fronteiras, licenças, formatação, build e 42 testes); três testes de integração passaram. Após os ajustes de PWA/métricas, lint dos arquivos alterados, tipos, fronteiras e build passaram; oito testes focados da PWA passaram. Quatro testes de integração passaram com a configuração versionada aplicada: persistência/migrações, durabilidade/manutenção, privacidade das métricas e ciclo de vida do backend. A coleta real gravou snapshot privado em `.local/`. A rodada completa anterior não foi repetida sem necessidade. Reinício real do cluster PostgreSQL isolado preservou o mesmo identificador sintético, comparado somente em arquivos `.local/`. Diff e links locais conferidos.

Correção do timeout: quatro testes focados do Worker passaram, incluindo a regressão de consumo de corpos antes de novo fetch; lint dos arquivos alterados, tipos e build passaram. Banco, criptografia e demais testes anteriores não foram repetidos porque esta correção altera somente a instalação do shell público. Logs de diagnóstico e evidências visuais ficam exclusivamente em `.local/`.

Verificação visual de navegação e layout no navegador integrado em desktop e viewport de 390 px. Isso é layout responsivo, não novo aceite físico dos aparelhos. O CI usa PostgreSQL 16 efêmero e repete os checks/integração; execução remota permanece não verificada.

Pendências concretas da V1: blocos 03–12B, voz por último no 15, revisão 16 e publicação 17. O frontend com placeholders não conta como implementação dessas funções. Antes de exposição pública: HTTPS/origem estável, roles/budgets PostgreSQL por hardware, calibração e monitoramento operacional completo da seção 19 e fontes/avisos da release. Manter cadastro aberto e demais garantias aprovadas; nenhuma redução para MVP ou compra foi introduzida.

**Ponto importante:** a base web agora é executável com persistência local isolada; ainda não há chat autorizado para dados reais. O offline do shell público passou no navegador integrado; aceites físicos e limites da infraestrutura ficam explícitos e serão resolvidas nos marcos previstos, sem reabrir os testes criptográficos já aprovados.
