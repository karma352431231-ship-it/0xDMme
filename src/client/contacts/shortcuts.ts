/** Sidebar + menu entries: links route to Contacts; "add" opens the add
 * editor over the current view without leaving it. */
export function bindContactShortcuts(root: Document, add: () => void): void {
  root.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const entry = event.target.closest<HTMLElement>('[data-contact-shortcut]');
    if (!entry) return;
    entry.closest('details')?.removeAttribute('open');
    if (entry.dataset['contactShortcut'] === 'add') add();
  });
}
