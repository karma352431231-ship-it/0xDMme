const started = new WeakSet<Document>();
const mounted = new WeakSet<HTMLElement>();

function close(host: Element): void {
  const menu = host.querySelector<HTMLElement>(
    '[data-compose-attachment-menu]',
  );
  if (menu) menu.hidden = true;
  host
    .querySelector('[data-chat-attachment]')
    ?.setAttribute('aria-expanded', 'false');
}

function start(root: Document): void {
  if (started.has(root)) return;
  started.add(root);
  root.addEventListener('click', (event) => {
    for (const host of root.querySelectorAll('.compose-attachment'))
      if (event.target instanceof Node && !host.contains(event.target))
        close(host);
  });
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const menu = root.querySelector<HTMLElement>(
      '[data-compose-attachment-menu]:not([hidden])',
    );
    if (!menu) return;
    const host = menu.closest('.compose-attachment');
    if (!host) return;
    close(host);
    host.querySelector<HTMLElement>('[data-chat-attachment]')?.focus();
    event.preventDefault();
  });
}

/** The menu routes to the existing emoji and file handlers. */
export function bindComposerMenu(form: HTMLElement): void {
  if (mounted.has(form)) return;
  const anchor = form.querySelector<HTMLButtonElement>(
    '[data-chat-attachment]',
  );
  const menu = form.querySelector<HTMLElement>(
    '[data-compose-attachment-menu]',
  );
  const host = anchor?.closest('.compose-attachment');
  if (!anchor || !menu || !host) return;
  mounted.add(form);
  start(form.ownerDocument);
  anchor.addEventListener('click', () => {
    menu.hidden = !menu.hidden;
    anchor.setAttribute('aria-expanded', String(!menu.hidden));
  });
  menu.addEventListener('click', () => close(host));
  for (const button of menu.querySelectorAll<HTMLButtonElement>(
    '[data-attachment-kind]',
  ))
    button.addEventListener('click', () => {
      const file = form.querySelector<HTMLInputElement>(
        '[data-attachment-file]',
      );
      if (!file || file.disabled) return;
      file.accept =
        button.dataset['attachmentKind'] === 'image' ? 'image/*' : '';
      file.click();
    });
}
