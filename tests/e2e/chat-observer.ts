/** Runs only in disposable synthetic browser contexts. Observation owns no app state. */
export function installObserver(detailed: boolean): void {
  const host = window as unknown as {
    chatE2EEvent: (event: unknown) => Promise<void>;
  };
  const seen = new Set<string>();
  let count = 0,
    dropped = false;
  function publish(event: unknown): void {
    if (++count <= 20_000)
      void host.chatE2EEvent(event).catch(() => {
        /* The runner may already be closing this page. */
      });
    else if (!dropped) {
      dropped = true;
      void host.chatE2EEvent({ event: 'dropped' }).catch(() => {
        /* Page teardown can close the runner binding. */
      });
    }
  }
  let previousDepth = -1;
  function scan(): void {
    const depth = document.querySelectorAll(
      '[data-group-pending], [data-message-pending] li',
    ).length;
    if (depth !== previousDepth) {
      previousDepth = depth;
      publish({ event: 'pending-presentation-depth', value: depth });
    }
    for (const row of document.querySelectorAll<HTMLElement>(
      '[data-message-history] article, [data-group-history] article, [data-group-pending], [data-message-pending] li',
    ))
      observeRow(row);
  }
  function observeRow(row: HTMLElement): void {
    if (!row.checkVisibility()) return;
    const token = Array.from(row.querySelectorAll('p'))
      .map((paragraph) => paragraph.textContent ?? '')
      .find((text) => /^E2E-[a-z0-9-]+$/u.test(text));
    const stage = row.matches('[data-group-pending], [data-message-pending] li')
      ? 'pending'
      : 'visible';
    const key = `${stage}:${token}`;
    if (!token || seen.has(key)) return;
    seen.add(key);
    publish({
      event: stage,
      token,
      id:
        row.dataset['message'] ??
        row.dataset['groupMessage'] ??
        row.dataset['groupPending'],
    });
  }

  new MutationObserver(scan).observe(document, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['hidden'],
  });
  document.addEventListener(
    'submit',
    (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      const token = form.querySelector<HTMLTextAreaElement>(
        '[data-message-text], [data-group-text]',
      )?.value;
      if (token?.startsWith('E2E-')) publish({ event: 'submit', token });
    },
    true,
  );
  window.addEventListener('0xdmme-chat-sync-diagnostic-event', (event) => {
    if (!(event instanceof CustomEvent)) return;
    const detail: unknown = event.detail;
    if (
      typeof detail === 'object' &&
      detail !== null &&
      'event' in detail &&
      detail.event === 'coverage-limited'
    )
      publish({ event: 'dropped' });
    publish({ event: 'diagnostic', detail });
  });
  const start = () => {
    if (detailed)
      window.dispatchEvent(
        new CustomEvent('0xdmme-chat-sync-diagnostic-control', {
          detail: 'start',
        }),
      );
    scan();
  };
  window.addEventListener('load', start, { once: true });
  start();
  if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        publish({ event: 'longtask', duration: entry.duration });
    }).observe({ type: 'longtask' });
  }
}
