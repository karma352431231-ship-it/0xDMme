import { mediaEditor } from '../community-media/index.ts';
import type { CommunityMediaAccess } from '../community-media/index.ts';
import { EmojiPicker, emojiIntoComposer } from '../emoji/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import { GifSearch, mountGifPane } from '../gif-search/index.ts';
import { communityElement as el } from './elements.ts';
import { communityIcon } from './presentation.ts';
export type PostEditorAccess = CommunityMediaAccess & {
  privacy?: ExternalMediaConsent;
};
type PostText = HTMLInputElement | HTMLTextAreaElement;
/** File and GIF controls are part of the text editor; selection only changes its draft. */
export function postEditorMedia(input: {
  container: HTMLElement;
  text: PostText;
  ids: string[];
  access: PostEditorAccess;
}): () => Promise<string[]> {
  const editor = el('div', '', 'post-text-editor'),
    area = el('div', '', 'post-text-area'),
    controls = el('div', '', 'post-text-tools');
  const label = input.text.parentElement;
  input.text.id ||= `post-text-${crypto.randomUUID()}`;
  if (label instanceof HTMLLabelElement) label.htmlFor = input.text.id;
  label?.after(editor);
  area.append(input.text, controls);
  editor.append(area);
  const media = mediaEditor(input.container, input.ids, input.access, controls);
  gifControl(controls, input);
  return media;
}
/** The GIF link goes on its own line after the text, as in the chat. */
function appendGif(text: PostText, url: string): boolean {
  const next = [text.value.trimEnd(), url].filter(Boolean).join('\n');
  if (next.length > text.maxLength) return false;
  text.value = next;
  text.dispatchEvent(new Event('input', { bubbles: true }));
  text.focus();
  return true;
}
/**
 * Emoji and GIF buttons open the chat's floating panel on their own tab: the
 * same emoji grid and KLIPY search, inserting into the post or reply text.
 */
function gifControl(
  controls: HTMLElement,
  input: { text: PostText; access: PostEditorAccess },
): void {
  const emoji = el('button', '', 'post-emoji-button'),
    gif = el('button', 'GIF', 'post-gif-button'),
    status = el('span', '', 'post-gif-status');
  emoji.type = gif.type = 'button';
  emoji.setAttribute('aria-label', 'Escolher emoji');
  emoji.title = 'Emoji';
  emoji.append(communityIcon('emoji'));
  gif.setAttribute('aria-label', 'Escolher GIF');
  gif.title = 'GIF';
  status.setAttribute('role', 'status');
  controls.prepend(emoji, gif, status);
  const consent = input.access.privacy;
  const search = consent
    ? new GifSearch(
        () => consent.authorize('gifs', input.access.signal),
        () => AbortSignal.any([input.access.signal, consent.signal]),
      )
    : null;
  const picker = new EmojiPicker();
  input.access.signal.addEventListener('abort', () => picker.close(), {
    once: true,
  });
  const pane = (gifs: GifSearch) => (host: HTMLElement, close: () => void) =>
    mountGifPane(host, gifs, (url) => {
      if (!input.access.valid()) return;
      if (appendGif(input.text, url)) close();
      else
        host.querySelector('[data-gif-status]')!.textContent =
          'Remova um pouco do texto para adicionar o GIF.';
    });
  let pending = false;
  // Without KLIPY the emoji panel still opens, only without its GIF tab.
  const open = (anchor: HTMLElement, start: 'emoji' | 'gif') => {
    if (pending || !(input.text instanceof HTMLTextAreaElement)) return;
    const text = input.text;
    pending = true;
    status.textContent = '';
    void (search?.available() ?? Promise.resolve(false))
      .then((available) => {
        if (!input.access.valid() || !anchor.isConnected) return;
        const gifs = available ? search : null;
        if (!gifs && start === 'gif') {
          status.textContent =
            'Busca de GIFs indisponível. Você pode anexar um arquivo GIF.';
          return;
        }
        return emojiIntoComposer(
          picker,
          anchor,
          text,
          gifs ? { pane: pane(gifs), start } : {},
        );
      })
      .catch(() => {
        if (!input.access.signal.aborted)
          status.textContent = 'Não foi possível abrir o painel.';
      })
      .finally(() => {
        pending = false;
      });
  };
  emoji.addEventListener('click', () => open(emoji, 'emoji'));
  gif.addEventListener('click', () => open(gif, 'gif'));
}
