# Medidor local de sincronização — 15/10/2026

## Consecutive text-send capture — 16/10/2026

The owner reported that consecutive Enter submissions require waiting between
messages and requested evidence before changing the send pipeline. The private
coordinator holds its existing exclusive/busy gate through local composition,
pending transmission, visible-history verification, pin persistence and normal
presence/read-receipt work. The shared composer refuses Enter while its send
button is disabled. This establishes a blocking path in the source, not how much
each stage costs on the owner's device. Do not infer that every delay is network
latency or bypass those authorization/SDK gates to make a synthetic test faster.

`npm run diagnostic:chat` now includes a separate control observer for private,
handle and group forms. `send-action` records only Enter intent, a send-button
click or an actual form submission, together with the fixed enabled/hidden
control states. `send-state` records changes to those states. An Enter while
disabled followed by no click/submit distinguishes rejected input from accepted
work awaiting transmission. Request categories include the fixed handle-message
operations and recovery steps; lock, response and long-task timing retain their
existing instrumentation. A submit event is not proof of local persistence,
server acceptance, delivery or reading. Operation intervals may overlap.

For a desktop Chrome capture:

1. Open an authorized conversation and wait until history and the composer are
   usable. This is a send capture, so no boot breakpoint or Android USB is needed.
2. Paste the full generated `build/chat-lag-console.js` into that tab's Console.
   Use one collector at a time and do not reload during the capture.
3. Return focus to the message field. Use harmless test text and reproduce three
   to five consecutive Enter attempts, including an attempt while the pause is
   visible. Wait until the last message settles. Keep the run around 20–30 seconds.
4. Return to Console and run
   `copy(JSON.stringify(__0xdmmeLag.stop(), null, 2))`, or use the existing local
   download button. Share that JSON only if desired; keep repository copies in
   `.local/`. A report with dropped events is incomplete and needs a shorter run.

No input value, message DOM text, recipient, arbitrary keystroke, signing data,
storage or HTTP payload is retained. The observer never prevents a key event,
enables a disabled button, submits a form, sends a request or retries a message.
It has only three remembered scope states, removes its listeners/observer on stop,
and uses the existing 1,500-event/ten-minute capture budget. Network timing covers
only calls started after installation in this tab; other tabs and Wasm/worker CPU
are not attributed. Native lock wait does not measure the application's preceding
authority queue. Do not run a second recorder alongside it.

**Ponto importante:** the mobile handle-list cancellation repair is a separate
[continuity change](PARIDADE_CHATS.md#public-dm-connection-continuity--16102026).
This collector can measure private sends in the currently served desktop app
without deploying code. It prepares evidence; it does not remove the send delay.

O proprietário relatou demora com o navegador visível, tanto no desktop quanto no mobile, especialmente ao trocar de conversa. Pediu medir o navegador antes de atribuir a causa ou alterar novamente a sincronização. A branch `codex/chat-estabilidade` parte da `main` em `6680163`, em worktree isolado. O script prepara a captura e não identifica automaticamente a causa; a investigação posterior orientou a [correção da abertura](BLOCO_07_MENSAGENS.md#redução-do-atraso-na-abertura--15102026).

## Executar no navegador que apresenta a demora

1. Na branch de diagnóstico, use `npm run diagnostic:chat`. Abra `build/chat-lag-console.js` e copie todo o arquivo.
2. Abra o 0xDMme e aguarde a entrada normal. Abra as ferramentas de desenvolvimento do navegador, na aba **Console**, e cole o script. Um pequeno painel confirma **medidor local ativo**. Não é preciso publicar uma versão do app.
3. Deixe o app parado por aproximadamente 20 segundos. Alterne entre duas ou três conversas algumas vezes, aguardando cada abertura. Use **Marcar demora** quando perceber o atraso. Faça também um trecho sem cliques para comparar. A captura não envia mensagens nem inicia chamadas por conta própria.
4. Clique **Parar e baixar relatório**. O arquivo `0xdmme-chat-lag.json` é gerado no próprio aparelho. Para a investigação do repositório, guarde a evidência somente na `.local/` do checkout principal. O relatório só sai do navegador se você decidir compartilhá-lo.

Não recarregue a página durante a captura: o script não persiste nem reinicia após reload. No celular, o console remoto do próprio navegador pode instalar o mesmo script; esta entrega não configura esse acesso. Execute na aba do app, não no console de uma extensão ou de um service worker.

O console também aceita:

```js
window.__0xdmmeLag.mark(); // marcador fixo, sem texto privado
window.__0xdmmeLag.report(); // relatório parcial
window.__0xdmmeLag.stop(); // encerra e conserva o relatório em memória
window.__0xdmmeLag.download(); // encerra e baixa o JSON local
window.__0xdmmeLag.remove(); // encerra e remove o painel
```

## O que a linha do tempo distingue

| Registro                                       | O que demonstra                                                                                                                                             |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user-action`                                  | Clique em conversa, voltar, sincronização manual, chamada ou envio; sem identificar destinatário, texto do botão ou conteúdo.                               |
| `page-event`                                   | Foco, visibilidade, rede e eventos de suspensão/retomada.                                                                                                   |
| `stream-control`                               | Frame completo reconhecido do protocolo vazio (`ready`, `changed`, `removed`, autorização ou heartbeat). A atribuição vem do formato, não da URL do stream. |
| `chat-ui`                                      | Mudança do estado “Sincronizando”, existência/ocultação do histórico; nunca o conteúdo das bolhas. Observação agrupada em até 50 ms.                        |
| `lock-queued/acquired/released/failed`         | Tempo esperando a exclusão local e tempo segurando-a. Os identificadores são contadores novos da captura, não IDs de conta/aparelho.                        |
| `request-start/response-headers/response-body` | Categoria fixa da operação, posição do chamador no bundle e duração até headers/JSON, quando a aplicação lê JSON. O mesmo contador liga os três registros.  |
| `request-failed`                               | Falha, cancelamento ou timeout, sem mensagem de erro. O erro original segue para a aplicação.                                                               |
| `event-loop-lag/long-task`                     | Atraso observado da interface/tarefa longa. Atraso de timer em aba oculta recebe categoria própria.                                                         |

Requisições iniciadas enquanto uma exclusão local observada está ativa incluem seu contador em `locks`. Isso permite verificar quais leituras ocupam a fila e se o heartbeat de chamada espera por ela. Posições de chamador incluem somente nome/hash do asset `app`, linha e coluna; não incluem nomes de função, origem, caminhos arbitrários ou dados da conta.

Um clique seguido de `lock-queued`, longa espera, requisição e depois `chat-ui` fornece evidência distinta de uma resposta de rede lenta ou de uma tarefa longa. Um `changed` antes da sondagem é outro encadeamento possível. Proximidade temporal sozinha não prova causa; investigar o chamador e repetir o cenário antes de corrigir.

## Limites e privacidade

- No máximo 1.500 eventos em memória e dez minutos; os mais antigos são substituídos e o relatório informa quantos saíram. O script restaura suas funções e observadores ao parar ou sair da página. Não cancela operações do app.
- Somente operações iniciadas depois da instalação, nesta aba, têm medição de rede/fila. Esperas provocadas por outra aba podem aparecer, mas o trabalho daquela aba não é identificado.
- O campo `waitMs` mede somente a espera pelo Web Lock nativo. Com a fila de prioridade preparada na correção de 15/10, a espera anterior em memória não aparece nesse campo: compare também o intervalo entre clique e início da requisição e o tempo até o histórico aparecer. Não interpretar `waitMs` pequeno como ausência de espera total.
- Frames fragmentados, misturados com outros dados, maiores que 4 KiB ou diferentes do protocolo vazio são ignorados. O leitor já existente pode ser observado nas chamadas posteriores; uma leitura já pendente na instalação não é interceptada. Ausência de `stream-control` não prova ausência de aviso. DevTools Network continua sendo a fonte para atribuir o stream exato.
- A leitura de JSON mantém a `Response`, o corpo, sinais, resultado e erro originais; não há clone, consumo extra ou segunda requisição. O medidor não lê corpos HTTP, storage, cookies, chaves, mensagens, contatos, parâmetros de URL, microfone, áudio ou detalhes de rede/dispositivo. Nunca envia telemetria.
- O timer de 250 ms e os hooks acrescentam algum custo. Tarefas longas dependem do suporte do navegador, indicado no relatório. Não atribuir automaticamente atraso em aba oculta ao app nem extrapolar resultados sintéticos para celulares físicos.

**Ponto importante:** este medidor prepara uma investigação no navegador afetado, sem mudar autenticação, criptografia, exclusões, sincronização ou chamada. Instalar o script não corrige a instabilidade nem estabelece qual evento disparou o caso real. Não há publicação ou ativação nesta etapa.

## Verificação desta entrega

Quatro regressões verificam orçamento/fim da captura, remoção de dados privados das categorias, preservação de resposta/corpo/sinal/erros, separação entre espera e ocupação da exclusão local, restauração dos métodos e observação do stream sem consumo extra. Lint, tipos, fronteiras, formatação, cobertura de localização e o build independente do medidor passaram. O código de diagnóstico fica em `src/tools/chat-diagnostics`, sem importação pelo aplicativo ou mudança em seus hotspots.

Um ensaio no navegador local usou exclusivamente dados fictícios e as APIs reais de fetch, Web Locks e streams. A espera de fila observada foi 422 ms, a resposta até JSON levou 357 ms e uma tarefa longa proposital levou 160 ms. O painel registrou abertura de conversa, `changed`, início/fim do estado de sincronização e as duas exclusões; restaurou os métodos originais e não incluiu os marcadores privados do ensaio no relatório. Esses tempos são do cenário controlado, não do app publicado ou do celular do proprietário. A captura real foi recebida e analisada depois em 15/10; a evidência operacional e seus detalhes ficam somente na `.local/` do checkout principal.
