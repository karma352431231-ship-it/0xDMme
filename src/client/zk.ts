import { element } from './probe-ui/index.ts';
import { record } from '../shared/crypto-probe/index.ts';

const button = element('prove', HTMLButtonElement);
const status = element('zk-status', HTMLParagraphElement);
let worker: Worker | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;

function stop(): void {
  worker?.terminate();
  worker = undefined;
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  button.disabled = false;
}

function complete(value: unknown): void {
  stop();
  const result = record(value);
  if (
    result.valid !== true ||
    result.tamperRejected !== true ||
    result.removedMemberRejected !== true ||
    typeof result.proveMs !== 'number' ||
    typeof result.verifyMs !== 'number'
  )
    throw new Error('Prova rejeitada.');
  status.textContent = `Prova ZK real válida. Geração: ${result.proveMs.toFixed(1)} ms; verificação: ${result.verifyMs.toFixed(1)} ms. Prova: ${String(result.proofBytes)} bytes. Alteração e raiz sem o membro foram rejeitadas. Workers encerrados.`;
}

button.addEventListener('click', () => {
  if (worker) return;
  button.disabled = true;
  status.textContent =
    'Gerando prova com identidade fictícia e artefatos locais…';
  try {
    worker = new Worker('/zk-worker.js', { type: 'module' });
    worker.onmessage = (event: MessageEvent<unknown>) => {
      try {
        complete(event.data);
      } catch {
        status.textContent =
          'Ensaio rejeitado. Confira os artefatos locais e a compatibilidade do navegador.';
      }
    };
    worker.onerror = () => {
      stop();
      status.textContent = 'Não foi possível executar a prova neste navegador.';
    };
    timer = setTimeout(() => {
      stop();
      status.textContent =
        'Limite de 45 segundos atingido; workers encerrados. Registrar este resultado no teste do aparelho.';
    }, 45_000);
    worker.postMessage({ start: true });
  } catch {
    stop();
    status.textContent = 'Worker indisponível neste navegador.';
  }
});
window.addEventListener('pagehide', stop, { once: true });
