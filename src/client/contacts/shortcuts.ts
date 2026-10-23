/** Sidebar + menu links route to Contacts; the "add" link also requests the
 * editor, which the Contacts view opens once it is mounted. */
export function bindContactShortcuts(root: Document, add: () => void): void {
  root.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLElement>('[data-contact-shortcut]');
    if (!link) return;
    link.closest('details')?.removeAttribute('open');
    // A modified click opens a new tab; this view must not queue an editor.
    if (link.dataset['contactShortcut'] === 'add' && sameTab(event)) add();
  });
}

function sameTab(event: MouseEvent): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}
