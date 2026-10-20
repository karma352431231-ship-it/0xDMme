import { t } from '../../shared/i18n/index.ts';
import { openImageViewer } from '../image-viewer/index.ts';
import { showToast } from '../toast/index.ts';

/** A header viewer survives ordinary repaints, but never a peer/session change. */
export class ChatAvatarPhoto {
  private mounted: {
    trigger: HTMLButtonElement;
    peer: string;
    parent: AbortSignal;
    stop: AbortController;
    accept: (url: string | null) => void;
  } | null = null;

  bind(input: {
    trigger: HTMLButtonElement;
    peer: string;
    signal: AbortSignal;
  }): (url: string | null) => void {
    const previous = this.mounted;
    if (
      previous?.trigger === input.trigger &&
      previous.peer === input.peer &&
      previous.parent === input.signal &&
      !previous.stop.signal.aborted
    )
      return previous.accept;
    this.clear();
    const stop = new AbortController();
    const signal = AbortSignal.any([input.signal, stop.signal]);
    const accept = bindPhoto(input.trigger, signal);
    this.mounted = {
      trigger: input.trigger,
      peer: input.peer,
      parent: input.signal,
      stop,
      accept,
    };
    return accept;
  }
  clear(): void {
    this.mounted?.stop.abort();
    this.mounted = null;
  }
}

function bindPhoto(
  trigger: HTMLButtonElement,
  signal: AbortSignal,
): (url: string | null) => void {
  let current: string | null = null,
    close: (() => void) | null = null;
  const accept = (url: string | null): void => {
    if (signal.aborted) return;
    if (url !== current) {
      close?.();
      close = null;
    }
    current = url;
    trigger.disabled = !url;
  };
  trigger.disabled = true;
  trigger.addEventListener(
    'click',
    () => {
      if (!current || signal.aborted) return;
      close?.();
      try {
        close = openImageViewer({
          url: current,
          alt: t('Enlarged image'),
          trigger,
          signal,
        });
      } catch {
        showToast(t('Could not open the enlarged image.'));
      }
    },
    { signal },
  );
  signal.addEventListener(
    'abort',
    () => {
      close?.();
      trigger.disabled = true;
    },
    { once: true },
  );
  return accept;
}
