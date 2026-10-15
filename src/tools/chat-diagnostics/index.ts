import { Recording } from './recording.ts';
import { observeAuthorityLocks } from './locks.ts';
import { observeNetwork } from './network.ts';
import { observeControlFrames } from './stream.ts';
import { observePage, observeLag } from './page.ts';

interface DiagnosticWindow extends Window {
  __0xdmmeLag?: ReturnType<typeof start>;
}

/** Console-only entry. No app import, automatic installation or remote export. */
function start() {
  const recording = new Recording();
  const stopHooks: (() => void)[] = [];
  const panel = document.createElement('aside');
  panel.setAttribute('aria-label', 'Medidor local de sincronização');
  panel.style.cssText =
    'position:fixed;top:8px;right:8px;z-index:2147483647;padding:12px;border:1px solid GrayText;background:Canvas;color:CanvasText;font:13px system-ui;max-width:260px;box-shadow:0 2px 8px GrayText;';
  const label = document.createElement('div');
  label.textContent = '0xDMme · medidor local ativo (até 10 min)';
  const marker = document.createElement('button');
  marker.type = 'button';
  marker.textContent = 'Marcar demora';
  marker.onclick = () => recording.record('manual-marker');
  const done = document.createElement('button');
  done.type = 'button';
  done.textContent = 'Parar e baixar relatório';
  panel.append(label, marker, done);
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  function stop() {
    if (!stopped) {
      stopped = true;
      clearTimeout(deadline);
      for (const hook of stopHooks.reverse()) hook();
      recording.stop();
      label.textContent = 'Captura encerrada · relatório apenas local';
      marker.disabled = true;
      done.textContent = 'Baixar relatório';
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
  throw new Error('Execute o medidor somente no 0xDMme ou no teste local.');
const host = window as DiagnosticWindow;
if (host.__0xdmmeLag?.report().active)
  throw new Error('O medidor já está ativo nesta aba.');
host.__0xdmmeLag?.remove();
host.__0xdmmeLag = start();
console.info(
  'Medidor local ativo. Reproduza a demora e use Parar e baixar relatório. Não recarregue a página durante a captura.',
);
