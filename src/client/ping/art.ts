/**
 * Ping, the 0xDMme character: the logo's chat bubble with a face.
 * It only marks empty, waiting, warning and confirmation moments, one per
 * screen, and never sits inside people's messages (docs/UI_PAINEIS_E_TEMAS.md).
 * Markup is authored here; text passed in is escaped, never parsed.
 */
export type PingMood =
  | 'hello'
  | 'typing'
  | 'happy'
  | 'sleepy'
  | 'alert'
  | 'puzzled'
  | 'offline'
  | 'salute'
  | 'wink';
export type PingSize = 'sm' | 'md' | 'lg';

const body =
  'M30 28 H72 Q80 28 80 36 V60 Q80 68 72 68 H44 L30 79 V68 Q22 68 22 60 V36 Q22 28 30 28 Z';
const line = (d: string, width = 2.6): string =>
  `<path class="ping-line" d="${d}" stroke-width="${width}"/>`;
const dotEye = (x: number, y = 45.5, r = 3.3): string =>
  `<circle class="ping-face" cx="${x}" cy="${y}" r="${r}"/>`;
const happyEye = (x: number): string =>
  line(`M${x - 3.6} 47 L${x} 42.8 L${x + 3.6} 47`);
const roundEye = (x: number, radius: number, look = 0): string =>
  `${dotEye(x, 45.5, radius)}<circle class="ping-pupil" cx="${x + look}" cy="46" r="${radius * 0.45}"/>`;

const smile = line('M35 52.5 Q39.5 57 44 52.5');
const faces: Record<PingMood, string> = {
  hello: dotEye(33) + dotEye(46) + smile,
  typing: '',
  happy:
    happyEye(33) +
    happyEye(46) +
    '<path class="ping-face ping-solid" d="M34.5 51.5 Q39.5 59.8 44.5 51.5 Z" stroke-width="1.6"/>',
  sleepy:
    line('M29.4 45 Q33 48.4 36.6 45') +
    line('M42.4 45 Q46 48.4 49.6 45') +
    '<ellipse class="ping-line" cx="39.5" cy="54.2" rx="1.9" ry="2.3" stroke-width="2.2"/>',
  alert: roundEye(33, 4.8) + roundEye(46, 4.8) + line('M35.5 55 H43.5'),
  puzzled:
    dotEye(33) +
    dotEye(46) +
    line('M42.6 39.8 L49.6 38.2') +
    line('M34.5 55 Q37 52.8 39.5 55 Q42 57.2 44.5 55'),
  offline:
    dotEye(34.2, 43.8, 3.1) +
    dotEye(47.2, 43.8, 3.1) +
    line('M30.5 38.6 L35.5 37.6 M43.5 37.6 L48.5 38.6', 2.2) +
    line('M37 55.5 H42.5'),
  salute:
    dotEye(33.5, 46.5) + dotEye(46.5, 46.5) + line('M35.5 54 Q40 56.8 44.5 54'),
  wink:
    dotEye(33) + line('M42.4 45.5 H49.6') + line('M35 53.2 Q40.5 57 45 51.8'),
};
const badges: Partial<Record<PingMood, string>> = {
  hello: '1',
  wink: '1',
  happy: 'check',
  sleepy: 'z',
  alert: '!',
  puzzled: '?',
};

function typingDots(paint: string): string {
  return `<g class="ping-typing" fill="${paint}"><circle cx="31" cy="49" r="3.3"/><circle cx="39.5" cy="49" r="3.3"/><circle cx="48" cy="49" r="3.3"/></g>`;
}

/** 🫡: a flat hand on the forehead, above the eyes, with the wrist outside the bubble. */
function salutingHand(paint: string): string {
  const finger = (y: number, width: number): string =>
    `<rect class="ping-seam" x="6" y="${y}" width="${width}" height="2.4" rx="1.2" fill="${paint}" stroke-width="0.7"/>`;
  return `<g transform="translate(19.6 34.4) rotate(-8) scale(1.12)">
    <path d="M0.8 4.6 L-6 15.6" fill="none" stroke="${paint}" stroke-width="4.6" stroke-linecap="round"/>
    <rect class="ping-seam" x="0" y="0" width="9.5" height="7.2" rx="2.4" fill="${paint}" stroke-width="1.6" paint-order="stroke"/>
    ${finger(0, 12.2)}${finger(2.4, 13.4)}${finger(4.8, 11.8)}
  </g>`;
}

function clasp(paint: string, locked: boolean): string {
  const pill = `<rect class="ping-body" x="55" y="40" width="32" height="18" rx="9" stroke="${paint}" stroke-width="3.6"/>`;
  if (locked)
    return `${pill}<path d="M68 47 V45.2 a3 3 0 0 1 6 0 V47" fill="none" stroke="${paint}" stroke-width="2"/><rect x="66.4" y="46.6" width="9.2" height="7" rx="1.6" fill="${paint}"/>`;
  return `${pill}<g transform="translate(64.3 48.8) scale(0.56)" stroke="${paint}" stroke-linecap="round" fill="none"><ellipse cx="6.2" cy="0" rx="6.2" ry="8.6" stroke-width="4.2"/><path d="M2.8 5.4 L9.6 -5.4" stroke-width="3"/><path d="M16 -3.4 L26 8.6 M26 -3.4 L16 8.6" stroke-width="4.4"/></g>`;
}

function badge(kind: string | undefined, paint: string): string {
  if (!kind) return '';
  const alert = kind === '!';
  const content =
    kind === 'check'
      ? '<path class="ping-badge-mark" d="M74.6 27.4 L77.8 30.5 L83.4 23.9" fill="none" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"/>'
      : `<text class="${alert ? 'ping-alert-ink' : 'ping-badge-ink'}" x="79" y="31.2" text-anchor="middle" font-weight="800" font-size="12">${kind}</text>`;
  return `<circle class="ping-cut" cx="79" cy="27" r="10.4" fill="none" stroke-width="2.8"/><circle class="${alert ? 'ping-alert' : 'ping-badge'}" cx="79" cy="27" r="9" fill="${paint}"/>${content}`;
}

let serial = 0;

/** Decorative SVG string for authored templates; screen readers skip it. */
export function pingMarkup(mood: PingMood, size: PingSize = 'md'): string {
  serial += 1;
  const id = `ping-gradient-${serial}`;
  const paint = `url(#${id})`;
  const view = mood === 'salute' ? '9 14 83 68' : '18 14 74 68';
  return `<svg class="ping ping-${size}" data-ping="${mood}" viewBox="${view}" aria-hidden="true" focusable="false"><defs><linearGradient id="${id}" x1="10" y1="10" x2="90" y2="90" gradientUnits="userSpaceOnUse"><stop class="ping-stop-1" offset="0"/><stop class="ping-stop-2" offset=".5"/><stop class="ping-stop-3" offset="1"/></linearGradient></defs><path class="ping-body" d="${body}" stroke="${paint}" stroke-width="4.5" stroke-linejoin="round"/>${mood === 'typing' ? typingDots(paint) : faces[mood]}${mood === 'salute' ? salutingHand(paint) : ''}${clasp(paint, mood === 'salute')}${badge(badges[mood], paint)}</svg>`;
}

export function pingElement(mood: PingMood, size: PingSize = 'md'): Element {
  const holder = document.createElement('template');
  holder.innerHTML = pingMarkup(mood, size);
  return holder.content.firstElementChild!;
}

/** Empty state: the character above a short line of app text. */
export function pingNotice(
  mood: PingMood,
  text: string,
  className: string,
): HTMLElement {
  const notice = document.createElement('div');
  notice.className = `ping-notice ${className}`;
  const copy = document.createElement('p');
  copy.textContent = text;
  notice.append(pingElement(mood, 'md'), copy);
  return notice;
}

function escaped(text: string): string {
  return text
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;');
}

/** One-line chip for authored templates, such as the start of a conversation. */
export function pingChipMarkup(
  mood: PingMood,
  text: string,
  tone: 'calm' | 'warn' = 'calm',
): string {
  return `<p class="ping-chip" data-tone="${tone}">${pingMarkup(mood, 'sm')}<span>${escaped(text)}</span></p>`;
}

/** Keeps at most one character as the first child of a host and swaps its mood. */
export function syncPing(
  host: Element,
  mood: PingMood | null,
  size: PingSize = 'md',
): void {
  const current = host.querySelector(':scope > [data-ping]');
  if (current?.getAttribute('data-ping') === mood) return;
  current?.remove();
  if (mood) host.prepend(pingElement(mood, size));
}
