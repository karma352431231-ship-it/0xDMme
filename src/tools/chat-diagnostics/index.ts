import { Recording } from './recording.ts';
import { observeAuthorityLocks } from './locks.ts';
import { observeNetwork } from './network.ts';
import { observeControlFrames } from './stream.ts';
import { observePage, observeLag } from './page.ts';
import { observeSubmissions } from './submissions.ts';
import { observeSyncTriggers } from './triggers.ts';
import { observeReuseDecisions } from './reuse.ts';

interface DiagnosticWindow extends Window {
  __0xdmmeLag?: ReturnType<typeof start>;
}

/** Console-only entry. No app import, automatic installation or remote export. */
function start() {
  const recording = new Recording();
  const stopHooks: (() => void)[] = [];
  const panel = document.createElement('aside');
  panel.setAttribute('aria-label', 'Local synchronization meter');
  panel.style.cssText =
    'position:fixed;top:8px;right:8px;z-index:2147483647;padding:12px;border:1px solid GrayText;background:Canvas;color:CanvasText;font:13px system-ui;max-width:260px;box-shadow:0 2px 8px GrayText;';
  const label = document.createElement('div');
  label.textContent = '0xDMme · local meter active (up to 10 min)';
  const marker = document.createElement('button');
  marker.type = 'button';
  marker.textContent = 'Mark delay';
  marker.onclick = () => recording.record('manual-marker');
  const done = document.createElement('button');
  done.type = 'button';
  done.textContent = 'Stop and download report';
  panel.append(label, marker, done);
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  function stop() {
    if (!stopped) {
      stopped = true;
      clearTimeout(deadline);
      for (const hook of stopHooks.reverse()) hook();
      recording.stop();
      label.textContent = 'Capture ended · local report only';
      marker.disabled = true;
      done.textContent = 'Download report';
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
      observeReuseDecisions(recording.record, (available) => {
        if (!available)
          label.textContent =
            'Meter active · update the app to capture internal reuse decisions';
      }),
    );
    stopHooks.push(observeSubmissions(recording.record));
    stopHooks.push(observeLag(recording.record));
    const lifecycle = new AbortController();
    window.addEventListener('pagehide', stop, { signal: lifecycle.signal });
    stopHooks.push(() => lifecycle.abort());
    document.body.append(panel);
    done.onclick = download;
    deadline = setTimeout(stop, 600_000);
    recording.record('capture-started');
  } catch (error: unknown) {
    stop();
    panel.remove();
    throw error;
  }
  return Object.freeze({
    report: () => recording.report(),
    stop,
    download,
    mark: () => recording.record('manual-marker'),
    remove: () => {
      stop();
      panel.remove();
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
  'Local meter active. Reproduce the delay and use Stop and download report. Do not reload the page during capture.',
);
