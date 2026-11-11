import { t } from '../../shared/i18n/index.ts';
import { showToast } from '../toast/index.ts';
import { paintButton, videoButton, videoToolbar } from './controls.ts';
import { releaseVideoFullscreen, toggleVideoFullscreen } from './fullscreen.ts';

const controlsIdleMs = 2000;

/** Message authors keep ownership of their metadata and can replace it in place. */
export function placeVideoMessageMeta(
  row: HTMLElement,
  meta: HTMLElement,
): void {
  (row.querySelector('.chat-video-meta') ?? row).append(meta);
}

interface ChatVideoOptions {
  video: HTMLVideoElement;
  signal: AbortSignal;
  filename: string;
}

/** Owns the chat controls and their timer. The inline loader still owns the media. */
export function chatVideoStage({
  video,
  signal,
  filename,
}: ChatVideoOptions): HTMLElement {
  const stage = document.createElement('div');
  stage.className = 'chat-video-stage';
  const surface = videoButton('play', t('Play video'));
  surface.className = 'chat-video-surface';
  surface.setAttribute('aria-expanded', 'false');
  const meta = document.createElement('div');
  meta.className = 'chat-video-meta';
  const duration = document.createElement('span');
  duration.className = 'chat-video-duration';
  const toolbar = videoToolbar();
  video.controls = false;
  stage.append(video, surface, duration, meta, toolbar.bar);
  const visibility = controlVisibility({
    stage,
    surface,
    bar: toolbar.bar,
    signal,
  });
  bindControls({
    stage,
    video,
    surface,
    duration,
    toolbar,
    visibility,
    signal,
    filename,
  });
  return stage;
}

function controlVisibility({
  stage,
  surface,
  bar,
  signal,
}: {
  stage: HTMLElement;
  surface: HTMLButtonElement;
  bar: HTMLElement;
  signal: AbortSignal;
}) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  function hide(): void {
    clearTimeout(timeout);
    const restoreFocus =
      !signal.aborted && bar.contains(stage.ownerDocument.activeElement);
    bar.hidden = true;
    delete stage.dataset['controlsVisible'];
    surface.setAttribute('aria-expanded', 'false');
    if (restoreFocus) surface.focus({ preventScroll: true });
  }
  function show(): void {
    if (signal.aborted) return;
    clearTimeout(timeout);
    bar.hidden = false;
    stage.dataset['controlsVisible'] = 'true';
    surface.setAttribute('aria-expanded', 'true');
    timeout = setTimeout(hide, controlsIdleMs);
  }
  signal.addEventListener('abort', hide, { once: true });
  return { hide, show };
}

type Controls = ChatVideoOptions & {
  stage: HTMLElement;
  surface: HTMLButtonElement;
  duration: HTMLElement;
  toolbar: ReturnType<typeof videoToolbar>;
  visibility: ReturnType<typeof controlVisibility>;
};
function bindControls(input: Controls): void {
  const {
    stage,
    video,
    surface,
    duration,
    toolbar,
    visibility,
    signal,
    filename,
  } = input;
  const events = { signal };
  const update = () => updateControls({ video, surface, toolbar, duration });
  surface.addEventListener(
    'click',
    () => {
      visibility.show();
      if (video.paused && !toolbar.play.disabled) play(video);
    },
    events,
  );
  toolbar.play.addEventListener(
    'click',
    () => {
      if (video.paused) play(video);
      else video.pause();
    },
    events,
  );
  toolbar.seek.addEventListener(
    'input',
    () => {
      video.currentTime = Number(toolbar.seek.value);
      visibility.show();
    },
    events,
  );
  toolbar.volume.addEventListener(
    'click',
    () => {
      video.muted = !video.muted;
    },
    events,
  );
  toolbar.save.addEventListener('click', () => save(video, filename), events);
  toolbar.fullscreen.addEventListener(
    'click',
    () => {
      void toggleVideoFullscreen(stage, video).catch(() =>
        showToast(t('Video unavailable. Try again.')),
      );
    },
    events,
  );
  for (const name of ['pointerdown', 'click', 'keydown'])
    toolbar.bar.addEventListener(name, visibility.show, events);
  toolbar.bar.addEventListener(
    'pointermove',
    (event) => {
      if (event.buttons) visibility.show();
    },
    events,
  );
  for (const name of [
    'loadedmetadata',
    'durationchange',
    'timeupdate',
    'play',
    'pause',
    'ended',
    'volumechange',
    'emptied',
    'error',
  ])
    video.addEventListener(name, update, events);
  bindFullscreenEvents(input);
  update();
}

function bindFullscreenEvents({
  stage,
  video,
  toolbar,
  signal,
  visibility,
}: Controls): void {
  stage.addEventListener(
    'fullscreenchange',
    () => {
      const expanded = stage.ownerDocument.fullscreenElement === stage;
      paintButton(
        toolbar.fullscreen,
        expanded ? 'collapse' : 'expand',
        expanded ? t('Exit full screen') : t('Full screen'),
      );
      visibility.show();
    },
    { signal },
  );
  video.addEventListener(
    'webkitendfullscreen',
    () => {
      video.controls = false;
      visibility.hide();
    },
    { signal },
  );
  signal.addEventListener('abort', () => releaseVideoFullscreen(stage, video), {
    once: true,
  });
}

function updateControls({
  video,
  surface,
  toolbar,
  duration,
}: Pick<Controls, 'video' | 'surface' | 'toolbar' | 'duration'>): void {
  const ready = video.readyState >= 1 && !video.error;
  paintButton(
    toolbar.play,
    video.paused ? 'play' : 'pause',
    video.paused ? t('Play video') : t('Pause video'),
  );
  paintButton(
    toolbar.volume,
    video.muted ? 'muted' : 'volume',
    video.muted ? t('Unmute video') : t('Mute video'),
  );
  surface.setAttribute(
    'aria-label',
    video.paused ? t('Play video') : t('Video controls'),
  );
  surface.toggleAttribute('data-playing', !video.paused);
  toolbar.play.disabled =
    toolbar.volume.disabled =
    toolbar.fullscreen.disabled =
    toolbar.save.disabled =
      !ready;
  updateTimeline(video, toolbar.seek, duration, ready);
}
function updateTimeline(
  video: HTMLVideoElement,
  seek: HTMLInputElement,
  duration: HTMLElement,
  ready: boolean,
): void {
  const seconds =
    ready && Number.isFinite(video.duration) ? Math.max(0, video.duration) : 0;
  seek.disabled = !seconds;
  seek.max = String(seconds);
  seek.value = String(seconds ? video.currentTime : 0);
  const time = Math.floor(seconds);
  duration.textContent = time
    ? `${Math.floor(time / 60)}:${String(time % 60).padStart(2, '0')}`
    : '';
}
function play(video: HTMLVideoElement): void {
  void video.play().catch((error: unknown) => {
    if (!(error instanceof DOMException && error.name === 'AbortError'))
      showToast(t('Video unavailable. Try again.'));
  });
}
function save(video: HTMLVideoElement, filename: string): void {
  if (!video.src.startsWith('blob:')) return;
  const link = document.createElement('a');
  link.href = video.src;
  link.download = filename;
  link.click();
}
