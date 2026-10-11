interface GroupEntrypoints {
  available: () => boolean;
  create: () => void;
  join: (url?: string) => void;
}
/** Keep an incoming bearer link in memory while login/device authorization completes. */
export function startGroupEntrypoints(options: GroupEntrypoints): {
  ready: () => void;
} {
  let pending = location.hash.startsWith('#grupo=') ? location.href : '';
  const ready = (): void => {
    if (!pending || !options.available()) return;
    try {
      options.join(pending);
      pending = '';
      if (location.hash.startsWith('#grupo='))
        history.replaceState(null, '', '#conversas');
    } catch (error: unknown) {
      showError(error);
    }
  };
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLElement>(
      '[data-private-group-action]',
    );
    if (!button) return;
    button.closest('details')?.removeAttribute('open');
    if (!options.available()) {
      window.alert('Entre e autorize este aparelho para usar grupos privados.');
      return;
    }
    try {
      if (button.dataset['privateGroupAction'] === 'create') options.create();
      else options.join();
    } catch (error: unknown) {
      showError(error);
    }
  });
  window.addEventListener('hashchange', () => {
    if (!location.hash.startsWith('#grupo=')) return;
    pending = location.href;
    ready();
  });
  return { ready };
}
function showError(error: unknown): void {
  window.alert(
    error instanceof Error ? error.message : 'Não foi possível abrir o grupo.',
  );
}
