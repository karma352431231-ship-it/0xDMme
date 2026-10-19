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
    throw new Error('Proof rejected.');
  status.textContent = t(
    'Real ZK proof valid. Generation: {0} ms; verification: {1} ms. Proof: {2} bytes. Modification and a root without the member were rejected. Workers stopped.',
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
    'Generating proof with a fictional identity and local artifacts…',
  );
  try {
    worker = new Worker('/zk-worker.js', { type: 'module' });
    worker.onmessage = (event: MessageEvent<unknown>) => {
      try {
        complete(event.data);
      } catch {
        status.textContent = t(
          'Test rejected. Check local artifacts and browser compatibility.',
        );
      }
    };
    worker.onerror = () => {
      stop();
      status.textContent = t('Could not run the proof in this browser.');
    };
    timer = setTimeout(() => {
      stop();
      status.textContent = t(
        '45-second limit reached; workers stopped. Record this result in the device test.',
      );
    }, 45_000);
    worker.postMessage({ start: true });
  } catch {
    stop();
    status.textContent = t('Worker unavailable in this browser.');
  }
});
window.addEventListener('pagehide', stop, { once: true });
