import { t } from '../../shared/i18n/index.ts';
import {
  klipyStickerUrl,
  stickerReference,
} from '../../shared/stickers/index.ts';
import type { StickerReference } from '../../shared/stickers/index.ts';
import { externalMediaGate } from '../external-media/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import { pingStickerMarkup } from '../ping/index.ts';
import { pingPose, pingStickerName } from './ping-pack.ts';
import { publicStickerImage } from './public-images.ts';

/**
 * Draws sticker references. Ping stickers are app artwork; KLIPY stickers
 * load from KLIPY only under the viewer's external-media consent, like GIFs;
 * public stickers load from 0xDMme after moderation.
 */
export interface StickerDisplay {
  privacy?: ExternalMediaConsent | undefined;
  signal: AbortSignal;
  /** Tapping a drawn sticker (save it, see its pack). */
  open?: ((sticker: StickerReference) => void) | undefined;
}

export function stickerName(sticker: StickerReference): string {
  const pose = sticker.source === 'ping' ? pingPose(sticker.id) : null;
  return pose ? t('Sticker: {0}', [pingStickerName(pose)]) : t('Sticker');
}

function fallbackLink(host: HTMLElement, sticker: StickerReference): void {
  const link = document.createElement('a');
  link.className = 'chat-sticker-link';
  link.href = sticker.link;
  link.textContent = t('Sticker');
  host.replaceChildren(link);
}

function stickerImage(host: HTMLElement, source: string): void {
  const image = document.createElement('img');
  image.alt = '';
  image.decoding = 'async';
  image.referrerPolicy = 'no-referrer';
  image.draggable = false;
  image.addEventListener(
    'error',
    () => {
      if (!host.isConnected) return;
      const status = document.createElement('small');
      status.textContent = t('Sticker unavailable.');
      host.replaceChildren(status);
    },
    { once: true },
  );
  image.src = source;
  host.replaceChildren(image);
}

function drawKlipy(
  host: HTMLElement,
  sticker: StickerReference,
  display: StickerDisplay,
): void {
  if (!display.privacy) return fallbackLink(host, sticker);
  fallbackLink(host, sticker);
  externalMediaGate(host, {
    consent: display.privacy,
    kind: 'gifs',
    signal: display.signal,
    label: t('Show sticker'),
    automatic: true,
    render: (target) => stickerImage(target, klipyStickerUrl(sticker.id)),
  });
}

function drawPublic(
  host: HTMLElement,
  sticker: StickerReference,
  signal: AbortSignal,
): void {
  host.dataset['loading'] = 'true';
  publicStickerImage(sticker.id, signal).then(
    (url) => {
      delete host.dataset['loading'];
      if (!signal.aborted) stickerImage(host, url);
    },
    () => {
      delete host.dataset['loading'];
      if (signal.aborted || !host.isConnected) return;
      const status = document.createElement('small');
      status.textContent = t('Sticker unavailable.');
      host.replaceChildren(status);
    },
  );
}

function draw(
  host: HTMLElement,
  sticker: StickerReference,
  display: StickerDisplay,
): void {
  if (sticker.source === 'klipy') return drawKlipy(host, sticker, display);
  if (sticker.source === 'public')
    return drawPublic(host, sticker, display.signal);
  const pose = pingPose(sticker.id);
  if (pose) host.innerHTML = pingStickerMarkup(pose);
  else fallbackLink(host, sticker);
}

/** One sticker as an inline figure; a button when the caller can open it. */
export function stickerFigure(
  sticker: StickerReference,
  display: StickerDisplay,
): HTMLElement {
  // Only public stickers have something to show when tapped (save, pack).
  const open = sticker.source === 'public' ? display.open : undefined;
  const figure = document.createElement(open ? 'button' : 'span');
  figure.className = 'chat-sticker';
  figure.dataset['stickerSource'] = sticker.source;
  figure.setAttribute('aria-label', stickerName(sticker));
  if (!open) figure.setAttribute('role', 'img');
  else {
    (figure as HTMLButtonElement).type = 'button';
    figure.addEventListener('click', (event) => {
      event.stopPropagation();
      open(sticker);
    });
  }
  const art = document.createElement('span');
  art.className = 'chat-sticker-art';
  figure.append(art);
  draw(art, sticker, display);
  return figure;
}

/**
 * A message whose whole text is one sticker link becomes that sticker, with
 * no bubble. Returns false for any other text, which the caller renders.
 */
export function renderStickerMessage(
  host: HTMLElement,
  text: string,
  display: StickerDisplay,
): boolean {
  const sticker = stickerReference(text);
  if (!sticker) return false;
  host.classList.add('sticker-only');
  host.replaceChildren(stickerFigure(sticker, display));
  return true;
}

/** Stickers of a post or reply, drawn below its text. */
export function appendStickers(
  host: HTMLElement,
  stickers: readonly StickerReference[],
  display: StickerDisplay,
): void {
  if (!stickers.length) return;
  const row = document.createElement('span');
  row.className = 'text-stickers';
  for (const sticker of stickers) row.append(stickerFigure(sticker, display));
  host.append(row);
}

/**
 * What the enlarged view shows for a drawn sticker: its loaded picture, or
 * the Ping artwork as an SVG file. Null while it is still loading or failed.
 * The caller revokes a returned `owned` URL when it is done.
 */
export function stickerViewSource(
  figure: HTMLElement,
): { url: string; owned: boolean } | null {
  const art = figure.querySelector('.chat-sticker-art');
  const image = art?.querySelector('img');
  if (image?.complete && image.naturalWidth)
    return { url: image.src, owned: false };
  const svg = art?.querySelector<SVGSVGElement>('svg.ping-sticker');
  if (!svg) return null;
  const markup = new XMLSerializer().serializeToString(standaloneSvg(svg));
  return {
    url: URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' })),
    owned: true,
  };
}

/** Paint that Ping takes from the page's CSS, copied onto a standalone file. */
const svgPaint = [
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stop-color',
  'opacity',
];
function standaloneSvg(svg: SVGSVGElement): SVGSVGElement {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  const box = svg.viewBox.baseVal;
  // A large intrinsic size, so the viewer does not show a 300×150 default.
  copy.setAttribute('width', String(Math.round(box.width * 5)));
  copy.setAttribute('height', String(Math.round(box.height * 5)));
  const sources = [svg, ...svg.querySelectorAll('*')],
    targets = [copy, ...copy.querySelectorAll('*')];
  sources.forEach((source, index) => {
    const style = getComputedStyle(source);
    targets[index]!.setAttribute(
      'style',
      svgPaint
        .map((name) => `${name}:${style.getPropertyValue(name)}`)
        .join(';'),
    );
  });
  return copy;
}
