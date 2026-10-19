import { t } from '../../shared/i18n/index.ts';
import { startLanguage } from '../language/index.ts';
import {
  beginProbe,
  readProbe,
  ready,
  receiveProbe,
  probeLifetime,
} from './index.ts';
import type { NativeProbe } from './index.ts';
import { startScrollbarFade } from '../scrollbars/index.ts';

startLanguage();
startScrollbarFade();
const storageKey = '0xdmme:phantom-native-probe:v1';
const start = document.querySelector<HTMLButtonElement>('[data-probe-start]');
const cancel = document.querySelector<HTMLButtonElement>('[data-probe-cancel]');
const launch = document.querySelector<HTMLAnchorElement>('[data-probe-launch]');
const status = document.querySelector<HTMLElement>('[data-probe-status]');
if (!start || !cancel || !launch || !status)
  throw new Error('Proof page incomplete.');
const controls = { start, cancel, launch, status };
let current: NativeProbe | null = null;
let timer: number | undefined;
let initialized = false;
// Remove ciphertext/state from the visible URL before loading crypto or storage.
const callback = new URLSearchParams(location.search);
history.replaceState(null, '', '/phantom-probe.html');

function clear(): void {
  window.clearTimeout(timer);
  timer = undefined;
  current = null;
  localStorage.removeItem(storageKey);
  controls.launch.hidden = true;
  controls.launch.removeAttribute('href');
  controls.cancel.hidden = true;
  controls.start.disabled = !initialized;
}
function save(state: NativeProbe, link: string): void {
  localStorage.setItem(storageKey, JSON.stringify(state));
  current = state;
  controls.launch.href = link;
  controls.launch.hidden = false;
  controls.launch.textContent =
    state.phase === 'connect'
      ? t('Open Phantom')
      : t('Confirm message in Phantom');
  controls.cancel.hidden = false;
  controls.start.disabled = true;
  window.clearTimeout(timer);
  timer = window.setTimeout(
    expire,
    Math.max(0, state.createdAt + probeLifetime - Date.now()),
  );
}
function expire(): void {
  try {
    if (!current) return;
    readProbe(current);
    window.clearTimeout(timer);
    timer = window.setTimeout(
      expire,
      Math.max(0, current.createdAt + probeLifetime - Date.now()),
    );
  } catch {
    fail();
    controls.status.textContent = t('Proof expired. Start a new connection.');
  }
}
function stored(): NativeProbe | null {
  const raw = localStorage.getItem(storageKey);
  if (raw === null) return null;
  if (raw.length > 6144) throw new Error('Record exceeds the limit.');
  return readProbe(JSON.parse(raw));
}
function fail(): void {
  try {
    clear();
  } catch {
    current = null;
    controls.launch.hidden = true;
    controls.cancel.hidden = true;
    controls.start.disabled = true;
  }
  controls.status.textContent = t(
    'Proof not completed. Check your wallet and connection. If storage is blocked, allow it before starting a new proof.',
  );
}
async function initialize(): Promise<void> {
  await ready();
  initialized = true;
  const previous = stored();
  if (!callback.size) {
    clear();
    controls.status.textContent = t(
      'Ready to test connection, signing and return. No 0xDMme account will be connected.',
    );
    return;
  }
  if (!previous) throw new Error('Proof missing.');
  const result = receiveProbe(previous, callback, location.origin);
  if (result.complete) {
    clear();
    controls.status.textContent = t(
      'Test signature confirmed. Phantom returned the response to this browser. No 0xDMme account was connected. If this is another tab, return to the original tab to compare the result.',
    );
    return;
  }
  save(result.state, result.link);
  controls.status.textContent = t(
    'Connection confirmed. Tap “Confirm message in Phantom”, check the test message and sign. Your wallet will request a return to this site.',
  );
}
controls.start.addEventListener('click', () => {
  if (!initialized || current) return;
  try {
    const pending = beginProbe(location.origin);
    save(pending.state, pending.link);
    controls.status.textContent = t(
      'Confirm the connection in Phantom. If opening is blocked, tap “Open Phantom”.',
    );
    location.assign(pending.link);
  } catch {
    fail();
  }
});
controls.cancel.addEventListener('click', () => {
  try {
    clear();
    controls.status.textContent = t(
      'Proof cancelled. Old returns will not be accepted.',
    );
  } catch {
    fail();
  }
});
window.addEventListener('pageshow', expire);
window.addEventListener('focus', expire);
document.addEventListener('visibilitychange', expire);
window.addEventListener('pagehide', () => window.clearTimeout(timer));
void initialize().catch(fail);
