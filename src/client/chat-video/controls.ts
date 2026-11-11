import { t } from '../../shared/i18n/index.ts';

const icons = {
  play: '<path fill="currentColor" stroke="none" d="M8 5v14l11-7z"/>',
  pause: '<path d="M9 5v14m6-14v14"/>',
  volume:
    '<path d="M4 10v4h4l5 4V6l-5 4zm12-1a4 4 0 0 1 0 6m2-8a7 7 0 0 1 0 10"/>',
  muted: '<path d="M4 10v4h4l5 4V6l-5 4zm12 0 4 4m0-4-4 4"/>',
  expand: '<path d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5"/>',
  collapse: '<path d="M9 4v5H4m11-5v5h5m-5 11v-5h5M9 20v-5H4"/>',
  save: '<path d="M12 4v11m-4-4 4 4 4-4M5 16v4h14v-4"/>',
} as const;
type Icon = keyof typeof icons;

export function paintButton(
  button: HTMLButtonElement,
  icon: Icon,
  label: string,
): void {
  if (button.dataset['icon'] !== icon) {
    button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[icon]}</svg>`;
    button.dataset['icon'] = icon;
  }
  button.setAttribute('aria-label', label);
  button.title = label;
}
export function videoButton(icon: Icon, label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  paintButton(button, icon, label);
  return button;
}

export function videoToolbar(): {
  bar: HTMLElement;
  play: HTMLButtonElement;
  seek: HTMLInputElement;
  volume: HTMLButtonElement;
  fullscreen: HTMLButtonElement;
  save: HTMLButtonElement;
} {
  const bar = document.createElement('div');
  bar.className = 'chat-video-toolbar';
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', t('Video controls'));
  bar.hidden = true;
  const play = videoButton('play', t('Play video'));
  const volume = videoButton('volume', t('Mute video'));
  const fullscreen = videoButton('expand', t('Full screen'));
  const save = videoButton('save', t('Save on device'));
  const seek = document.createElement('input');
  seek.type = 'range';
  seek.min = '0';
  seek.max = '0';
  seek.step = 'any';
  seek.value = '0';
  seek.setAttribute('aria-label', t('Video position'));
  bar.append(play, volume, save, fullscreen, seek);
  return { bar, play, seek, volume, fullscreen, save };
}
