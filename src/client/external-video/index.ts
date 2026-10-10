import { externalVideoIds } from '../../shared/external-video/index.ts';
import { externalMediaGate } from '../external-media/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';

/** Visitors keep only the original links. Membership and consent never cause
 * iframe/thumbnail requests before the reader presses play. */
export function showExternalVideos(
  host: HTMLElement,
  text: string,
  options: {
    privacy: ExternalMediaConsent;
    signal: AbortSignal;
  },
): () => void {
  const ids = externalVideoIds(text);
  if (!ids.length) return () => undefined;
  const stop = new AbortController();
  const signal = AbortSignal.any([
    options.signal,
    options.privacy.signal,
    stop.signal,
  ]);
  const field = document.createElement('div');
  field.className = 'community-external-videos';
  const slots = ids.map((id) => {
    const slot = document.createElement('section');
    const link = document.createElement('a');
    link.href = `https://www.youtube.com/watch?v=${id}`;
    link.textContent = 'Abrir vídeo no YouTube';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    slot.append(link);
    field.append(slot);
    return { id, slot };
  });
  host.append(field);
  const cleanup = () => {
    stop.abort();
    field.remove();
  };
  signal.addEventListener('abort', cleanup, { once: true });
  if (signal.aborted) cleanup();
  else void prepare();
  async function prepare(): Promise<void> {
    try {
      if (
        !(await options.privacy.hasPublicProfile()) ||
        signal.aborted ||
        !field.isConnected
      )
        return;
      for (const { id, slot } of slots)
        externalMediaGate(slot, {
          consent: options.privacy,
          kind: 'video',
          signal,
          label: 'Reproduzir vídeo do YouTube',
          render: (target) => target.append(youtubePlayer(id)),
        });
    } catch (error: unknown) {
      if (!signal.aborted)
        field.textContent =
          error instanceof Error
            ? error.message
            : 'Player externo indisponível.';
    }
  }
  return cleanup;
}
function youtubePlayer(id: string): HTMLIFrameElement {
  const player = document.createElement('iframe');
  player.title = 'Vídeo do YouTube';
  player.referrerPolicy = 'strict-origin-when-cross-origin';
  player.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
  player.allowFullscreen = true;
  player.setAttribute(
    'sandbox',
    'allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox',
  );
  player.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1`;
  return player;
}
