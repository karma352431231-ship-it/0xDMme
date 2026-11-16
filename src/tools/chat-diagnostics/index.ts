import { DiagnosticPanel } from './panel.ts';
import { compareDelivery } from './delivery-comparison.ts';
import { deliveryReadiness } from './readiness.ts';
import { Recording } from './recording.ts';
import { observeAuthorityLocks } from './locks.ts';
import { observeNetwork } from './network.ts';
import { observeControlFrames } from './stream.ts';
import { observePage, observeLag } from './page.ts';
import { observeSubmissions } from './submissions.ts';
import { observeSyncTriggers } from './triggers.ts';
import { observeReuseDecisions } from './reuse.ts';
import { chatSyncControl } from '../../shared/chat-sync-diagnostics/index.ts';
import {
  handlePairCode,
  handleDiagnosticRevision,
} from '../../shared/chat-sync-diagnostics/handle.ts';

interface DiagnosticWindow extends Window {
  __0xdmmeLag?: ReturnType<typeof start>;
}

/** Console-only entry. No app import, automatic installation or remote export. */
function start() {
  const native =
    location.hostname === 'localhost' &&
    ['https:', 'capacitor:'].includes(location.protocol);
  const recording = new Recording();
  const stopHooks: (() => void)[] = [];
  let panel: DiagnosticPanel | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let handleTimings = false;
  let revision = 0;
  let pairSent = false;

  function pair(code = crypto.randomUUID().replaceAll('-', '')): string {
    if (stopped || !handleTimings || revision !== handleDiagnosticRevision)
      throw new Error(
        'Handle delivery requires a compatible app build and an active capture. Check __0xdmmeLag.ready().',
      );
    if (pairSent || !handlePairCode(code))
      throw new Error(
        'Use one pairing code per capture. The code must have 32 lowercase hex characters.',
      );
    pairSent = true;
    window.dispatchEvent(
      new CustomEvent(chatSyncControl, { detail: { handlePair: code } }),
    );
    return code;
  }

  function stop() {
    if (!stopped) {
      stopped = true;
      panel?.close();
      panel = undefined;
      clearTimeout(deadline);
      for (const hook of stopHooks.reverse()) hook();
      recording.stop();
    }
    return recording.report();
  }
  function download() {
    const blob = new Blob([JSON.stringify(stop(), null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob),
      link = document.createElement('a');
    link.href = url;
    link.download = '0xdmme-chat-lag.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  try {
    const locks = observeAuthorityLocks(recording.record);
    stopHooks.push(locks.stop);
    stopHooks.push(observeNetwork(recording.record, locks.active));
    stopHooks.push(observeControlFrames(recording.record));
    stopHooks.push(observePage(recording.record));
    stopHooks.push(observeSyncTriggers(recording.record));
    stopHooks.push(
      observeReuseDecisions(
        recording.record,
        (available, sendTimings, handles, appRevision) => {
          handleTimings = available && sendTimings && handles;
          revision = appRevision;
        },
      ),
    );
    stopHooks.push(observeSubmissions(recording.record));
    stopHooks.push(observeLag(recording.record));
    const lifecycle = new AbortController();
    window.addEventListener('pagehide', stop, { signal: lifecycle.signal });
    stopHooks.push(() => lifecycle.abort());
    deadline = setTimeout(stop, 600_000);
    recording.record('capture-started');
  } catch (error: unknown) {
    stop();
    throw error;
  }
  const mark = () => recording.record('manual-marker');
  const stopFromPanel = () => {
    if (!native) {
      download();
      return;
    }
    stop();
    console.info(
      'Export on the Mac: copy(JSON.stringify(window.__0xdmmeLag.stop(), null, 2))',
    );
  };
  const showPanel = () => {
    if (stopped) return;
    panel ??= new DiagnosticPanel({
      native,
      pair,
      mark,
      finish: stopFromPanel,
      status: () => ({
        label: deliveryReadiness(recording.readiness()).label,
        canPair: handleTimings && revision === handleDiagnosticRevision,
        configured: pairSent,
      }),
    });
    panel.show();
  };
  return Object.freeze({
    report: () => recording.report(),
    compare: (recipient: ReturnType<Recording['report']>) =>
      compareDelivery(recording.report(), recipient),
    ready: () => {
      const readiness = recording.readiness();
      return {
        ...deliveryReadiness(readiness),
        senderPreparationAvailable: readiness.senderPreparationAvailable,
        peerConfirmed: false,
        expectedRevision: handleDiagnosticRevision,
      };
    },
    stop,
    download,
    pair,
    mark,
    showPanel,
    hidePanel: () => panel?.hide(),
    remove: () => {
      stop();
    },
  });
}

if (!['0xdmme.app', 'localhost', '127.0.0.1'].includes(location.hostname))
  throw new Error(
    'Run the meter only on 0xDMme or the local test environment.',
  );
const host = window as DiagnosticWindow;
if (host.__0xdmmeLag?.report().active)
  throw new Error('The meter is already active in this tab.');
host.__0xdmmeLag?.remove();
host.__0xdmmeLag = start();
console.info(
  'Meter installed in the console. Use __0xdmmeLag.report() or __0xdmmeLag.stop(). Paired delivery uses __0xdmmeLag.ready() on both devices.',
  host.__0xdmmeLag.ready(),
);
