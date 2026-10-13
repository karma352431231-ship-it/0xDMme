/** A read receipt must succeed before the current notification opens its target. */
export function noticeLink(input: {
  href: string;
  label: string;
  read?: boolean;
  acknowledge: () => Promise<void>;
  current: () => boolean;
  acknowledged: () => void;
}): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = 'activity-link';
  link.href = input.href;
  link.textContent = input.label;
  if (input.read) return link;
  let pending = false;
  const open = async () => {
    if (pending) return;
    pending = true;
    link.setAttribute('aria-busy', 'true');
    try {
      await input.acknowledge();
      if (!input.current()) return;
      input.acknowledged();
      location.hash = input.href;
    } catch (error: unknown) {
      if (input.current()) {
        link.textContent = 'Tentar abrir novamente';
        link.title =
          error instanceof Error
            ? error.message
            : 'Não foi possível marcar como lida.';
      }
    } finally {
      pending = false;
      link.removeAttribute('aria-busy');
    }
  };
  link.addEventListener('click', (event) => {
    if (
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    )
      return;
    event.preventDefault();
    void open();
  });
  return link;
}
