/** Disposable synthetic loopback fixture only; never bundled into the product. */
export function syntheticVaultControls(): void {
  let offline = sessionStorage.getItem('synthetic-vault-offline') === '1';
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, options) =>
    offline
      ? Promise.reject(new TypeError('Rede indisponível na fixture sintética.'))
      : originalFetch(input, options);
  Object.defineProperty(navigator, 'onLine', {
    get: () => !offline,
    configurable: true,
  });
  const controls = document.createElement('aside');
  controls.className = 'card';
  controls.setAttribute('aria-label', 'Controles do teste sintético');
  const status = document.createElement('p');
  status.textContent = offline
    ? 'Fixture sintética: sinal offline.'
    : 'Fixture sintética: rede disponível.';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.textContent = offline
    ? 'Restaurar rede da fixture'
    : 'Simular modo offline';
  toggle.addEventListener('click', () => {
    offline = !offline;
    sessionStorage.setItem('synthetic-vault-offline', offline ? '1' : '0');
    toggle.textContent = offline
      ? 'Restaurar rede da fixture'
      : 'Simular modo offline';
    status.textContent = offline
      ? 'Fixture sintética: sinal offline.'
      : 'Fixture sintética: rede disponível.';
    window.dispatchEvent(new Event(offline ? 'offline' : 'online'));
  });
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.textContent = 'Limpar cofre local sintético e recarregar';
  clear.addEventListener('click', () => {
    const request = indexedDB.deleteDatabase('0xdmme-vault');
    request.onerror = () => {
      status.textContent = 'Falha na limpeza sintética.';
    };
    request.onblocked = () => {
      status.textContent = 'Feche outras abas desta origem antes de limpar.';
    };
    request.onsuccess = () => location.reload();
  });
  controls.append(status, toggle, clear);
  document.querySelector('main')?.prepend(controls);
}
