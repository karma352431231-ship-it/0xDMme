import type { ProfileCard } from '../message-profile/index.ts';
let active = 0;
const waiting: Array<() => void> = [];
async function slot(signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return false;
  if (active < 2) {
    active++;
    return true;
  }
  return new Promise<boolean>((resolve) => {
    const resume = () => {
      signal.removeEventListener('abort', cancel);
      active++;
      resolve(true);
    };
    const cancel = () => {
      const i = waiting.indexOf(resume);
      if (i >= 0) waiting.splice(i, 1);
      resolve(false);
    };
    waiting.push(resume);
    signal.addEventListener('abort', cancel, { once: true });
  });
}
/** Visible photos use local cards only; cancellation releases both requests and blob URLs. */
export function observeForwardPhoto(input: {
  host: HTMLElement;
  load: () => Promise<ProfileCard | null>;
  signal: AbortSignal;
  failed: (error: unknown) => void;
}): void {
  let started = false;
  const show = () => {
    if (started || input.signal.aborted) return;
    started = true;
    void loadPhoto(input).catch((error) => {
      if (!input.signal.aborted) input.failed(error);
    });
  };
  const observer =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer?.disconnect();
            show();
          }
        });
  input.signal.addEventListener('abort', () => observer?.disconnect(), {
    once: true,
  });
  if (observer) observer.observe(input.host);
  else show();
}
async function loadPhoto(
  input: Parameters<typeof observeForwardPhoto>[0],
): Promise<void> {
  if (!(await slot(input.signal))) return;
  try {
    const photo = (await input.load())?.photo;
    if (!photo) return;
    try {
      if (input.signal.aborted) return;
      const url = URL.createObjectURL(
        new Blob([photo.bytes], { type: photo.type }),
      );
      input.signal.addEventListener('abort', () => URL.revokeObjectURL(url), {
        once: true,
      });
      const image = document.createElement('img');
      image.alt = '';
      image.src = url;
      input.host.replaceChildren(image);
    } finally {
      photo.bytes.fill(0);
    }
  } finally {
    active--;
    waiting.shift()?.();
  }
}
