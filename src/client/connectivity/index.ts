import { requestApi } from '../api-transport/index.ts';
import { installedApplication } from '../application-origin/index.ts';
import { Connectivity } from './state.ts';

export const networkOnlineEvent = '0xdmme-network-online';
export const networkOfflineEvent = '0xdmme-network-offline';
let close: (() => void) | null = null;

async function probeServer(signal: AbortSignal): Promise<boolean> {
  const response = await requestApi('/health/live', {
    method: 'HEAD',
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
    signal,
  });
  // HTTP errors still prove connectivity; their operations must fail normally.
  return response.status > 0;
}

const connectivity = new Connectivity({
  hint: () => globalThis.navigator?.onLine !== false,
  changed: (online) => {
    if (close)
      window.dispatchEvent(
        new Event(online ? networkOnlineEvent : networkOfflineEvent),
      );
  },
  // Installed clients keep their restricted native transport. Its API responses
  // supply evidence; a web health probe must never target their asset origin.
  ...(installedApplication() ? {} : { probe: probeServer }),
});

export function networkAvailable(): boolean {
  return connectivity.online;
}
export function recordServerResponse(): void {
  connectivity.responded();
}
export function recordNetworkFailure(): void {
  connectivity.failed();
}

/** The document entry owns the one foreground probe and its browser listeners.
 * Workers can use response evidence without starting a timer or DOM lifecycle.
 */
export function startConnectivity(): () => void {
  if (close) return close;
  const lifetime = new AbortController(),
    options = { signal: lifetime.signal };
  const resume = () => {
    if (document.visibilityState === 'hidden') connectivity.pause();
    else connectivity.resume();
  };
  close = () => {
    if (lifetime.signal.aborted) return;
    lifetime.abort();
    connectivity.pause();
    close = null;
  };
  window.addEventListener('online', () => connectivity.hintChanged(), options);
  window.addEventListener('offline', () => connectivity.hintChanged(), options);
  window.addEventListener('focus', resume, options);
  window.addEventListener('pageshow', resume, options);
  document.addEventListener('visibilitychange', resume, options);
  document.addEventListener('resume', resume, options);
  document.addEventListener('freeze', () => connectivity.pause(), options);
  window.addEventListener(
    'pagehide',
    (event) => {
      connectivity.pause();
      if (!event.persisted) close?.();
    },
    options,
  );
  resume();
  return close;
}
