import { showPublicAvatar } from '../../src/client/public-media/index.ts';
import { setActiveLanguage } from '../../src/shared/i18n/index.ts';
import type { AppLanguage } from '../../src/shared/i18n/index.ts';
import type { PublicAvatarKind } from '../../src/shared/public-media/index.ts';

// Manual browser regression: real image loader and app CSS, synthetic PNG only.
function check(value: boolean, message: string): void {
  if (!value) throw new Error(message);
}
function imageOf(frame: HTMLElement): HTMLImageElement {
  const image = frame.querySelector<HTMLImageElement>('img:not([hidden])');
  if (!image) throw new Error('Synthetic image has not loaded.');
  return image;
}
function verifyCoverage(frame: HTMLElement, image: HTMLImageElement): void {
  const actual = image.getBoundingClientRect();
  check(
    Math.abs(actual.width - frame.clientWidth) < 1 &&
      Math.abs(actual.height - frame.clientHeight) < 1,
    'Image must fill the entire frame.',
  );
}
function verifyBanner(frame: HTMLElement): void {
  const image = imageOf(frame),
    box = frame.getBoundingClientRect();
  verifyCoverage(frame, image);
  check(
    Math.abs(box.width / box.height - 3) < 0.02,
    'Banner must preserve its 3:1 editor frame.',
  );
  check(
    document.elementFromPoint(box.left + 12, box.top + 12) === image,
    'Banner corner is cut out by an avatar mask.',
  );
}
function verifyAvatar(frame: HTMLElement): void {
  const image = imageOf(frame),
    box = frame.getBoundingClientRect(),
    style = getComputedStyle(frame),
    border = Number.parseFloat(style.borderLeftWidth),
    radius = style.borderTopLeftRadius.endsWith('%')
      ? (box.width * Number.parseFloat(style.borderTopLeftRadius)) / 100
      : Number.parseFloat(style.borderTopLeftRadius),
    offset = border + (radius - border / 2) * (1 - Math.SQRT1_2);
  verifyCoverage(frame, image);
  check(
    document.elementFromPoint(box.left + offset, box.top + offset) === image,
    'Photo leaves a gap inside the rounded frame border.',
  );
}
function verifyFrame(frame: HTMLElement): void {
  frame.scrollIntoView({ block: 'center' });
  if (frame.dataset['kind']?.endsWith('banner')) verifyBanner(frame);
  else verifyAvatar(frame);
  check(
    getComputedStyle(frame).backgroundImage === 'none',
    'Loaded image exposes its generated placeholder gradient.',
  );
}

export function publicImageFramesFixture(
  root: HTMLElement,
  language: AppLanguage,
) {
  setActiveLanguage(language);
  document.documentElement.lang = language;
  // Ignore the decorative overlay during hit testing; retain every image rule.
  root.innerHTML = `<style>
    #app-shell { display: block; padding: 16px; height: auto; overflow: visible; }
    #app-shell > main, #feed-panel { display: block; position: static; width: 100%; height: auto; overflow: visible; }
    #feed-panel { margin-top: 24px; }
    .hover-card { position: static; display: block; width: auto; margin-top: 24px; }
    .community-banner::after { pointer-events: none; }
    [data-fallback] { margin-top: 24px; }
  </style><div id="app-shell" class="app" data-page="comunidades">
    <main data-communities>
      <section class="community-hero">
        <div class="community-banner" data-tone="1" data-kind="community-banner"></div>
        <div class="community-hero-head"><span class="community-avatar" data-tone="1" data-kind="community-photo"></span><div class="community-hero-title"><h1>Synthetic community</h1></div></div>
      </section>
      <section class="public-profile-header">
        <div class="public-profile-banner" data-kind="profile-banner"></div>
        <div class="public-profile-identity"><div class="public-profile-avatar" data-kind="avatar"></div></div>
      </section>
    </main>
    <aside id="feed-panel" class="feed-panel">
      <section class="community-hero">
        <div class="community-banner" data-tone="1" data-kind="community-banner"></div>
        <div class="community-hero-head"><span class="community-avatar" data-tone="1" data-kind="community-photo"></span><div class="community-hero-title"><h1>Synthetic panel</h1></div></div>
      </section>
    </aside>
    <aside class="hover-card"><div class="community-banner hover-card-banner" data-tone="1" data-kind="community-banner"></div></aside>
    <aside class="hover-card"><div class="public-profile-banner hover-card-banner" data-kind="profile-banner"></div></aside>
    <div class="community-banner" data-tone="1" data-fallback></div>
  </div>`;
  const lifetime = new AbortController(),
    frames = [...root.querySelectorAll<HTMLElement>('[data-kind]')],
    fallback = root.querySelector<HTMLElement>('[data-fallback]')!;
  for (const frame of frames) {
    const kind = frame.dataset['kind'] as PublicAvatarKind,
      target = crypto.randomUUID(),
      reference = `/api/public-media/${kind}/${target}/${crypto.randomUUID()}`;
    showPublicAvatar(frame, {
      kind,
      target,
      reference,
      signal: lifetime.signal,
    });
  }
  return {
    verify: () => {
      for (const frame of frames) verifyFrame(frame);
      check(
        getComputedStyle(fallback).backgroundImage.includes('linear-gradient'),
        'Missing image must preserve the generated placeholder.',
      );
      check(
        document.documentElement.scrollWidth <= innerWidth,
        'Image frames must not cause horizontal overflow.',
      );
      return { frames: frames.length, placeholderPreserved: true };
    },
    close: () => {
      lifetime.abort();
      check(
        root.querySelectorAll('img').length === 0,
        'Images must be removed.',
      );
      check(
        frames
          .filter((frame) => frame.dataset['kind']?.startsWith('community'))
          .every((frame) =>
            getComputedStyle(frame).backgroundImage.includes('linear-gradient'),
          ),
        'Image cleanup must restore generated placeholders.',
      );
    },
  };
}
