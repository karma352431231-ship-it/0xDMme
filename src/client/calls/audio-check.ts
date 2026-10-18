import { t } from '../../shared/i18n/index.ts';

/** User-requested report stays in this tab and is cleared when the call ends. */
export function createCallAudioCheck(options: {
  read: () => Promise<unknown>;
  stopCapture: () => Promise<void>;
}) {
  const element = document.createElement('details');
  element.className = 'call-audio-check';
  element.hidden = true;
  const summary = document.createElement('summary');
  summary.textContent = t('calls.audio-check');
  const disclosure = document.createElement('p');
  disclosure.textContent = t('calls.audio-check-privacy');
  const run = document.createElement('button');
  run.type = 'button';
  run.textContent = t('calls.audio-check-run');
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = t('calls.audio-check-copy');
  copy.hidden = true;
  const stopCapture = document.createElement('button');
  stopCapture.type = 'button';
  stopCapture.textContent = t('calls.audio-check-stop-capture');
  const stopExplanation = document.createElement('p');
  stopExplanation.textContent = t('calls.audio-check-stop-capture-explanation');
  const report = document.createElement('textarea');
  report.readOnly = true;
  report.rows = 5;
  report.hidden = true;
  report.setAttribute('aria-label', t('calls.audio-check-report'));
  report.setAttribute('spellcheck', 'false');
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  element.append(
    summary,
    disclosure,
    run,
    copy,
    report,
    stopExplanation,
    stopCapture,
    status,
  );
  let generation = 0,
    active = false,
    collecting = false;
  async function collect(): Promise<void> {
    if (!active || collecting || stopping) return;
    collecting = true;
    run.disabled = true;
    copy.hidden = true;
    report.value = '';
    report.hidden = true;
    const g = generation;
    status.textContent = t('calls.audio-check-running');
    try {
      const value = await options.read();
      if (g !== generation) return;
      const serialized = JSON.stringify(value);
      if (serialized.length > 16384)
        throw new Error('Audio report budget exceeded.');
      report.value = serialized;
      report.hidden = false;
      copy.hidden = false;
      status.textContent = t('calls.audio-check-ready');
    } catch {
      if (g === generation) status.textContent = t('calls.audio-check-failed');
    } finally {
      if (g === generation) {
        collecting = false;
        run.disabled = false;
      }
    }
  }
  async function copyReport(): Promise<void> {
    if (!active || !report.value) return;
    const g = generation;
    try {
      await navigator.clipboard.writeText(report.value);
      if (g === generation) status.textContent = t('calls.audio-check-copied');
    } catch {
      if (g === generation)
        status.textContent = t('calls.audio-check-copy-failed');
    }
  }
  let stopping = false;
  async function releaseCapture(): Promise<void> {
    if (!active || stopping || collecting) return;
    stopping = true;
    stopCapture.disabled = true;
    run.disabled = true;
    const g = generation;
    report.value = '';
    report.hidden = true;
    copy.hidden = true;
    status.textContent = t('calls.audio-check-stopping-capture');
    try {
      await options.stopCapture();
      if (g === generation) status.textContent = t('calls.capture-stopped');
    } catch {
      if (g === generation)
        status.textContent = t('calls.audio-check-stop-failed');
    } finally {
      if (g === generation) {
        stopping = false;
        run.disabled = false;
      }
    }
  }
  stopCapture.addEventListener('click', () => {
    void releaseCapture();
  });
  run.addEventListener('click', () => {
    void collect();
  });
  copy.addEventListener('click', () => {
    void copyReport();
  });
  return {
    element,
    update(next: boolean, stopped = false): void {
      stopCapture.disabled = stopped || stopping;
      if (active === next) return;
      active = next;
      element.hidden = !next;
      generation++;
      collecting = false;
      stopping = false;
      stopCapture.disabled = stopped;
      run.disabled = false;
      report.value = '';
      report.hidden = true;
      copy.hidden = true;
      status.textContent = '';
      if (!next) element.open = false;
    },
  };
}
