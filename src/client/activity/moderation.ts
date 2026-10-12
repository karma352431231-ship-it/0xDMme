export interface ModerationActivity {
  id: string;
  title: string;
  reason: string;
}
/** Only the moderation source is refreshed; background tabs do no polling. */
export function watchModeration(
  refresh: () => Promise<void>,
  signal: AbortSignal,
): void {
  let timer: ReturnType<typeof setTimeout>;
  const cancel = () => clearTimeout(timer);
  const check = async () => {
    signal.removeEventListener('abort', cancel);
    if (signal.aborted) return;
    try {
      if (!document.hidden) await refresh();
    } finally {
      if (!signal.aborted) schedule();
    }
  };
  function schedule(): void {
    timer = setTimeout(() => {
      void check();
    }, 30_000);
    signal.addEventListener('abort', cancel, { once: true });
  }
  schedule();
}
export function moderationRows(
  items: readonly ModerationActivity[],
): HTMLElement[] {
  return items.map((item) => {
    const row = document.createElement('article'),
      title = document.createElement('strong'),
      reason = document.createElement('p'),
      link = document.createElement('a');
    row.className = 'activity-row';
    title.textContent = item.title;
    reason.textContent = item.reason;
    link.textContent = 'Ver análise e contestar';
    link.href = '#perfil';
    row.append(title, reason, link);
    return row;
  });
}
