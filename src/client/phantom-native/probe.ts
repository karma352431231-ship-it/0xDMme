import {
  beginProbe,
  readProbe,
  ready,
  receiveProbe,
  probeLifetime,
} from './index.ts';
import type { NativeProbe } from './index.ts';

const storageKey = '0xdmme:phantom-native-probe:v1';
const start = document.querySelector<HTMLButtonElement>('[data-probe-start]');
const cancel = document.querySelector<HTMLButtonElement>('[data-probe-cancel]');
const launch = document.querySelector<HTMLAnchorElement>('[data-probe-launch]');
const status = document.querySelector<HTMLElement>('[data-probe-status]');
if (!start || !cancel || !launch || !status)
  throw new Error('Página de prova incompleta.');
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
      ? 'Abrir Phantom'
      : 'Confirmar mensagem na Phantom';
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
    controls.status.textContent = 'Prova expirada. Inicie uma nova conexão.';
  }
}
function stored(): NativeProbe | null {
  const raw = localStorage.getItem(storageKey);
  if (raw === null) return null;
  if (raw.length > 6144) throw new Error('Registro excedido.');
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
  controls.status.textContent =
    'Prova não concluída. Confira a wallet e a conexão. Se o armazenamento estiver bloqueado, permita-o antes de iniciar uma nova prova.';
}
async function initialize(): Promise<void> {
  await ready();
  initialized = true;
  const previous = stored();
  if (!callback.size) {
    clear();
    controls.status.textContent =
      'Pronto para testar conexão, assinatura e retorno. Nenhuma conta do 0xDMme será conectada.';
    return;
  }
  if (!previous) throw new Error('Prova ausente.');
  const result = receiveProbe(previous, callback, location.origin);
  if (result.complete) {
    clear();
    controls.status.textContent =
      'Assinatura de teste confirmada. A Phantom devolveu a resposta a este navegador. Nenhuma conta do 0xDMme foi conectada. Se esta for outra aba, volte à aba original para comparar o retorno.';
    return;
  }
  save(result.state, result.link);
  controls.status.textContent =
    'Conexão confirmada. Toque em “Confirmar mensagem na Phantom”, confira a mensagem de teste e assine. A wallet solicitará o retorno a este site.';
}
controls.start.addEventListener('click', () => {
  if (!initialized || current) return;
  try {
    const pending = beginProbe(location.origin);
    save(pending.state, pending.link);
    controls.status.textContent =
      'Confirme a conexão na Phantom. Se a abertura for bloqueada, toque em “Abrir Phantom”.';
    location.assign(pending.link);
  } catch {
    fail();
  }
});
controls.cancel.addEventListener('click', () => {
  try {
    clear();
    controls.status.textContent =
      'Prova cancelada. Retornos antigos não serão aceitos.';
  } catch {
    fail();
  }
});
window.addEventListener('pageshow', expire);
window.addEventListener('focus', expire);
document.addEventListener('visibilitychange', expire);
window.addEventListener('pagehide', () => window.clearTimeout(timer));
void initialize().catch(fail);
