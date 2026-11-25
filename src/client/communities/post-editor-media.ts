import { t } from '../../shared/i18n/index.ts';
import { mentionValue, mountMentionInput } from '../public-mentions/index.ts';
import { mediaEditor } from '../community-media/index.ts';
import type { CommunityMediaAccess } from '../community-media/index.ts';
import { EmojiPicker, emojiIntoComposer } from '../emoji/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import {
  GifSearch,
  gifUrls,
  mountGifPane,
  mountGifDraft,
  withoutGifLinks,
} from '../gif-search/index.ts';
import { mountStickerDraft, stickerPane } from '../stickers/index.ts';
import {
  stickerReferences,
  withoutStickerLinks,
} from '../../shared/stickers/index.ts';
import { communityElement as el } from './elements.ts';
import { communityIcon } from './presentation.ts';
export type PostEditorAccess = CommunityMediaAccess & {
  privacy?: ExternalMediaConsent;
};
type PostText = HTMLInputElement | HTMLTextAreaElement;
export interface PostEditorContent {
  /** The words with the attached GIF and sticker links, as published. */
  text: () => string;
  media: () => Promise<string[]>;
}
/**
 * GIF and sticker links of a draft (owner, 25/11/2026: the community shows
 * only the picture, never the link). They live in a hidden field next to the
 * text, which keeps only the words; the squares under the editor read and
 * remove them there, and publishing puts them back after the words.
 */
interface DraftLinks {
  field: HTMLInputElement;
  /** The text field's own length limit for the whole post (0: none). */
  limit: number;
  /** The published text: the words, then each link on its own line. */
  compose: (words: string) => string;
}
function draftLinks(text: PostText, signal: AbortSignal): DraftLinks {
  const field = document.createElement('input'),
    limit = text.maxLength;
  field.type = 'hidden';
  field.className = 'post-draft-links';
  const gifs = gifUrls(text.value),
    stickers = stickerReferences(text.value);
  field.value = [...gifs, ...stickers.map((sticker) => sticker.link)].join(
    '\n',
  );
  text.value = withoutStickerLinks(withoutGifLinks(text.value, gifs), stickers);
  // The words leave room for the links, so the whole post stays in bounds.
  const fit = () => {
    if (limit > 0)
      text.maxLength = Math.max(
        0,
        limit - (field.value ? field.value.length + 1 : 0),
      );
  };
  field.addEventListener('input', fit, { signal });
  fit();
  return {
    field,
    limit: Math.max(0, limit),
    compose: (words) =>
      [words.trimEnd(), field.value].filter(Boolean).join('\n'),
  };
}
/** File and GIF controls are part of the text editor; selection only changes its draft. */
export function postEditorMedia(input: {
  container: HTMLElement;
  text: PostText;
  ids: string[];
  access: PostEditorAccess;
}): PostEditorContent {
  const editor = el('div', '', 'post-text-editor'),
    area = el('div', '', 'post-text-area'),
    controls = el('div', '', 'post-text-tools');
  const label = input.text.parentElement;
  input.text.id ||= `post-text-${crypto.randomUUID()}`;
  if (label instanceof HTMLLabelElement) label.htmlFor = input.text.id;
  label?.after(editor);
  area.append(input.text, controls);
  editor.append(area);
  const links = draftLinks(input.text, input.access.signal);
  input.container.append(links.field);
  mountMentionInput(input.text, input.access.signal);
  const media = mediaEditor(input.container, input.ids, input.access, controls);
  if (input.access.privacy)
    mountGifDraft({
      host: input.container,
      text: links.field,
      privacy: input.access.privacy,
      signal: input.access.signal,
    });
  mountStickerDraft({
    host: input.container,
    text: links.field,
    privacy: input.access.privacy,
    signal: input.access.signal,
  });
  gifControl(controls, { text: input.text, links, access: input.access });
  return { text: () => links.compose(mentionValue(input.text)), media };
}
/** A GIF or sticker joins the draft's links if the whole post still fits. */
function attachLink(text: PostText, links: DraftLinks, link: string): boolean {
  const next = [links.field.value, link].filter(Boolean).join('\n');
  const whole = [text.value.trimEnd(), next].filter(Boolean).join('\n');
  if (links.limit && whole.length > links.limit) return false;
  links.field.value = next;
  links.field.dispatchEvent(new Event('input', { bubbles: true }));
  text.focus();
  return true;
}
/**
 * Emoji and GIF buttons open the chat's floating panel on their own tab: the
 * same emoji grid and KLIPY search, inserting into the post or reply text.
 */
function gifControl(
  controls: HTMLElement,
  input: { text: PostText; links: DraftLinks; access: PostEditorAccess },
): void {
  const emoji = el('button', '', 'post-emoji-button'),
    gif = el('button', 'GIF', 'post-gif-button'),
    status = el('span', '', 'post-gif-status');
  emoji.type = gif.type = 'button';
  emoji.setAttribute('aria-label', t('Choose emoji'));
  emoji.title = t('Emoji');
  emoji.append(communityIcon('emoji'));
  gif.setAttribute('aria-label', t('Choose GIF'));
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
      if (attachLink(input.text, input.links, url)) close();
      else
        host.querySelector('[data-gif-status]')!.textContent = t(
          'Remove some text to add the GIF.',
        );
    });
  // A sticker is attached like a GIF (24/11/2026).
  const stickers = (gifs: GifSearch | null) =>
    stickerPane({
      gifs,
      privacy: consent,
      chosen: (link) => {
        if (!input.access.valid()) return;
        if (!attachLink(input.text, input.links, link))
          status.textContent = t('Remove some text to add the sticker.');
      },
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
          status.textContent = t(
            'GIF search unavailable. You can attach a GIF file.',
          );
          return;
        }
        return emojiIntoComposer(picker, anchor, text, {
          panes: {
            ...(gifs ? { gif: pane(gifs) } : {}),
            sticker: stickers(gifs),
          },
          start,
        });
      })
      .catch(() => {
        if (!input.access.signal.aborted)
          status.textContent = t('Could not open the panel.');
      })
      .finally(() => {
        pending = false;
      });
  };
  emoji.addEventListener('click', () => open(emoji, 'emoji'));
  gif.addEventListener('click', () => open(gif, 'gif'));
}
