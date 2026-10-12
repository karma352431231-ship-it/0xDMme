import { mediaEditor } from '../community-media/index.ts';
import type { CommunityMediaAccess } from '../community-media/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import { GifSearch, mountGifPane } from '../gif-search/index.ts';
import { communityElement as el } from './elements.ts';
export type PostEditorAccess = CommunityMediaAccess & {
  privacy?: ExternalMediaConsent;
};
/** File and GIF controls are part of the text editor; selection only changes its draft. */
export function postEditorMedia(input: {
  container: HTMLElement;
  text: HTMLInputElement | HTMLTextAreaElement;
  ids: string[];
  access: PostEditorAccess;
}): () => Promise<string[]> {
  const editor = el('div', '', 'post-text-editor'),
    area = el('div', '', 'post-text-area'),
    controls = el('div', '', 'post-text-tools'),
    pane = el('div', '', 'post-gif-pane');
  const label = input.text.parentElement;
  input.text.id ||= `post-text-${crypto.randomUUID()}`;
  if (label instanceof HTMLLabelElement) label.htmlFor = input.text.id;
  label?.after(editor);
  area.append(input.text, controls);
  editor.append(area, pane);
  pane.hidden = true;
  const media = mediaEditor(input.container, input.ids, input.access, controls);
  gifControl(controls, pane, input);
  return media;
}
function gifControl(
  controls: HTMLElement,
  pane: HTMLElement,
  input: {
    text: HTMLInputElement | HTMLTextAreaElement;
    access: PostEditorAccess;
  },
): void {
  const button = el('button', 'GIF', 'post-gif-button');
  button.type = 'button';
  button.setAttribute('aria-label', 'Escolher GIF');
  button.setAttribute('aria-expanded', 'false');
  controls.prepend(button);
  let mounted = false,
    pending = false;
  const consent = input.access.privacy;
  const search = consent
    ? new GifSearch(
        () => consent.authorize('gifs', input.access.signal),
        () => AbortSignal.any([input.access.signal, consent.signal]),
      )
    : null;
  button.addEventListener('click', () => {
    if (pending) return;
    pane.hidden = !pane.hidden;
    button.setAttribute('aria-expanded', String(!pane.hidden));
    if (pane.hidden || mounted) return;
    pending = true;
    void (search?.available() ?? Promise.resolve(false))
      .then((available) => {
        if (!input.access.valid() || !pane.isConnected) return;
        if (!available || !search) {
          pane.textContent =
            'Busca de GIFs indisponível. Você pode anexar um arquivo GIF.';
          return;
        }
        mounted = true;
        mountGifPane(pane, search, (url) => {
          if (!input.access.valid()) return;
          const next = [input.text.value.trimEnd(), url]
            .filter(Boolean)
            .join('\n');
          if (next.length > input.text.maxLength) {
            pane.querySelector('[data-gif-status]')!.textContent =
              'Remova um pouco do texto para adicionar o GIF.';
            return;
          }
          input.text.value = next;
          input.text.dispatchEvent(new Event('input', { bubbles: true }));
          pane.hidden = true;
          button.setAttribute('aria-expanded', 'false');
          input.text.focus();
        });
      })
      .catch(() => {
        if (!input.access.signal.aborted)
          pane.textContent = 'Não foi possível abrir a busca de GIFs.';
      })
      .finally(() => {
        pending = false;
      });
  });
}
