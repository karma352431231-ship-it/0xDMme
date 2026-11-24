import {
  badge,
  badges,
  clasp,
  dotEye,
  faces,
  happyEye,
  line,
  pingBody,
  pingGradient,
  roundEye,
  salutingHand,
  typingDots,
} from './art.ts';

/**
 * Ping's sticker poses (owner decision of 24/11/2026): the same character,
 * bigger feelings and a few props, drawn on Ping's own coordinates. Colors
 * come from the Ping tokens, so a sticker reads the same in every theme.
 */
export const pingStickerPoses = [
  'hi',
  'love',
  'lol',
  'thumbs',
  'sad',
  'angry',
  'wow',
  'thinking',
  'cool',
  'party',
  'gm',
  'moon',
  'sleepy',
  'typing',
  'wink',
  'salute',
] as const;
export type PingStickerPose = (typeof pingStickerPoses)[number];

function heart(x: number, y: number, scale: number, tone = 'heart'): string {
  return `<path class="ping-sticker-${tone}" transform="translate(${x} ${y}) scale(${scale})" d="M0 3.4C-1.7 1.8-5.2-.6-5.2-3.3c0-2.1 1.6-3.4 3.3-3.4 1 0 1.6.6 1.9 1.2.3-.6.9-1.2 1.9-1.2 1.7 0 3.3 1.3 3.3 3.4 0 2.7-3.5 5.1-5.2 6.7z"/>`;
}
function tear(x: number, y: number, scale = 1): string {
  return `<path class="ping-sticker-tear" transform="translate(${x} ${y}) scale(${scale})" d="M0-4.2C2.3-1 3.1.6 3.1 2a3.1 3.1 0 0 1-6.2 0C-3.1.6-2.3-1 0-4.2z"/>`;
}
const openSmile =
  '<path class="ping-face ping-solid" d="M33.5 51.2 Q39.5 61.5 45.5 51.2 Z" stroke-width="1.6"/>';

/** An open palm raised beside the bubble, with two motion marks. */
function wavingHand(paint: string): string {
  const finger = (x: number, height: number): string =>
    `<rect class="ping-seam" x="${x}" y="${-height}" width="2.6" height="${height + 2}" rx="1.3" fill="${paint}" stroke-width="0.7"/>`;
  return `<g transform="translate(15.5 41) rotate(-12)">
    <path d="M4.6 8 L6.4 20" fill="none" stroke="${paint}" stroke-width="4.6" stroke-linecap="round"/>
    <rect class="ping-seam" x="-0.4" y="-1" width="10.4" height="10" rx="3" fill="${paint}" stroke-width="1.4" paint-order="stroke"/>
    ${finger(-0.2, 7.5)}${finger(2.4, 9.4)}${finger(5, 9)}${finger(7.6, 7)}
    <rect class="ping-seam" x="-4.2" y="2" width="6" height="2.6" rx="1.3" transform="rotate(-38 -1.2 3.3)" fill="${paint}" stroke-width="0.7"/>
  </g>${line('M8 31 Q5.8 34.6 7.2 38.6', 2)}${line('M12 25.6 Q9.2 27.8 9.4 31', 2)}`;
}

/** A closed fist with the thumb up, low beside the bubble. */
function thumbsUp(paint: string): string {
  const knuckle = (y: number): string =>
    `<rect class="ping-seam" x="4" y="${y}" width="11" height="3.2" rx="1.6" fill="${paint}" stroke-width="0.8"/>`;
  return `<g transform="translate(5 50)">
    <rect class="ping-seam" x="6.5" y="-9" width="4.4" height="12" rx="2.2" fill="${paint}" stroke-width="1.2" paint-order="stroke"/>
    <rect class="ping-seam" x="2.4" y="1.4" width="13" height="14" rx="3.4" fill="${paint}" stroke-width="1.4" paint-order="stroke"/>
    ${knuckle(4.4)}${knuckle(7.8)}${knuckle(11.2)}
  </g>`;
}

function sunglasses(): string {
  const lens = (x: number): string =>
    `<path class="ping-face" d="M${x - 6} 41.6 H${x + 6} V44.8 Q${x + 6} 50.2 ${x} 50.2 Q${x - 6} 50.2 ${x - 6} 44.8 Z"/><path class="ping-sticker-glint" d="M${x - 3.6} 43.6 L${x - 1} 43.6" stroke-width="1.6" stroke-linecap="round"/>`;
  return `${lens(33)}${lens(46.4)}${line('M39 43 H40.4', 2.2)}${line('M35 55 Q40 57.6 45 54', 2.4)}`;
}

function partyHat(paint: string): string {
  return `<g transform="rotate(-18 34 26)">
    <path d="M27 27.5 L35 7 L43 27.5 Z" fill="${paint}" stroke="var(--ping-body)" stroke-width="1.4" stroke-linejoin="round"/>
    ${line('M30.2 20 L39.6 20', 1.6)}${line('M32.6 13.6 L37.4 13.6', 1.6)}
    <circle class="ping-sticker-sun" cx="35" cy="6" r="2.6"/>
  </g>`;
}
function confetti(): string {
  const bit = (x: number, y: number, tone: string, turn: number): string =>
    `<rect class="ping-sticker-${tone}" x="${x}" y="${y}" width="3.4" height="1.8" rx="0.9" transform="rotate(${turn} ${x} ${y})"/>`;
  return (
    bit(9, 30, 'heart', 30) +
    bit(14, 20, 'sun', -20) +
    bit(54, 16, 'tear', 40) +
    bit(64, 22, 'heart', -30) +
    bit(10, 62, 'tear', 10) +
    bit(86, 66, 'sun', 50)
  );
}

function sunBadge(): string {
  const rays = [0, 45, 90, 135, 180, 225, 270, 315]
    .map(
      (turn) =>
        `<path class="ping-sticker-ray" d="M79 11.2 V14.4" stroke-width="2.2" stroke-linecap="round" transform="rotate(${turn} 79 25)"/>`,
    )
    .join('');
  return `${rays}<circle class="ping-cut" cx="79" cy="25" r="9.6" fill="none" stroke-width="2.6"/><circle class="ping-sticker-sun" cx="79" cy="25" r="8.4"/><text class="ping-alert-ink" x="79" y="28.4" text-anchor="middle" font-weight="800" font-size="8.6">GM</text>`;
}

function rocket(paint: string): string {
  return `<g transform="translate(79 22) rotate(40)">
    <path class="ping-sticker-flame" d="M-2.6 9 Q0 17 2.6 9 Z"/>
    <path d="M0 -11 Q5.4 -5 4.4 6 L-4.4 6 Q-5.4 -5 0 -11 Z" fill="${paint}" stroke="var(--ping-body)" stroke-width="1.4"/>
    <path d="M-4.4 3 L-8 8.6 L-3.6 7.4 Z M4.4 3 L8 8.6 L3.6 7.4 Z" fill="${paint}" stroke="var(--ping-body)" stroke-width="1"/>
    <circle class="ping-face" cx="0" cy="-2.6" r="2.2"/>
  </g>${line('M66 39 L70 35', 1.8)}${line('M62.6 33.4 L66.4 29.6', 1.8)}`;
}

function thoughtDots(): string {
  return '<circle class="ping-face" cx="62" cy="24" r="2"/><circle class="ping-face" cx="68.6" cy="17.6" r="2.8"/><circle class="ping-face" cx="77" cy="10.4" r="3.8"/>';
}

const poseFaces: Record<PingStickerPose, string> = {
  hi: faces.hello,
  love: heart(33, 46.6, 0.92) + heart(46.4, 46.6, 0.92) + openSmile,
  lol:
    happyEye(33) +
    happyEye(46) +
    openSmile +
    tear(27.2, 50.4, 0.8) +
    tear(51.8, 50.4, 0.8),
  thumbs:
    dotEye(34, 45.5) + dotEye(47, 45.5) + line('M36 52.6 Q41 57.4 46 52.6'),
  sad:
    dotEye(33, 46.4, 3) +
    dotEye(46, 46.4, 3) +
    line('M28.6 40.4 L34.6 38.6', 2.2) +
    line('M50.4 40.4 L44.4 38.6', 2.2) +
    line('M35 57 Q39.5 52.6 44 57') +
    tear(33, 54.6, 0.8),
  angry:
    dotEye(33, 47) +
    dotEye(46, 47) +
    line('M28 39.6 L36.4 43', 2.6) +
    line('M51 39.6 L42.6 43', 2.6) +
    line('M35 57.4 Q39.5 53.4 44 57.4'),
  wow:
    roundEye(33, 4.8) +
    roundEye(46, 4.8) +
    '<ellipse class="ping-face" cx="39.5" cy="57" rx="3.2" ry="4"/>',
  thinking:
    dotEye(34, 44.4) +
    dotEye(47, 44.4) +
    line('M41.6 38.8 L48.6 37.2') +
    line('M35.6 55 H42.4'),
  cool: sunglasses(),
  party: happyEye(33) + happyEye(46) + openSmile,
  gm: happyEye(33) + happyEye(46) + line('M35 52.5 Q39.5 57 44 52.5'),
  moon:
    roundEye(33, 4.2, 0.8) +
    roundEye(46, 4.2, 0.8) +
    '<path class="ping-face ping-solid" d="M34.5 52.8 Q39.5 59.4 44.5 52.8 Z" stroke-width="1.6"/>',
  sleepy: faces.sleepy,
  typing: '',
  wink: faces.wink,
  salute: faces.salute,
};

function props(pose: PingStickerPose, paint: string): string {
  switch (pose) {
    case 'hi':
      return wavingHand(paint);
    case 'thumbs':
      return thumbsUp(paint);
    case 'party':
      return partyHat(paint) + confetti();
    case 'thinking':
      return thoughtDots();
    case 'salute':
      return salutingHand(paint);
    case 'typing':
      return typingDots(paint);
    default:
      return '';
  }
}

function corner(pose: PingStickerPose, paint: string): string {
  if (pose === 'gm') return sunBadge();
  if (pose === 'moon') return rocket(paint);
  if (pose === 'love') return heart(79, 26, 1.5);
  if (pose === 'angry') return badge('!', paint);
  if (pose === 'sleepy' || pose === 'wink') return badge(badges[pose], paint);
  return '';
}

/** Decorative markup; the message names the sticker for screen readers. */
export function pingStickerMarkup(pose: PingStickerPose): string {
  const { defs, paint } = pingGradient();
  return `<svg class="ping ping-sticker" data-sticker-pose="${pose}" viewBox="2 4 94 84" aria-hidden="true" focusable="false">${defs}${pingBody(paint)}${poseFaces[pose]}${props(pose, paint)}${clasp(paint, pose === 'salute')}${corner(pose, paint)}</svg>`;
}
