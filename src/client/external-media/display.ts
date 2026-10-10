import type { ExternalMediaConsent, ExternalMediaKind } from './consent.ts';

/** The link remains outside this gate. Only render may allocate provider URLs. */
export function externalMediaGate(
  host: HTMLElement,
  options: {
    consent: ExternalMediaConsent;
    kind: ExternalMediaKind;
    signal: AbortSignal;
    label: string;
    automatic?: boolean;
    render: (target: HTMLElement) => void;
  },
): () => void {
  const stop = new AbortController();
  const signal = AbortSignal.any([
    options.signal,
    options.consent.signal,
    stop.signal,
  ]);
  const field = document.createElement('div'),
    button = document.createElement('button'),
    content = document.createElement('div'),
    notice = document.createElement('small');
  field.className = 'external-media-gate';
  button.type = 'button';
  button.textContent = options.label;
  notice.setAttribute('role', 'status');
  field.append(button, content, notice);
  host.append(field);
  let loaded = false;
  async function load(): Promise<void> {
    if (signal.aborted || button.disabled || !field.isConnected) return;
    button.disabled = true;
    try {
      if (!(await options.consent.authorize(options.kind, signal))) {
        notice.textContent =
          'Mídia externa mantida como link. Altere a permissão no Perfil.';
        return;
      }
      if (signal.aborted || !field.isConnected) return;
      options.render(content);
      loaded = true;
      button.hidden = true;
      notice.textContent = '';
    } catch (error: unknown) {
      notice.textContent =
        error instanceof Error ? error.message : 'Mídia externa indisponível.';
    } finally {
      button.disabled = false;
    }
  }
  button.addEventListener('click', () => void load(), { signal });
  options.consent.subscribe(() => {
    if (loaded && !options.consent.permitted(options.kind)) {
      content.replaceChildren();
      loaded = false;
      button.hidden = false;
    }
  }, signal);
  const cleanup = () => {
    stop.abort();
    content.replaceChildren();
    field.remove();
  };
  signal.addEventListener('abort', cleanup, { once: true });
  if (signal.aborted) cleanup();
  else if (options.automatic) queueMicrotask(() => void load());
  return cleanup;
}
