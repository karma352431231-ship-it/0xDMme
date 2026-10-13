import { t } from '../shared/i18n/index.ts';
import { startLanguage } from './language/index.ts';
import { element } from './probe-ui/index.ts';
import { record } from '../shared/crypto-probe/index.ts';

startLanguage();
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
  status.textContent = t(
    'Prova ZK real válida. Geração: {0} ms; verificação: {1} ms. Prova: {2} bytes. Alteração e raiz sem o membro foram rejeitadas. Workers encerrados.',
    [
      result.proveMs.toFixed(1),
      result.verifyMs.toFixed(1),
      String(result.proofBytes),
    ],
  );
}

button.addEventListener('click', () => {
  if (worker) return;
  button.disabled = true;
  status.textContent = t(
    'Gerando prova com identidade fictícia e artefatos locais…',
  );
  try {
    worker = new Worker('/zk-worker.js', { type: 'module' });
    worker.onmessage = (event: MessageEvent<unknown>) => {
      try {
        complete(event.data);
      } catch {
        status.textContent = t(
          'Ensaio rejeitado. Confira os artefatos locais e a compatibilidade do navegador.',
        );
      }
    };
    worker.onerror = () => {
      stop();
      status.textContent = t(
        'Não foi possível executar a prova neste navegador.',
      );
    };
    timer = setTimeout(() => {
      stop();
      status.textContent = t(
        'Limite de 45 segundos atingido; workers encerrados. Registrar este resultado no teste do aparelho.',
      );
    }, 45_000);
    worker.postMessage({ start: true });
  } catch {
    stop();
    status.textContent = t('Worker indisponível neste navegador.');
  }
});
window.addEventListener('pagehide', stop, { once: true });
