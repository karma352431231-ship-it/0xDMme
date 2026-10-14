const disclosures = [
  '.directory-create-menu',
  '.chat-options',
  '.community-more',
  '.post-more',
  '.discovery-menu',
  '.community-post-more',
  '.group-member-menu',
  '[data-transient-menu]',
];
const selector = disclosures.map((name) => `details${name}[open]`).join(',');
const started = new WeakSet<Document>();

/** One delegated binding covers menus added by routing and background updates. */
export function startTransientMenus(root: Document = document): void {
  if (started.has(root)) return;
  started.add(root);
  root.addEventListener(
    'click',
    (event) => {
      if (!(event.target instanceof Node)) return;
      for (const menu of root.querySelectorAll<HTMLDetailsElement>(selector))
        if (!menu.contains(event.target)) menu.open = false;
    },
    { capture: true },
  );
  root.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape') return;
      const menus = [...root.querySelectorAll<HTMLDetailsElement>(selector)];
      const target = event.target;
      const focused = menus.findLast(
        (item) => target instanceof Node && item.contains(target),
      );
      if (
        !focused &&
        root.querySelector('dialog[open], [popover]:popover-open')
      )
        return;
      const menu = focused ?? menus.at(-1);
      if (!menu) return;
      menu.open = false;
      menu.querySelector<HTMLElement>('summary')?.focus();
      event.preventDefault();
      event.stopPropagation();
    },
    { capture: true },
  );
}

/** Only option dialogs opt in; editor/confirmation dialogs keep their lifecycle. */
export function bindMenuBackdrop(menu: HTMLDialogElement): void {
  menu.addEventListener('click', (event) => {
    if (event.target !== menu) return;
    const rect = menu.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      menu.close();
  });
}
