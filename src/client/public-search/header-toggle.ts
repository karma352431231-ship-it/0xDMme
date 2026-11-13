/**
 * Phones open the public search from the fixed top bar (13/11/2026), so it is
 * reachable anywhere in a long feed. The field itself is a regular public
 * search mount; this only opens it over the title and closes it again.
 */
export function startHeaderSearch(bar: HTMLElement): void {
  const open = bar.querySelector<HTMLButtonElement>(
    '[data-header-search-open]',
  );
  const panel = bar.querySelector<HTMLElement>('[data-header-search]');
  if (!open || !panel) return;
  const input = () => panel.querySelector<HTMLInputElement>('input');
  const show = () => {
    panel.hidden = false;
    bar.dataset['headerSearch'] = 'open';
    open.setAttribute('aria-expanded', 'true');
    input()?.focus();
  };
  const hide = () => {
    if (panel.hidden) return;
    const field = input();
    if (field) field.value = '';
    // Leaving the field lets the search mount close its results.
    if (panel.contains(document.activeElement))
      (document.activeElement as HTMLElement).blur();
    panel.hidden = true;
    delete bar.dataset['headerSearch'];
    open.setAttribute('aria-expanded', 'false');
  };
  open.addEventListener('click', show);
  panel
    .querySelector('[data-header-search-close]')
    ?.addEventListener('click', () => {
      hide();
      open.focus();
    });
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !input()?.value) hide();
  });
  // A chosen result or any other navigation ends the search.
  window.addEventListener('hashchange', hide);
}
